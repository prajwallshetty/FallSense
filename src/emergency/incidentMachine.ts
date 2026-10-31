// Emergency incident state machine.
//
//   NORMAL ──▶ possible_fall ──▶ countdown ──▶ escalated ──▶ acknowledged ──▶ resolved
//                   │                │             │                              ▲
//                   └──▶ cancelled ◀─┘             └──────────────────────────────┘
//
// The reducer is pure: it returns the next state plus a list of side effects for the caller
// (incident store) to perform. All deadlines are absolute timestamps so an incident survives an
// app restart: on the first TICK after rehydration an overdue countdown escalates immediately.

import { DeviceEventType, EventPacket } from '../ble/protocol';

export type IncidentState =
  | 'possible_fall'
  | 'countdown'
  | 'escalated'
  | 'acknowledged'
  | 'cancelled'
  | 'resolved';

export type IncidentSource = 'wearable' | 'wearable_sos' | 'manual_sos';

export type Resolution = 'false_alarm' | 'assisted' | 'other';

/** What the wearer did. Recorded alongside the original event and never replaces it. */
export type FinalUserResponse = 'im_ok' | 'requested_help' | 'no_response';

/** Detection details for an incident raised by the phone from watch readings. */
export interface DetectionSummary {
  /** Heuristic evidence sum in 0..1. Not a probability and never shown as a percentage. */
  score: number;
  quality: 'good' | 'degraded' | 'poor';
  movement: string;
  trigger: string;
  highRisk: boolean;
  /** Firmware timestamp of the triggering reading (UTC seconds). */
  watchEpoch: number | null;
  peakDeviation: number;
  orientationChangeDeg: number | null;
  stillFraction: number | null;
}

export type LocationSnapshot =
  | { status: 'pending' }
  | {
      status: 'ok';
      latitude: number;
      longitude: number;
      accuracyM: number | null;
      capturedAt: number;
      /** true when the fix is older than LOCATION_STALE_MS at the time of the incident. */
      stale: boolean;
      address: string | null;
    }
  | {
      status: 'permission_denied' | 'services_disabled' | 'unavailable' | 'timeout';
      checkedAt: number;
      message?: string;
    };

export interface TimelineEntry {
  at: number;
  type: string;
  by?: string;
  detail?: string;
}

/** Server-side dispatch results, written only by the Cloud Function. */
export interface DispatchInfo {
  pushAttemptedAt: number | null;
  pushRecipients: number;
  pushAccepted: number;
  pushFailed: number;
  error: string | null;
}

export interface Incident {
  id: string;
  elderlyId: string;
  elderlyName: string;
  source: IncidentSource;
  deviceId: string | null;
  deviceEventId: number | null;
  /** Created from the BLE simulator. Never synced to the cloud or sent to caregivers. */
  simulated: boolean;
  state: IncidentState;
  createdAt: number;
  updatedAt: number;
  possibleFallTimeoutAt: number | null;
  countdownEndsAt: number | null;
  escalatedAt: number | null;
  peakAccelG: number | null;
  location: LocationSnapshot;
  cancelledBy: string | null;
  acknowledgedBy: { uid: string; name: string } | null;
  acknowledgedAt: number | null;
  resolvedBy: string | null;
  resolvedAt: number | null;
  resolution: Resolution | null;
  dispatch: DispatchInfo | null;
  timeline: TimelineEntry[];
  /** Present on incidents raised by phone-side detection from the Wi-Fi watch. */
  detection?: DetectionSummary | null;
  finalUserResponse?: FinalUserResponse | null;
  /** Incremented on every change; sync service uploads while version > syncedVersion. */
  version: number;
  syncedVersion: number;
  lastSyncError: string | null;
}

export interface IncidentsState {
  active: Incident | null;
  history: Incident[];
  /** Keys of device events already processed (dedupe across BLE retransmissions & restarts). */
  processedEventKeys: string[];
}

export interface Owner {
  uid: string;
  name: string;
}

export interface MachineConfig {
  countdownMs: number;
  possibleFallTimeoutMs: number;
}

export const DEFAULT_CONFIG: MachineConfig = {
  countdownMs: 30_000,
  possibleFallTimeoutMs: 20_000,
};

export const MAX_HISTORY = 50;
export const MAX_PROCESSED_KEYS = 500;
export const MAX_TIMELINE = 60;
/** Events arriving at least this late get a "delivered late" note on the incident. */
export const LATE_EVENT_MS = 60_000;

