// Fall event storage. A snapshot from the phone only applies if its version is newer, so retries and
// reordered uploads are harmless. Acknowledgment and dispatch fields belong to the server.

import { Db } from './db';
import { forbidden, notFound } from './errors';
import { Principal } from './tokens';

export interface IncidentInput {
  clientEventId: string;
  clientVersion: number;
  eventTimestamp: number;
  eventType: 'fall' | 'manual_sos';
  detectionStatus: string;
  detectionScore: number | null;
  sensorQuality: 'good' | 'degraded' | 'poor' | null;
  movementClassification: string | null;
  incidentState: string;
  finalUserResponse: 'im_ok' | 'requested_help' | 'no_response' | null;
  details: Record<string, unknown>;
}

const INCIDENT_COLUMNS = `e.id, e.user_id, u.name as user_name, e.client_event_id, e.client_version, e.event_timestamp,
  e.event_type, e.detection_status, e.detection_score, e.sensor_quality, e.movement_classification, e.incident_state,
  e.final_user_response, e.details, e.acknowledged_at, e.acknowledged_by, c.name as acknowledged_by_name, e.dispatched_at, e.updated_at`;

const INCIDENT_FROM = `fall_events e join users u on u.id = e.user_id left join caretakers c on c.id = e.acknowledged_by`;

const NOTIFY_STATUSES = new Set(['CONFIRMED_FALL', 'USER_NEEDS_ASSISTANCE']);

export async function upsertIncident(db: Db, userId: string, i: IncidentInput): Promise<{ id: string; shouldDispatch: boolean }> {
  return db.tx(async (tx) => {
    type Row = { id: string; detection_status: string; dispatched_at: Date | null };
    const { rows } = await tx.query<Row>(
      `insert into fall_events (user_id, client_event_id, client_version, event_timestamp, event_type, detection_status,
         detection_score, sensor_quality, movement_classification, incident_state, final_user_response, details)
       values ($1, $2, $3, to_timestamp($4 / 1000.0), $5, $6, $7, $8, $9, $10, $11, $12)
       on conflict (user_id, client_event_id) do update set
         client_version = excluded.client_version,
         detection_status = excluded.detection_status,
         detection_score = coalesce(excluded.detection_score, fall_events.detection_score),
         sensor_quality = coalesce(excluded.sensor_quality, fall_events.sensor_quality),
         movement_classification = coalesce(excluded.movement_classification, fall_events.movement_classification),
         incident_state = excluded.incident_state,
         final_user_response = coalesce(excluded.final_user_response, fall_events.final_user_response),
         details = fall_events.details || excluded.details,
         updated_at = now()
       where excluded.client_version > fall_events.client_version
       returning id, detection_status, dispatched_at`,
      [userId, i.clientEventId, i.clientVersion, i.eventTimestamp, i.eventType, i.detectionStatus, i.detectionScore,
       i.sensorQuality, i.movementClassification, i.incidentState, i.finalUserResponse, JSON.stringify(i.details)],
    );
    // No row back means an older snapshot arrived late: the server copy stands.
    const row =
      rows[0] ??
      (await tx.query<Row>('select id, detection_status, dispatched_at from fall_events where user_id = $1 and client_event_id = $2', [userId, i.clientEventId])).rows[0];

    let shouldDispatch = false;
    if (NOTIFY_STATUSES.has(row.detection_status) && !row.dispatched_at) {
      const claim = await tx.query('update fall_events set dispatched_at = now() where id = $1 and dispatched_at is null', [row.id]);
      shouldDispatch = claim.rowCount === 1;
    }
    return { id: row.id, shouldDispatch };
  });
}

/** Throws unless this principal may see this user's records. */
export async function assertCanViewUser(db: Db, p: Principal, userId: string): Promise<void> {
  if (p.role === 'user') {
    if (p.subjectId !== userId) throw forbidden();
    return;
  }
  const { rows } = await db.query('select 1 as ok from user_caretaker_links where user_id = $1 and caretaker_id = $2', [userId, p.subjectId]);
  if (rows.length === 0) throw forbidden();
}

export type IncidentFilter = 'all' | 'possible' | 'confirmed' | 'acknowledged' | 'unacknowledged' | 'false_alarm';

const FILTER_SQL: Record<IncidentFilter, string> = {
  all: 'true',
  possible: `e.detection_status in ('POSSIBLE_FALL', 'FALL_VERIFICATION')`,
  confirmed: `e.detection_status in ('CONFIRMED_FALL', 'USER_NEEDS_ASSISTANCE')`,
  acknowledged: 'e.acknowledged_at is not null',
  unacknowledged: `e.acknowledged_at is null and e.detection_status in ('CONFIRMED_FALL', 'USER_NEEDS_ASSISTANCE')`,
  false_alarm: `e.detection_status = 'FALSE_ALARM'`,
};

export async function listIncidents(db: Db, userIds: string[], filter: IncidentFilter, limit: number) {
  if (userIds.length === 0) return [];
  const { rows } = await db.query(
    `select ${INCIDENT_COLUMNS} from ${INCIDENT_FROM}
     where e.user_id = any($1::uuid[]) and ${FILTER_SQL[filter]}
     order by e.event_timestamp desc limit $2`,
    [userIds, limit],
  );
  return rows;
}

export async function getIncident(db: Db, p: Principal, id: string) {
  const { rows } = await db.query<Record<string, any>>(`select ${INCIDENT_COLUMNS} from ${INCIDENT_FROM} where e.id = $1`, [id]);
  const row = rows[0];
  if (!row) throw notFound('That incident does not exist.');
  await assertCanViewUser(db, p, row.user_id);
  const notifications = await db.query(
    `select n.id, n.recipient_id, c.name as recipient_name, n.delivery_status, n.error, n.attempts, n.sent_at, n.device_received_at
     from notification_logs n join caretakers c on c.id = n.recipient_id where n.incident_id = $1 order by n.created_at`,
    [id],
  );
  return { ...row, notifications: notifications.rows };
}

export async function acknowledgeIncident(db: Db, p: Principal, id: string) {
  if (p.role !== 'caretaker') throw forbidden('Only a caretaker can acknowledge an incident.');
  await getIncident(db, p, id); // authorization and existence
  await db.query(
    `update fall_events set acknowledged_at = coalesce(acknowledged_at, now()),
       acknowledged_by = coalesce(acknowledged_by, $2),
       incident_state = case when incident_state = 'escalated' then 'acknowledged' else incident_state end,
       updated_at = now()
     where id = $1`,
    [id, p.subjectId],
  );
  return getIncident(db, p, id);
}
