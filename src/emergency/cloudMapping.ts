// Maps local incidents to the cloud API's fall event shape, and back. The local state machine remains
// the source of truth on the wearer's phone; the cloud record adds the detection status.

import { DetectionState } from '../detection/detectionEngine';
import { FinalUserResponse, Incident, IncidentState, RemoteIncidentFields } from './incidentMachine';

export interface CloudIncidentInput {
  clientEventId: string;
  clientVersion: number;
  eventTimestamp: number;
  eventType: 'fall' | 'manual_sos';
  detectionStatus: DetectionState;
  detectionScore: number | null;
  sensorQuality: 'good' | 'degraded' | 'poor' | null;
  movementClassification: string | null;
  incidentState: IncidentState;
  finalUserResponse: FinalUserResponse | null;
  details: Record<string, unknown>;
}

export function detectionStatusOf(inc: Incident): DetectionState {
  if (inc.state === 'cancelled') return 'FALSE_ALARM';
  if (inc.state === 'possible_fall') return 'POSSIBLE_FALL';
  if (inc.state === 'countdown') return 'FALL_VERIFICATION';
  if (inc.resolution === 'false_alarm') return 'FALSE_ALARM';
  return inc.finalUserResponse === 'requested_help' ? 'USER_NEEDS_ASSISTANCE' : 'CONFIRMED_FALL';
}

export function toCloudIncident(inc: Incident): CloudIncidentInput {
  const d = inc.detection ?? null;
  return {
    clientEventId: inc.id,
    clientVersion: inc.version,
    eventTimestamp: inc.createdAt,
    eventType: inc.source === 'manual_sos' ? 'manual_sos' : 'fall',
    detectionStatus: detectionStatusOf(inc),
    detectionScore: d?.score ?? null,
    sensorQuality: d?.quality ?? null,
    movementClassification: d?.movement ?? null,
    incidentState: inc.state,
    finalUserResponse: inc.finalUserResponse ?? null,
    details: {
      ...(d ? { trigger: d.trigger, highRisk: d.highRisk, watchEpoch: d.watchEpoch, peakDeviation: d.peakDeviation, orientationChangeDeg: d.orientationChangeDeg, stillFraction: d.stillFraction } : {}),
      location: inc.location,
      timeline: inc.timeline.slice(-30),
    },
  };
}

/** A fall event as returned by the API. */
export interface CloudIncident {
  id: string;
  user_id: string;
  user_name: string;
  client_event_id: string;
  event_timestamp: string;
  event_type: 'fall' | 'manual_sos';
  detection_status: DetectionState;
  detection_score: number | null;
  sensor_quality: 'good' | 'degraded' | 'poor' | null;
  movement_classification: string | null;
  incident_state: IncidentState;
  final_user_response: FinalUserResponse | null;
  details: Record<string, unknown>;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  acknowledged_by_name: string | null;
  dispatched_at: string | null;
  notifications?: CloudNotification[];
}

export interface CloudNotification {
  id: string;
  recipient_id: string;
  recipient_name: string;
  delivery_status: 'queued' | 'provider_accepted' | 'failed' | 'no_device' | 'device_received';
  error: string | null;
  attempts: number;
  sent_at: string | null;
  device_received_at: string | null;
}

/** Carries a caretaker's acknowledgment back to the wearer's phone. */
export function remoteFieldsFrom(c: CloudIncident): RemoteIncidentFields {
  if (!c.acknowledged_at) return {};
  return {
    state: 'acknowledged',
    acknowledgedAt: new Date(c.acknowledged_at).getTime(),
    acknowledgedBy: { uid: c.acknowledged_by ?? '', name: c.acknowledged_by_name ?? 'Your caretaker' },
  };
}
