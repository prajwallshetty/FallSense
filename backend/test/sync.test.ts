import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { retryPendingNotifications } from '../src/notifications';
import { api, incident, login, startWorld, World } from './helpers';

describe('sensor and status sync', () => {
  let w: World;
  let user: string;
  let other: string;
  let care: string;

  before(async () => {
    w = await startWorld();
    user = (await login(w, w.asha.code, 'user')).accessToken;
    other = (await login(w, w.ben.code, 'user')).accessToken;
    care = (await login(w, w.ravi.code, 'caretaker')).accessToken;
  });
  after(async () => { await w.close(); });

  const reading = { epoch: 1793363492, x: -0.353, y: -0.231, z: -0.781 };

  it('stores the exact watch fields and keeps negative values', async () => {
    const r = await api(w.url, '/v1/sync/readings', { token: user, body: { readings: [reading] } });
    assert.deepEqual(r.body, { received: 1, stored: 1 });
    const { rows } = await w.db.query<any>('select * from sensor_readings where user_id = $1', [w.asha.id]);
    assert.equal(rows[0].x, -0.353);
    assert.equal(rows[0].y, -0.231);
    assert.equal(rows[0].z, -0.781);
    assert.equal(Number(rows[0].watch_epoch), 1793363492);
    assert.equal(new Date(rows[0].timestamp).toISOString(), '2026-10-30T12:31:32.000Z');
  });

  it('ignores duplicates on retry', async () => {
    const r = await api(w.url, '/v1/sync/readings', { token: user, body: { readings: [reading] } });
    assert.deepEqual(r.body, { received: 1, stored: 0 });
  });

  it('keeps two different readings in the same firmware second', async () => {
    const r = await api(w.url, '/v1/sync/readings', { token: user, body: { readings: [{ ...reading, x: -0.4 }] } });
    assert.equal(r.body.stored, 1);
  });

  it('always stores under the token owner, ignoring any user id in the body', async () => {
    await api(w.url, '/v1/sync/readings', { token: other, body: { userId: w.asha.id, readings: [{ ...reading, epoch: 1793363999 }] } });
    const { rows } = await w.db.query<any>('select user_id from sensor_readings where watch_epoch = 1793363999');
    assert.equal(rows[0].user_id, w.ben.id);
  });

  it('rejects non-numeric, out-of-range, and missing values', async () => {
    for (const bad of [{ ...reading, x: 'a' }, { ...reading, y: null }, { ...reading, z: 1e9 }, { x: 1, y: 2, z: 3 }, { ...reading, epoch: 1.5 }]) {
      assert.equal((await api(w.url, '/v1/sync/readings', { token: user, body: { readings: [bad] } })).status, 400);
    }
  });

  it('does not let caretakers write readings', async () => {
    assert.equal((await api(w.url, '/v1/sync/readings', { token: care, body: { readings: [reading] } })).status, 403);
  });

  it('reports device status to linked caretakers and hides it from strangers', async () => {
    const body = { watchConnectionStatus: 'connected', safetyState: 'NORMAL', lastSync: 1793363492000, latest: reading };
    assert.equal((await api(w.url, '/v1/sync/status', { token: user, body })).status, 204);
    const o = await api(w.url, '/v1/caretaker/overview', { token: care });
    assert.equal(o.body.overview.length, 1);
    assert.equal(o.body.overview[0].status.watch_connection_status, 'connected');
    assert.equal(o.body.overview[0].status.latest_x, -0.353);
    assert.equal(o.body.overview[0].status.battery_level, null, 'battery is not reported, so it must stay null');
    const strangerToken = (await login(w, w.stranger.code, 'caretaker')).accessToken;
    assert.deepEqual((await api(w.url, '/v1/caretaker/overview', { token: strangerToken })).body, { overview: [] });
  });

  it('keeps the last known reading when the phone reports a disconnect', async () => {
    await api(w.url, '/v1/sync/status', { token: user, body: { watchConnectionStatus: 'disconnected', safetyState: 'SENSOR_UNAVAILABLE', lastSync: null, latest: null } });
    const o = await api(w.url, '/v1/caretaker/overview', { token: care });
    assert.equal(o.body.overview[0].status.watch_connection_status, 'disconnected');
    assert.equal(o.body.overview[0].status.latest_x, -0.353);
  });
});