export type Action =
  | {
      type: 'DEVICE_EVENT';
      now: number;
      owner: Owner;
      deviceId: string;
      simulated: boolean;
      event: EventPacket;
      /** Set when the event reached the phone long after the watch raised it (out of range). */
      lateByMs?: number;
    }
  | { type: 'MANUAL_SOS'; now: number; owner: Owner; id: string }
  | { type: 'DETECTION_FALL'; now: number; owner: Owner; id: string; detection: DetectionSummary; immediate: boolean }
  | { type: 'TICK'; now: number }
  | { type: 'CANCEL'; now: number; by: string }
  | { type: 'ESCALATE_NOW'; now: number; by: string }
  | { type: 'ACKNOWLEDGE'; now: number; uid: string; name: string }
  | { type: 'RESOLVE'; now: number; by: string; resolution: Resolution }
  | { type: 'LOCATION'; incidentId: string; location: LocationSnapshot }
  | { type: 'REMOTE_UPDATE'; now: number; incidentId: string; remote: RemoteIncidentFields }
  | { type: 'SYNCED'; incidentId: string; version: number }
  | { type: 'SYNC_FAILED'; incidentId: string; error: string }
  | { type: 'DISMISS_HISTORY' };

export interface RemoteIncidentFields {
  state?: IncidentState;
  acknowledgedBy?: { uid: string; name: string } | null;
  acknowledgedAt?: number | null;
  resolvedBy?: string | null;
  resolvedAt?: number | null;
  resolution?: Resolution | null;
  dispatch?: DispatchInfo | null;
}

export type Effect =
  | { type: 'capture_location'; incidentId: string }
  | { type: 'escalate'; incidentId: string }
  | { type: 'device_command'; command: 'ack' | 'cancel' | 'resolve'; deviceId: string; eventId: number }
  | { type: 'sync'; incidentId: string }
  | { type: 'notify'; incidentId: string; kind: 'possible_fall' | 'countdown' | 'escalated' | 'closed' };

export interface Result {
  state: IncidentsState;
  effects: Effect[];
  /** True when a device event was ignored because it had already been processed. */
  duplicate?: boolean;
}

/** Allowed state transitions. Mirrored in firestore.rules (validTransition). */
export const VALID_TRANSITIONS: Record<IncidentState, IncidentState[]> = {
  possible_fall: ['countdown', 'cancelled', 'escalated'],
  countdown: ['cancelled', 'escalated'],
  escalated: ['acknowledged', 'resolved'],
  acknowledged: ['resolved'],
  cancelled: [],
  resolved: [],
};

export const OPEN_STATES: IncidentState[] = ['possible_fall', 'countdown', 'escalated', 'acknowledged'];

export const isOpen = (s: IncidentState) => OPEN_STATES.includes(s);

export function canTransition(from: IncidentState, to: IncidentState): boolean {
  return from === to || VALID_TRANSITIONS[from].includes(to);
}

export const initialIncidentsState: IncidentsState = { active: null, history: [], processedEventKeys: [] };

const sanitizeId = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, '-');

export function incidentIdForDeviceEvent(ownerUid: string, deviceId: string, eventId: number): string {
  return `${sanitizeId(ownerUid)}_${sanitizeId(deviceId)}_${eventId}`;
}

export const eventKey = (deviceId: string, eventId: number, eventType: DeviceEventType) =>
  `${deviceId}:${eventId}:${eventType}`;

function newIncident(p: {
  id: string;
  owner: Owner;
  source: IncidentSource;
  state: IncidentState;
  now: number;
  deviceId: string | null;
  deviceEventId: number | null;
  simulated: boolean;
  peakAccelG: number | null;
}): Incident {
  return {
    id: p.id,
    elderlyId: p.owner.uid,
    elderlyName: p.owner.name,
    source: p.source,
    deviceId: p.deviceId,
    deviceEventId: p.deviceEventId,
    simulated: p.simulated,
    state: p.state,
    createdAt: p.now,
    updatedAt: p.now,
    possibleFallTimeoutAt: null,
    countdownEndsAt: null,
    escalatedAt: null,
    peakAccelG: p.peakAccelG,
    location: { status: 'pending' },
    cancelledBy: null,
    acknowledgedBy: null,
    acknowledgedAt: null,
    resolvedBy: null,
    resolvedAt: null,
    resolution: null,
    dispatch: null,
    timeline: [],
    version: 1,
    syncedVersion: 0,
    lastSyncError: null,
  };
}

