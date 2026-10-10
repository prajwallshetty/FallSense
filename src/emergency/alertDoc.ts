// Conversion between local Incident objects and Firestore `alerts/{id}` documents.
// Field names and allowed values must match firestore.rules.

import type { DispatchInfo, Incident, IncidentState, LocationSnapshot, RemoteIncidentFields, Resolution, TimelineEntry } from './incidentMachine';

export interface AlertDoc {
  elderlyId: string;
  elderlyName: string;
  source: Incident['source'];
  deviceId: string | null;
  deviceEventId: number | null;
  state: IncidentState;
  createdAt: number;
  updatedAt: number;
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
  timeline: TimelineEntry[];
  clientVersion: number;
  /** Server-only (Cloud Function). Never written by clients. */
  dispatch?: DispatchInfo;
}

const STATES: IncidentState[] = ['possible_fall', 'countdown', 'escalated', 'acknowledged', 'cancelled', 'resolved'];
const RESOLUTIONS: Resolution[] = ['false_alarm', 'assisted', 'other'];

/** Fields the elderly user's phone owns and uploads (never includes `dispatch`). */
export function incidentToAlertDoc(i: Incident): Omit<AlertDoc, 'dispatch'> {
  return {
    elderlyId: i.elderlyId,
    elderlyName: i.elderlyName,
    source: i.source,
    deviceId: i.deviceId,
    deviceEventId: i.deviceEventId,
    state: i.state,
    createdAt: i.createdAt,
    updatedAt: i.updatedAt,
    countdownEndsAt: i.countdownEndsAt,
    escalatedAt: i.escalatedAt,
    peakAccelG: i.peakAccelG,
    location: i.location,
    cancelledBy: i.cancelledBy,
    acknowledgedBy: i.acknowledgedBy,
    acknowledgedAt: i.acknowledgedAt,
    resolvedBy: i.resolvedBy,
    resolvedAt: i.resolvedAt,
    resolution: i.resolution,
    timeline: i.timeline.slice(-50),
    clientVersion: i.version,
  };
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);

function parseDispatch(v: unknown): DispatchInfo | null {
  if (!v || typeof v !== 'object') return null;
  const d = v as Record<string, unknown>;
  return {
    pushAttemptedAt: num(d.pushAttemptedAt),
    pushRecipients: num(d.pushRecipients) ?? 0,
    pushAccepted: num(d.pushAccepted) ?? 0,
    pushFailed: num(d.pushFailed) ?? 0,
    error: str(d.error),
  };
}

/** Extracts the fields another party (caregiver / server) may have changed. Defensive parsing. */
export function remoteFieldsFromDoc(data: Record<string, unknown>): RemoteIncidentFields {
  const state = STATES.includes(data.state as IncidentState) ? (data.state as IncidentState) : undefined;
  const ack = data.acknowledgedBy as { uid?: unknown; name?: unknown } | null | undefined;
  return {
    state,
    acknowledgedBy: ack && typeof ack.uid === 'string' ? { uid: ack.uid, name: str(ack.name) ?? 'Caregiver' } : null,
    acknowledgedAt: num(data.acknowledgedAt),
    resolvedBy: str(data.resolvedBy),
    resolvedAt: num(data.resolvedAt),
    resolution: RESOLUTIONS.includes(data.resolution as Resolution) ? (data.resolution as Resolution) : null,
    dispatch: parseDispatch(data.dispatch),
  };
}

/** Parses a full alert document for read-only display (caregiver views, history). */
export function alertDocToIncident(id: string, data: Record<string, unknown>): Incident | null {
  const state = STATES.includes(data.state as IncidentState) ? (data.state as IncidentState) : null;
  const elderlyId = str(data.elderlyId);
  const createdAt = num(data.createdAt);
  if (!state || !elderlyId || createdAt == null) return null;
  const remote = remoteFieldsFromDoc(data);
  const loc = data.location as LocationSnapshot | undefined;
  return {
    id,
    elderlyId,
    elderlyName: str(data.elderlyName) ?? '',
    source: (['wearable', 'wearable_sos', 'manual_sos'] as const).includes(data.source as Incident['source'])
      ? (data.source as Incident['source'])
      : 'wearable',
    deviceId: str(data.deviceId),
    deviceEventId: num(data.deviceEventId),
    simulated: false,
    state,
    createdAt,
    updatedAt: num(data.updatedAt) ?? createdAt,
    possibleFallTimeoutAt: null,
    countdownEndsAt: num(data.countdownEndsAt),
    escalatedAt: num(data.escalatedAt),
    peakAccelG: num(data.peakAccelG),
    location: loc && typeof loc === 'object' && 'status' in loc ? loc : { status: 'pending' },
    cancelledBy: str(data.cancelledBy),
    acknowledgedBy: remote.acknowledgedBy ?? null,
    acknowledgedAt: remote.acknowledgedAt ?? null,
    resolvedBy: remote.resolvedBy ?? null,
    resolvedAt: remote.resolvedAt ?? null,
    resolution: remote.resolution ?? null,
    dispatch: remote.dispatch ?? null,
    timeline: Array.isArray(data.timeline) ? (data.timeline as TimelineEntry[]) : [],
    version: num(data.clientVersion) ?? 1,
    syncedVersion: num(data.clientVersion) ?? 1,
    lastSyncError: null,
  };
}