describe('incidents', () => {
  let w: World;
  let user: string;
  let other: string;
  let care: string;
  let stranger: string;
  let n = 0;
  const id = () => `evt-${++n}`;

  before(async () => {
    w = await startWorld();
    user = (await login(w, w.asha.code, 'user')).accessToken;
    other = (await login(w, w.ben.code, 'user')).accessToken;
    care = (await login(w, w.ravi.code, 'caretaker')).accessToken;
    stranger = (await login(w, w.stranger.code, 'caretaker')).accessToken;
    await api(w.url, '/v1/push/register', { token: care, body: { token: 'fcm-token-for-ravi-phone', platform: 'android' } });
    await w.settle();
  });
  after(async () => { await w.close(); });
  beforeEach(() => { w.push.sent = []; w.push.next = () => ({ ok: true, providerMessageId: 'm1' }); });

  it('does not notify anyone while verification is running', async () => {
    await api(w.url, '/v1/incidents', { token: user, body: incident({ clientEventId: id() }) });
    await w.settle();
    assert.equal(w.push.sent.length, 0);
  });

  it('notifies a linked caretaker once a fall is confirmed, with the required details', async () => {
    const r = await api(w.url, '/v1/incidents', { token: user, body: incident({ clientEventId: id(), detectionStatus: 'CONFIRMED_FALL', incidentState: 'escalated', finalUserResponse: 'no_response' }) });
    assert.equal(r.status, 200);
    await w.settle();
    assert.equal(w.push.sent.length, 1);
    const m = w.push.sent[0];
    assert.match(m.title, /Asha Rao/);
    assert.match(m.body, /2026-10-30T12:31:32/);
    assert.equal(m.data.classification, 'CONFIRMED_FALL');
    assert.equal(m.data.incidentId, r.body.id);
    assert.equal(m.data.userId, w.asha.id);
  });

  it('sends one notification no matter how often the phone retries', async () => {
    const eventId = id();
    const body = incident({ clientEventId: eventId, detectionStatus: 'CONFIRMED_FALL', incidentState: 'escalated', clientVersion: 3 });
    await Promise.all([1, 2, 3].map(() => api(w.url, '/v1/incidents', { token: user, body })));
    await api(w.url, '/v1/incidents', { token: user, body: { ...body, clientVersion: 4 } });
    await w.settle();
    assert.equal(w.push.sent.length, 1);
  });

  it('keeps the original event when the user says they are OK', async () => {
    const eventId = id();
    const first = await api(w.url, '/v1/incidents', { token: user, body: incident({ clientEventId: eventId, details: { peak: 1.9 } }) });
    const cancelled = await api(w.url, '/v1/incidents', { token: user, body: incident({ clientEventId: eventId, clientVersion: 2, detectionStatus: 'FALSE_ALARM', incidentState: 'cancelled', finalUserResponse: 'im_ok', details: { cancelledAt: 5 } }) });
    assert.equal(cancelled.body.id, first.body.id);
    assert.equal(cancelled.body.final_user_response, 'im_ok');
    assert.equal(cancelled.body.detection_status, 'FALSE_ALARM');
    assert.equal(cancelled.body.detection_score, 0.7);
    assert.deepEqual(cancelled.body.details, { peak: 1.9, cancelledAt: 5 });
    const list = await api(w.url, '/v1/incidents?filter=false_alarm', { token: user });
    assert.ok(list.body.incidents.some((i: any) => i.id === first.body.id));
  });

  it('ignores an older snapshot arriving after a newer one', async () => {
    const eventId = id();
    await api(w.url, '/v1/incidents', { token: user, body: incident({ clientEventId: eventId, clientVersion: 5, detectionStatus: 'FALSE_ALARM', incidentState: 'cancelled', finalUserResponse: 'im_ok' }) });
    const stale = await api(w.url, '/v1/incidents', { token: user, body: incident({ clientEventId: eventId, clientVersion: 2 }) });
    assert.equal(stale.body.detection_status, 'FALSE_ALARM');
    assert.equal(stale.body.final_user_response, 'im_ok');
  });

  it('refuses an invalid final response value', async () => {
    assert.equal((await api(w.url, '/v1/incidents', { token: user, body: incident({ clientEventId: id(), finalUserResponse: 'whatever' }) })).status, 400);
  });

  it('lets only a linked caretaker acknowledge, and records who did', async () => {
    const r = await api(w.url, '/v1/incidents', { token: user, body: incident({ clientEventId: id(), detectionStatus: 'CONFIRMED_FALL', incidentState: 'escalated' }) });
    const path = `/v1/incidents/${r.body.id}/acknowledge`;
    assert.equal((await api(w.url, path, { method: 'POST', token: stranger, body: {} })).status, 403);
    assert.equal((await api(w.url, path, { method: 'POST', token: user, body: {} })).status, 403);
    const ack = await api(w.url, path, { method: 'POST', token: care, body: {} });
    assert.equal(ack.status, 200);
    assert.equal(ack.body.acknowledged_by_name, 'Ravi Rao');
    assert.equal(ack.body.incident_state, 'acknowledged');
    const seen = await api(w.url, `/v1/incidents/${r.body.id}`, { token: user });
    assert.ok(seen.body.acknowledged_at, 'the wearer sees the acknowledgment');
  });

  it('does not let a phone snapshot erase an acknowledgment', async () => {
    const eventId = id();
    const r = await api(w.url, '/v1/incidents', { token: user, body: incident({ clientEventId: eventId, detectionStatus: 'CONFIRMED_FALL', incidentState: 'escalated' }) });
    await api(w.url, `/v1/incidents/${r.body.id}/acknowledge`, { method: 'POST', token: care, body: {} });
    const later = await api(w.url, '/v1/incidents', { token: user, body: incident({ clientEventId: eventId, clientVersion: 2, detectionStatus: 'CONFIRMED_FALL', incidentState: 'escalated' }) });
    assert.ok(later.body.acknowledged_at);
  });

  it('confines incident reads to authorized people', async () => {
    const r = await api(w.url, '/v1/incidents', { token: user, body: incident({ clientEventId: id() }) });
    const path = `/v1/incidents/${r.body.id}`;
    assert.equal((await api(w.url, path, { token: user })).status, 200);
    assert.equal((await api(w.url, path, { token: care })).status, 200);
    assert.equal((await api(w.url, path, { token: other })).status, 403);
    assert.equal((await api(w.url, path, { token: stranger })).status, 403);
    assert.equal((await api(w.url, `/v1/incidents?userId=${w.asha.id}`, { token: stranger })).status, 403);
    assert.equal((await api(w.url, `/v1/incidents?userId=${w.asha.id}`, { token: other })).status, 403);
    assert.deepEqual((await api(w.url, '/v1/incidents', { token: other })).body, { incidents: [] });
  });

  it('applies every history filter', async () => {
    const list = async (f: string) => (await api(w.url, `/v1/incidents?filter=${f}&limit=200`, { token: care })).body.incidents as any[];
    assert.ok((await list('possible')).length > 0);
    assert.ok((await list('possible')).every((i) => ['POSSIBLE_FALL', 'FALL_VERIFICATION'].includes(i.detection_status)));
    assert.ok((await list('confirmed')).every((i) => ['CONFIRMED_FALL', 'USER_NEEDS_ASSISTANCE'].includes(i.detection_status)));
    assert.ok((await list('acknowledged')).length > 0);
    assert.ok((await list('acknowledged')).every((i) => i.acknowledged_at));
    assert.ok((await list('unacknowledged')).every((i) => !i.acknowledged_at));
    assert.ok((await list('false_alarm')).every((i) => i.detection_status === 'FALSE_ALARM'));
    assert.equal((await api(w.url, '/v1/incidents?filter=everything', { token: care })).status, 400);
  });
});