function addTimeline(inc: Incident, entry: TimelineEntry): Incident {
  const timeline = [...inc.timeline, entry];
  return { ...inc, timeline: timeline.slice(-MAX_TIMELINE) };
}

function bump(inc: Incident, now: number, patch: Partial<Incident>, entry?: TimelineEntry): Incident {
  let next: Incident = { ...inc, ...patch, updatedAt: now, version: inc.version + 1 };
  if (entry) next = addTimeline(next, entry);
  return next;
}

function syncEffect(inc: Incident): Effect[] {
  return inc.simulated ? [] : [{ type: 'sync', incidentId: inc.id }];
}

function deviceCommand(inc: Incident, command: 'ack' | 'cancel' | 'resolve'): Effect[] {
  if (inc.deviceId == null || inc.deviceEventId == null) return [];
  return [{ type: 'device_command', command, deviceId: inc.deviceId, eventId: inc.deviceEventId }];
}

/** Puts `inc` back as active, or moves it to history when it reached a closed state. */
function place(state: IncidentsState, inc: Incident): IncidentsState {
  if (isOpen(inc.state)) return { ...state, active: inc };
  const history = [inc, ...state.history.filter((h) => h.id !== inc.id)].slice(0, MAX_HISTORY);
  return { ...state, active: state.active?.id === inc.id ? null : state.active, history };
}

function toCountdown(inc: Incident, now: number, cfg: MachineConfig, detail: string): Incident {
  return bump(
    inc,
    now,
    { state: 'countdown', countdownEndsAt: now + cfg.countdownMs, possibleFallTimeoutAt: null },
    { at: now, type: 'countdown_started', detail },
  );
}

function toEscalated(inc: Incident, now: number, by: string, detail?: string): Incident {
  return bump(
    inc,
    now,
    { state: 'escalated', escalatedAt: now, countdownEndsAt: null, possibleFallTimeoutAt: null },
    { at: now, type: 'escalated', by, detail },
  );
}

function rememberKey(state: IncidentsState, key: string): IncidentsState {
  const keys = [...state.processedEventKeys, key];
  return { ...state, processedEventKeys: keys.slice(-MAX_PROCESSED_KEYS) };
}

