import { DeviceEventType, DeviceState } from '../ble/protocol';
import { alertDocToIncident, incidentToAlertDoc, remoteFieldsFromDoc } from '../emergency/alertDoc';
import { initialIncidentsState, reduce } from '../emergency/incidentMachine';
import { dispatchSummary } from '../emergency/labels';

const make = () =>
  reduce(initialIncidentsState, {
    type: 'DEVICE_EVENT',
    now: 1000,
    owner: { uid: 'u1', name: 'Asha' },
    deviceId: 'd1',
    simulated: false,
    event: { kind: 'event', eventId: 5, eventType: DeviceEventType.FallConfirmed, deviceState: DeviceState.FallAlarm, peakAccelG: 3.2, uptimeMs: 9 },
  }).state.active!;

describe('alert document conversion', () => {
  it('never writes server-owned or local-only fields', () => {
    const doc = incidentToAlertDoc(make()) as Record<string, unknown>;
    expect(doc).not.toHaveProperty('dispatch');
    expect(doc).not.toHaveProperty('syncedVersion');
    expect(doc).not.toHaveProperty('simulated');
    expect(doc).not.toHaveProperty('lastSyncError');
    expect(doc.elderlyId).toBe('u1');
    expect(doc.state).toBe('countdown');
  });

  it('round-trips through Firestore shape', () => {
    const inc = make();
    const back = alertDocToIncident(inc.id, JSON.parse(JSON.stringify(incidentToAlertDoc(inc))));
    expect(back).toMatchObject({ id: inc.id, elderlyId: 'u1', state: 'countdown', source: 'wearable', deviceEventId: 5 });
  });

  it('parses remote documents defensively', () => {
    expect(remoteFieldsFromDoc({ state: 'hacked', resolution: 'whatever', acknowledgedBy: { uid: 5 } })).toEqual({
      state: undefined,
      acknowledgedBy: null,
      acknowledgedAt: null,
      resolvedBy: null,
      resolvedAt: null,
      resolution: null,
      dispatch: null,
    });
    expect(alertDocToIncident('x', { state: 'escalated' })).toBeNull();
  });
});

describe('dispatch wording is honest', () => {
  const escalated = () => {
    let s = reduce(initialIncidentsState, { type: 'MANUAL_SOS', now: 1, owner: { uid: 'u1', name: 'A' }, id: 'u1_sos_1' }).state;
    s = reduce(s, { type: 'SYNCED', incidentId: 'u1_sos_1', version: s.active!.version }).state;
    return s.active!;
  };

  it('says "sending" while the alert has not reached the server', () => {
    const s = reduce(initialIncidentsState, { type: 'MANUAL_SOS', now: 1, owner: { uid: 'u1', name: 'A' }, id: 'u1_sos_1' }).state;
    expect(dispatchSummary(s.active!).text).toMatch(/Sending/);
  });

  it('reports push acceptance, never delivery', () => {
    const inc = { ...escalated(), dispatch: { pushAttemptedAt: 2, pushRecipients: 2, pushAccepted: 2, pushFailed: 0, error: null } };
    const text = dispatchSummary(inc).text;
    expect(text).toMatch(/accepted by the push service/);
    expect(text).toMatch(/not confirmed/);
    expect(text.toLowerCase()).not.toMatch(/\bdelivered\b/);
  });

  it('surfaces a backend failure instead of claiming success', () => {
    const inc = { ...escalated(), dispatch: { pushAttemptedAt: 2, pushRecipients: 0, pushAccepted: 0, pushFailed: 0, error: 'No caregivers are linked to this account.' } };
    expect(dispatchSummary(inc)).toEqual({ text: expect.stringMatching(/could not be notified/), tone: 'danger' });
  });

  it('labels simulated incidents', () => {
    expect(dispatchSummary({ ...escalated(), simulated: true }).text).toMatch(/nobody was notified/i);
  });
});