describe('notification honesty and retries', () => {
  let w: World;
  let user: string;
  let care: string;

  const logs = async (incidentId: string) => (await w.db.query<any>('select * from notification_logs where incident_id = $1', [incidentId])).rows;
  const confirm = async (id: string) => {
    const r = await api(w.url, '/v1/incidents', { token: user, body: incident({ clientEventId: id, detectionStatus: 'CONFIRMED_FALL', incidentState: 'escalated' }) });
    await w.settle();
    return r.body.id as string;
  };

  before(async () => {
    w = await startWorld();
    user = (await login(w, w.asha.code, 'user')).accessToken;
    care = (await login(w, w.ravi.code, 'caretaker')).accessToken;
  });
  after(async () => { await w.close(); });

  it('records no_device, not a send, when the caretaker has no phone registered', async () => {
    const id = await confirm('no-device');
    const l = await logs(id);
    assert.equal(l.length, 1);
    assert.equal(l[0].delivery_status, 'no_device');
    assert.equal(w.push.sent.length, 0);
  });

  it('delivers that alert when the caretaker registers later', async () => {
    await api(w.url, '/v1/push/register', { token: care, body: { token: 'fcm-token-for-ravi-phone', platform: 'android' } });
    await w.settle();
    assert.equal(w.push.sent.length, 1);
    const id = (await w.db.query<any>(`select id from fall_events where client_event_id = 'no-device'`)).rows[0].id;
    const l = await logs(id);
    assert.equal(l.length, 1);
    assert.equal(l[0].delivery_status, 'provider_accepted');
  });

  it("never records delivery on the provider's word alone", async () => {
    w.push.sent = [];
    const id = await confirm('accepted');
    const [log] = await logs(id);
    assert.equal(log.delivery_status, 'provider_accepted');
    assert.equal(log.device_received_at, null);
    const detail = await api(w.url, `/v1/incidents/${id}`, { token: care });
    assert.equal(detail.body.notifications[0].delivery_status, 'provider_accepted');
  });

  it('records device_received only when the recipient phone confirms it', async () => {
    const id = (await w.db.query<any>(`select id from fall_events where client_event_id = 'accepted'`)).rows[0].id;
    const [log] = await logs(id);
    const stranger = (await login(w, w.stranger.code, 'caretaker')).accessToken;
    await api(w.url, `/v1/notifications/${log.id}/received`, { method: 'POST', token: stranger, body: {} });
    assert.equal((await logs(id))[0].delivery_status, 'provider_accepted', 'a stranger cannot mark it received');
    await api(w.url, `/v1/notifications/${log.id}/received`, { method: 'POST', token: care, body: {} });
    const [updated] = await logs(id);
    assert.equal(updated.delivery_status, 'device_received');
    assert.ok(updated.device_received_at);
  });

  it('tracks acknowledgment separately from delivery', async () => {
    w.push.sent = [];
    const id = await confirm('sep');
    await api(w.url, `/v1/incidents/${id}/acknowledge`, { method: 'POST', token: care, body: {} });
    assert.equal((await logs(id))[0].delivery_status, 'provider_accepted');
  });

  it('logs a provider failure, retries, and does not resend what succeeded', async () => {
    w.push.sent = [];
    w.push.next = () => ({ ok: false, error: 'messaging/internal-error', invalidToken: false });
    const id = await confirm('retry');
    assert.equal((await logs(id))[0].delivery_status, 'failed');
    assert.equal((await logs(id))[0].error, 'messaging/internal-error');
    w.push.next = () => ({ ok: true, providerMessageId: 'second-try' });
    await retryPendingNotifications(w.db, w.push);
    const [log] = await logs(id);
    assert.equal(log.delivery_status, 'provider_accepted');
    assert.equal(log.attempts, 2);
    const count = w.push.sent.length;
    await retryPendingNotifications(w.db, w.push);
    assert.equal(w.push.sent.length, count);
  });

  it('stops retrying after the attempt limit', async () => {
    w.push.next = () => ({ ok: false, error: 'messaging/internal-error', invalidToken: false });
    const id = await confirm('give-up');
    for (let i = 0; i < 10; i++) await retryPendingNotifications(w.db, w.push);
    const [log] = await logs(id);
    assert.equal(log.delivery_status, 'failed');
    assert.equal(log.attempts, 5);
  });

  it('removes a token the provider says is invalid', async () => {
    w.push.next = () => ({ ok: false, error: 'messaging/registration-token-not-registered', invalidToken: true });
    await confirm('bad-token');
    const { rows } = await w.db.query('select 1 as ok from push_tokens');
    assert.equal(rows.length, 0);
  });
});