function handleDeviceEvent(
  state: IncidentsState,
  a: Extract<Action, { type: 'DEVICE_EVENT' }>,
  cfg: MachineConfig,
): Result {
  const { event, now, owner, deviceId, simulated, lateByMs } = a;
  const lateNote = (inc: Incident): Incident =>
    lateByMs && lateByMs >= LATE_EVENT_MS
      ? addTimeline(inc, { at: now, type: 'delivered_late', detail: `The watch raised this ${Math.round(lateByMs / 60_000)} min before the phone received it` })
      : inc;
  const key = eventKey(deviceId, event.eventId, event.eventType);
  const ackEffect: Effect = { type: 'device_command', command: 'ack', deviceId, eventId: event.eventId };

  // The firmware re-sends an event until it is acknowledged, so duplicates are expected.
  if (state.processedEventKeys.includes(key)) {
    return { state, effects: [ackEffect], duplicate: true };
  }
  let next = rememberKey(state, key);
  const id = incidentIdForDeviceEvent(owner.uid, deviceId, event.eventId);
  const active = next.active;
  const sameIncident = active?.id === id;
  const effects: Effect[] = [ackEffect];
  const base = { id, owner, now, deviceId, deviceEventId: event.eventId, simulated, peakAccelG: event.peakAccelG || null };

  // Another incident is already open: never replace it; record the event on the open one.
  if (active && !sameIncident && isOpen(active.state)) {
    const noted = bump(active, now, {}, {
      at: now,
      type: 'device_event_while_open',
      detail: `Watch reported ${DeviceEventType[event.eventType]} (event ${event.eventId})`,
    });
    next = { ...next, active: noted };
    return { state: next, effects: [...effects, ...syncEffect(noted)] };
  }

  switch (event.eventType) {
    case DeviceEventType.PossibleFall: {
      if (sameIncident) return { state: next, effects };
      let inc = newIncident({ ...base, source: 'wearable', state: 'possible_fall' });
      inc = addTimeline({ ...inc, possibleFallTimeoutAt: now + cfg.possibleFallTimeoutMs }, {
        at: now,
        type: 'possible_fall',
        by: 'watch',
      });
      inc = lateNote(inc);
      next = place(next, inc);
      effects.push({ type: 'capture_location', incidentId: id }, { type: 'notify', incidentId: id, kind: 'possible_fall' }, ...syncEffect(inc));
      return { state: next, effects };
    }
    case DeviceEventType.FallConfirmed: {
      let inc: Incident;
      if (sameIncident && active) {
        if (active.state !== 'possible_fall') return { state: next, effects };
        inc = toCountdown(active, now, cfg, 'Fall confirmed by watch');
        if (event.peakAccelG) inc = { ...inc, peakAccelG: Math.max(inc.peakAccelG ?? 0, event.peakAccelG) };
      } else {
        inc = newIncident({ ...base, source: 'wearable', state: 'possible_fall' });
        inc = lateNote(toCountdown(inc, now, cfg, 'Fall confirmed by watch'));
        effects.push({ type: 'capture_location', incidentId: id });
      }
      next = place(next, inc);
      effects.push({ type: 'notify', incidentId: id, kind: 'countdown' }, ...syncEffect(inc));
      return { state: next, effects };
    }
    case DeviceEventType.CancelledOnDevice:
    case DeviceEventType.Cleared: {
      if (!sameIncident || !active) return { state: next, effects };
      const who = event.eventType === DeviceEventType.Cleared ? 'watch_auto_cleared' : 'wearer_on_watch';
      if (active.state === 'possible_fall' || active.state === 'countdown') {
        const inc = bump(active, now, { state: 'cancelled', cancelledBy: who, countdownEndsAt: null, possibleFallTimeoutAt: null }, {
          at: now,
          type: 'cancelled',
          by: who,
        });
        next = place(next, inc);
        effects.push({ type: 'notify', incidentId: id, kind: 'closed' }, ...syncEffect(inc));
      } else {
        // Already escalated: caregivers have been alerted. Record that the wearer reported OK;
        // a person must resolve the incident.
        const inc = bump(active, now, {}, { at: now, type: 'wearer_reported_ok', by: who });
        next = place(next, inc);
        effects.push(...syncEffect(inc));
      }
      return { state: next, effects };
    }
    case DeviceEventType.SosButton: {
      if (sameIncident) return { state: next, effects };
      let inc = newIncident({ ...base, source: 'wearable_sos', state: 'escalated' });
      inc = lateNote(addTimeline({ ...inc, escalatedAt: now }, { at: now, type: 'sos', by: 'watch_button' }));
      next = place(next, inc);
      effects.push(
        { type: 'capture_location', incidentId: id },
        { type: 'escalate', incidentId: id },
        { type: 'notify', incidentId: id, kind: 'escalated' },
        ...syncEffect(inc),
      );
      return { state: next, effects };
    }
    default:
      return { state: next, effects };
  }
}

function findIncident(state: IncidentsState, id: string): Incident | undefined {
  return state.active?.id === id ? state.active : state.history.find((h) => h.id === id);
}

function replaceIncident(state: IncidentsState, inc: Incident): IncidentsState {
  if (state.active?.id === inc.id) return place(state, inc);
  return { ...state, history: state.history.map((h) => (h.id === inc.id ? inc : h)) };
}

const STATE_RANK: Record<IncidentState, number> = {
  possible_fall: 0,
  countdown: 1,
  cancelled: 2,
  escalated: 2,
  acknowledged: 3,
  resolved: 4,
};

