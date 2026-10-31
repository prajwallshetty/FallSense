// One display shape for incidents from either source, so History, Alerts and detail views stay
// consistent: local incidents on the wearer's phone and cloud records for caretakers.

import { DetectionState, SensorQuality } from '../detection/detectionEngine';
import { CloudIncident, detectionStatusOf } from './cloudMapping';
import { FinalUserResponse, Incident } from './incidentMachine';

export interface HistoryItem {
  /** Route id: the cloud uuid, or the local id for an incident not yet uploaded. */
  id: string;
  clientEventId: string;
  isCloud: boolean;
  userName: string;
  eventAt: number;
  eventType: 'fall' | 'manual_sos';
  status: DetectionState;
  /** Heuristic, not a probability. Null for incidents with no detection behind them. */
  score: number | null;
  quality: SensorQuality | null;
  movement: string | null;
  acknowledgedAt: number | null;
  acknowledgedBy: string | null;
  finalResponse: FinalUserResponse | null;
  /** False while the wearer's phone still holds changes the server has not confirmed. */
  uploaded: boolean;
}

export function fromLocal(i: Incident): HistoryItem {
  return {
    id: i.id,
    clientEventId: i.id,
    isCloud: false,
    userName: i.elderlyName,
    eventAt: i.createdAt,
    eventType: i.source === 'manual_sos' ? 'manual_sos' : 'fall',
    status: detectionStatusOf(i),
    score: i.detection?.score ?? null,
    quality: i.detection?.quality ?? null,
    movement: i.detection?.movement ?? null,
    acknowledgedAt: i.acknowledgedAt,
    acknowledgedBy: i.acknowledgedBy?.name ?? null,
    finalResponse: i.finalUserResponse ?? null,
    uploaded: i.version <= i.syncedVersion,
  };
}

export function fromCloud(c: CloudIncident): HistoryItem {
  return {
    id: c.id,
    clientEventId: c.client_event_id,
    isCloud: true,
    userName: c.user_name,
    eventAt: Date.parse(c.event_timestamp),
    eventType: c.event_type,
    status: c.detection_status,
    score: c.detection_score,
    quality: c.sensor_quality,
    movement: c.movement_classification,
    acknowledgedAt: c.acknowledged_at ? Date.parse(c.acknowledged_at) : null,
    acknowledgedBy: c.acknowledged_by_name,
    finalResponse: c.final_user_response,
    uploaded: true,
  };
}

export type HistoryFilter = 'all' | 'possible' | 'confirmed' | 'acknowledged' | 'unacknowledged' | 'false_alarm';

export const HISTORY_FILTERS: { value: HistoryFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'possible', label: 'Possible Falls' },
  { value: 'confirmed', label: 'Confirmed Falls' },
  { value: 'acknowledged', label: 'Acknowledged' },
  { value: 'unacknowledged', label: 'Unacknowledged' },
  { value: 'false_alarm', label: 'False Alarms' },
];

const isConfirmed = (s: DetectionState) => s === 'CONFIRMED_FALL' || s === 'USER_NEEDS_ASSISTANCE';

/** Same rules as the backend's filters, so a list merged with local items stays correct offline. */
export function matchesFilter(item: HistoryItem, filter: HistoryFilter): boolean {
  switch (filter) {
    case 'possible':
      return item.status === 'POSSIBLE_FALL' || item.status === 'FALL_VERIFICATION';
    case 'confirmed':
      return isConfirmed(item.status);
    case 'acknowledged':
      return item.acknowledgedAt !== null;
    case 'unacknowledged':
      return item.acknowledgedAt === null && isConfirmed(item.status);
    case 'false_alarm':
      return item.status === 'FALSE_ALARM';
    default:
      return true;
  }
}

/** Local items win when both exist: the phone may hold changes that have not uploaded yet. */
export function mergeHistory(cloud: HistoryItem[], local: HistoryItem[]): HistoryItem[] {
  const byEvent = new Map(cloud.map((c) => [c.clientEventId, c]));
  for (const l of local) {
    const c = byEvent.get(l.clientEventId);
    byEvent.set(l.clientEventId, c ? { ...l, id: c.id, isCloud: true, acknowledgedAt: c.acknowledgedAt ?? l.acknowledgedAt, acknowledgedBy: c.acknowledgedBy ?? l.acknowledgedBy } : l);
  }
  return [...byEvent.values()].sort((a, b) => b.eventAt - a.eventAt);
}
