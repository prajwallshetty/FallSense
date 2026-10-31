// Caretaker notification dispatch. Each (incident, caretaker, device) gets one log row, enforced by
// a unique constraint, so retries and concurrent requests can never send the same alert twice.

import { createHash } from 'node:crypto';
import { Db } from './db';
import { PushMessage, PushSender } from './push/sender';

const MAX_ATTEMPTS = 5;

const fingerprint = (token: string) => createHash('sha256').update(token).digest('hex').slice(0, 32);

interface Incident {
  id: string;
  user_id: string;
  user_name: string;
  event_timestamp: Date;
  event_type: string;
  detection_status: string;
}

function describe(inc: Incident): { title: string; body: string } {
  const name = inc.user_name;
  const at = new Date(inc.event_timestamp).toISOString();
  if (inc.event_type === 'manual_sos') return { title: `SOS from ${name}`, body: `${name} asked for help. Event time ${at}.` };
  if (inc.detection_status === 'USER_NEEDS_ASSISTANCE') return { title: `${name} needs help`, body: `Possible fall. ${name} asked for help. Event time ${at}.` };
  return { title: `${name} may have fallen`, body: `Fall alert with no response from ${name}. Event time ${at}.` };
}

interface Pending {
  logId: string;
  tokenId: string;
  token: string;
}

async function claimDevice(db: Db, incidentId: string, caretakerId: string, tokenId: string, token: string): Promise<Pending | null> {
  // Only a failed row can be claimed again. Sent rows never match, so nothing is sent twice.
  const { rows } = await db.query<{ id: string }>(
    `insert into notification_logs (incident_id, recipient_id, push_token_id, token_fingerprint, delivery_status)
     values ($1, $2, $3, $4, 'queued')
     on conflict (incident_id, recipient_id, token_fingerprint) do update
       set delivery_status = 'queued', attempts = notification_logs.attempts + 1, error = null
       where notification_logs.delivery_status = 'failed' and notification_logs.attempts < $5
     returning id`,
    [incidentId, caretakerId, tokenId, fingerprint(token), MAX_ATTEMPTS],
  );
  return rows[0] ? { logId: rows[0].id, tokenId, token } : null;
}

export async function dispatchIncident(db: Db, sender: PushSender, incidentId: string): Promise<void> {
  const { rows: incidents } = await db.query<Incident>(
    `select e.id, e.user_id, e.event_timestamp, e.event_type, e.detection_status, u.name as user_name
     from fall_events e join users u on u.id = e.user_id where e.id = $1`,
    [incidentId],
  );
  const incident = incidents[0];
  if (!incident) return;

  const { rows: devices } = await db.query<{ caretaker_id: string; token_id: string | null; token: string | null }>(
    `select l.caretaker_id, t.id as token_id, t.token
     from user_caretaker_links l left join push_tokens t on t.caretaker_id = l.caretaker_id
     where l.user_id = $1`,
    [incident.user_id],
  );

  const pending: Pending[] = [];
  for (const d of devices) {
    if (!d.token || !d.token_id) {
      await db.query(
        `insert into notification_logs (incident_id, recipient_id, delivery_status, error)
         values ($1, $2, 'no_device', 'Caretaker has no registered device')
         on conflict (incident_id, recipient_id, token_fingerprint) do nothing`,
        [incident.id, d.caretaker_id],
      );
      continue;
    }
    // A registered device supersedes an earlier "no device" record for this caretaker.
    await db.query(`delete from notification_logs where incident_id = $1 and recipient_id = $2 and delivery_status = 'no_device'`, [incident.id, d.caretaker_id]);
    const claimed = await claimDevice(db, incident.id, d.caretaker_id, d.token_id, d.token);
    if (claimed) pending.push(claimed);
  }
  if (pending.length === 0) return;

  const { title, body } = describe(incident);
  const messages: PushMessage[] = pending.map((p) => ({
    token: p.token,
    title,
    body,
    data: {
      type: 'fall_alert',
      incidentId: incident.id,
      userId: incident.user_id,
      notificationId: p.logId,
      eventTimestamp: new Date(incident.event_timestamp).toISOString(),
      classification: incident.detection_status,
    },
  }));

  let results;
  try {
    results = await sender.sendAll(messages);
  } catch (e) {
    results = messages.map(() => ({ ok: false as const, error: (e as Error).message, invalidToken: false }));
  }

  for (const [i, result] of results.entries()) {
    const p = pending[i];
    if (result.ok) {
      await db.query(
        `update notification_logs set delivery_status = 'provider_accepted', provider_message_id = $2, sent_at = now(), error = null where id = $1`,
        [p.logId, result.providerMessageId],
      );
    } else {
      await db.query(`update notification_logs set delivery_status = 'failed', error = $2 where id = $1`, [p.logId, result.error]);
      if (result.invalidToken) await db.query('delete from push_tokens where id = $1', [p.tokenId]);
    }
  }
}

/** Retries unacknowledged alerts whose notification failed or had no device. Runs periodically. */
export async function retryPendingNotifications(db: Db, sender: PushSender, caretakerId?: string): Promise<number> {
  const { rows } = await db.query<{ id: string }>(
    `select distinct e.id from fall_events e
     join notification_logs n on n.incident_id = e.id
     where e.acknowledged_at is null
       and e.dispatched_at > now() - interval '24 hours'
       and n.delivery_status in ('failed', 'no_device')
       and n.attempts < $1
       and ($2::uuid is null or n.recipient_id = $2)`,
    [MAX_ATTEMPTS, caretakerId ?? null],
  );
  for (const r of rows) await dispatchIncident(db, sender, r.id);
  return rows.length;
}