export function reduce(state: IncidentsState, action: Action, cfg: MachineConfig = DEFAULT_CONFIG): Result {
  const active = state.active;

  switch (action.type) {
    case 'DEVICE_EVENT':
      return handleDeviceEvent(state, action, cfg);

    case 'MANUAL_SOS': {
      if (active && isOpen(active.state)) {
        // An incident is already open: escalate it instead of creating a second one.
        if (active.state === 'possible_fall' || active.state === 'countdown') {
          const inc = { ...toEscalated(active, action.now, action.owner.uid, 'Manual SOS pressed'), finalUserResponse: 'requested_help' as const };
          return {
            state: place(state, inc),
            effects: [{ type: 'escalate', incidentId: inc.id }, { type: 'notify', incidentId: inc.id, kind: 'escalated' }, ...syncEffect(inc)],
          };
        }
        return { state, effects: [] };
      }
      let inc = newIncident({
        id: action.id,
        owner: action.owner,
        source: 'manual_sos',
        state: 'escalated',
        now: action.now,
        deviceId: null,
        deviceEventId: null,
        simulated: false,
        peakAccelG: null,
      });
      inc = addTimeline({ ...inc, escalatedAt: action.now, finalUserResponse: 'requested_help' }, { at: action.now, type: 'sos', by: action.owner.uid });
      return {
        state: place(state, inc),
        effects: [
          { type: 'capture_location', incidentId: inc.id },
          { type: 'escalate', incidentId: inc.id },
          { type: 'notify', incidentId: inc.id, kind: 'escalated' },
          ...syncEffect(inc),
        ],
      };
    }

    case 'DETECTION_FALL': {
      const { now, owner, id, detection, immediate } = action;
      // An open incident is never replaced. Note the new event on it instead.
      if (active && isOpen(active.state)) {
        const noted = bump(active, now, {}, { at: now, type: 'detection_event_while_open', detail: `Score ${detection.score}, ${detection.trigger}` });
        return { state: { ...state, active: noted }, effects: syncEffect(noted) };
      }
      const base = newIncident({ id, owner, source: 'wearable', state: 'possible_fall', now, deviceId: null, deviceEventId: null, simulated: false, peakAccelG: null });
      let inc: Incident = addTimeline({ ...base, detection }, { at: now, type: 'possible_fall', by: 'phone_detection', detail: detection.trigger });
      inc = immediate ? toEscalated(inc, now, 'detection', 'High-risk event: escalated immediately') : toCountdown(inc, now, cfg, 'Detected from watch readings');
      return {
        state: place(state, inc),
        effects: [
          { type: 'capture_location', incidentId: id },
          ...(immediate ? [{ type: 'escalate', incidentId: id } as Effect] : []),
          { type: 'notify', incidentId: id, kind: immediate ? 'escalated' : 'countdown' },
          ...syncEffect(inc),
        ],
      };
    }

    case 'TICK': {
      if (!active) return { state, effects: [] };
      const { now } = action;
      if (active.state === 'possible_fall' && active.possibleFallTimeoutAt != null && now >= active.possibleFallTimeoutAt) {
        const inc = toCountdown(active, now, cfg, 'No follow-up from watch; starting countdown');
        return { state: place(state, inc), effects: [{ type: 'notify', incidentId: inc.id, kind: 'countdown' }, ...syncEffect(inc)] };
      }
      if (active.state === 'countdown' && active.countdownEndsAt != null && now >= active.countdownEndsAt) {
        const late = now - active.countdownEndsAt > 5_000;
        const inc = { ...toEscalated(active, now, 'countdown', late ? 'Countdown expired while app was not running' : undefined), finalUserResponse: 'no_response' as const };
        return {
          state: place(state, inc),
          effects: [{ type: 'escalate', incidentId: inc.id }, { type: 'notify', incidentId: inc.id, kind: 'escalated' }, ...syncEffect(inc)],
        };
      }
      return { state, effects: [] };
    }

    case 'CANCEL': {
      if (!active || (active.state !== 'possible_fall' && active.state !== 'countdown')) return { state, effects: [] };
      const inc = bump(active, action.now, { state: 'cancelled', cancelledBy: action.by, finalUserResponse: 'im_ok', countdownEndsAt: null, possibleFallTimeoutAt: null }, {
        at: action.now,
        type: 'cancelled',
        by: action.by,
      });
      return {
        state: place(state, inc),
        effects: [...deviceCommand(inc, 'cancel'), { type: 'notify', incidentId: inc.id, kind: 'closed' }, ...syncEffect(inc)],
      };
    }

    case 'ESCALATE_NOW': {
      if (!active || (active.state !== 'possible_fall' && active.state !== 'countdown')) return { state, effects: [] };
      const inc = { ...toEscalated(active, action.now, action.by, 'Escalated manually'), finalUserResponse: 'requested_help' as const };
      return {
        state: place(state, inc),
        effects: [{ type: 'escalate', incidentId: inc.id }, { type: 'notify', incidentId: inc.id, kind: 'escalated' }, ...syncEffect(inc)],
      };
    }

    case 'ACKNOWLEDGE': {
      if (!active || active.state !== 'escalated') return { state, effects: [] };
      const inc = bump(active, action.now, {
        state: 'acknowledged',
        acknowledgedBy: { uid: action.uid, name: action.name },
        acknowledgedAt: action.now,
      }, { at: action.now, type: 'acknowledged', by: action.uid });
      return { state: place(state, inc), effects: syncEffect(inc) };
    }

    case 'RESOLVE': {
      if (!active || (active.state !== 'escalated' && active.state !== 'acknowledged')) return { state, effects: [] };
      const inc = bump(active, action.now, {
        state: 'resolved',
        resolvedBy: action.by,
        resolvedAt: action.now,
        resolution: action.resolution,
        // "I'm OK" after a high-risk escalation: the wearer's answer, kept with the event.
        ...(action.resolution === 'false_alarm' && action.by === active.elderlyId ? { finalUserResponse: 'im_ok' as const } : {}),
      }, { at: action.now, type: 'resolved', by: action.by, detail: action.resolution });
      return {
        state: place(state, inc),
        effects: [...deviceCommand(inc, 'resolve'), { type: 'notify', incidentId: inc.id, kind: 'closed' }, ...syncEffect(inc)],
      };
    }

    case 'LOCATION': {
      const inc = findIncident(state, action.incidentId);
      if (!inc) return { state, effects: [] };
      const at = action.location.status === 'ok' ? action.location.capturedAt : 'checkedAt' in action.location ? action.location.checkedAt : inc.updatedAt;
      const updated = bump(inc, Math.max(inc.updatedAt, at), { location: action.location }, {
        at: Math.max(inc.updatedAt, at),
        type: 'location',
        detail: action.location.status,
      });
      return { state: replaceIncident(state, updated), effects: syncEffect(updated) };
    }

    case 'REMOTE_UPDATE': {
      const inc = findIncident(state, action.incidentId);
      if (!inc) return { state, effects: [] };
      const r = action.remote;
      let patch: Partial<Incident> = {};
      if (r.dispatch !== undefined) patch.dispatch = r.dispatch;
      const remoteState = r.state;
      if (remoteState && remoteState !== inc.state && STATE_RANK[remoteState] > STATE_RANK[inc.state] && canTransition(inc.state, remoteState)) {
        patch = {
          ...patch,
          state: remoteState,
          acknowledgedBy: r.acknowledgedBy ?? inc.acknowledgedBy,
          acknowledgedAt: r.acknowledgedAt ?? inc.acknowledgedAt,
          resolvedBy: r.resolvedBy ?? inc.resolvedBy,
          resolvedAt: r.resolvedAt ?? inc.resolvedAt,
          resolution: r.resolution ?? inc.resolution,
          countdownEndsAt: null,
          possibleFallTimeoutAt: null,
        };
        const updated = bump(inc, action.now, patch, {
          at: action.now,
          type: remoteState,
          by: remoteState === 'acknowledged' ? r.acknowledgedBy?.uid : r.resolvedBy ?? undefined,
          detail: 'Updated by caregiver',
        });
        // Remote change is already in the cloud: count it as synced so we don't echo it back.
        const synced = { ...updated, syncedVersion: inc.syncedVersion === inc.version ? updated.version : inc.syncedVersion };
        const effects: Effect[] = remoteState === 'resolved' ? [...deviceCommand(synced, 'resolve'), { type: 'notify', incidentId: inc.id, kind: 'closed' }] : [];
        return { state: replaceIncident(state, synced), effects };
      }
      if (Object.keys(patch).length === 0) return { state, effects: [] };
      // Dispatch info is server-owned; it does not need re-uploading.
      return { state: replaceIncident(state, { ...inc, ...patch }), effects: [] };
    }

    case 'SYNCED': {
      const inc = findIncident(state, action.incidentId);
      if (!inc) return { state, effects: [] };
      return {
        state: replaceIncident(state, { ...inc, syncedVersion: Math.max(inc.syncedVersion, action.version), lastSyncError: null }),
        effects: [],
      };
    }

    case 'SYNC_FAILED': {
      const inc = findIncident(state, action.incidentId);
      if (!inc) return { state, effects: [] };
      return { state: replaceIncident(state, { ...inc, lastSyncError: action.error }), effects: [] };
    }

    case 'DISMISS_HISTORY':
      return { state: { ...state, history: state.history.filter((h) => h.version > h.syncedVersion && !h.simulated) }, effects: [] };

    default:
      return { state, effects: [] };
  }
}

/** Incidents (active first) that still have local changes not yet written to the cloud. */
export function pendingSync(state: IncidentsState): Incident[] {
  const all = state.active ? [state.active, ...state.history] : state.history;
  return all.filter((i) => !i.simulated && i.version > i.syncedVersion);
}
