// Plain-language labels for watch, detection and cloud state, used consistently across screens.

import type { Tone } from '../components/ui/StatusBadge';
import type { DetectionState, SensorQuality } from '../detection/detectionEngine';
import type { Movement } from '../detection/movementClassifier';
import type { FinalUserResponse } from '../emergency/incidentMachine';
import type { CloudStatus } from '../store/cloudStore';
import type { ConnectionState } from '../store/watchStore';

export const CONNECTION_LABEL: Record<ConnectionState, { label: string; tone: Tone }> = {
  idle: { label: 'Watch Disconnected', tone: 'neutral' },
  connecting: { label: 'Connecting', tone: 'info' },
  connected: { label: 'Watch Connected', tone: 'success' },
  disconnected: { label: 'Watch Disconnected', tone: 'danger' },
  error: { label: 'Connection Error', tone: 'danger' },
};

export const DETECTION_LABEL: Record<DetectionState, { label: string; tone: Tone; detail: string }> = {
  NORMAL: { label: 'Normal', tone: 'success', detail: 'Nothing unusual in the latest readings.' },
  UNUSUAL_MOVEMENT: { label: 'Unusual movement', tone: 'warning', detail: 'A sudden movement was noticed. Still watching.' },
  POSSIBLE_FALL: { label: 'Possible fall', tone: 'warning', detail: 'Checking what happens next.' },
  FALL_VERIFICATION: { label: 'Fall verification', tone: 'danger', detail: 'Waiting for you to answer.' },
  CONFIRMED_FALL: { label: 'Confirmed fall', tone: 'danger', detail: 'Treated as a fall. Your caretaker is being alerted.' },
  USER_NEEDS_ASSISTANCE: { label: 'User needs assistance', tone: 'danger', detail: 'Help was requested.' },
  FALSE_ALARM: { label: 'False alarm', tone: 'neutral', detail: 'You said you are OK. The event was kept in History.' },
  SENSOR_UNAVAILABLE: { label: 'Sensor unavailable', tone: 'warning', detail: 'No live readings, so falls cannot be detected right now.' },
};

export const MOVEMENT_LABEL: Record<Movement, string> = {
  unknown: 'Not enough readings yet',
  still: 'Still',
  walking: 'Walking',
  running: 'Running',
  sitting_down: 'Sitting down',
  standing_up: 'Standing up',
  lying_down: 'Lying down',
  wrist_movement: 'Wrist movement',
  watch_removal: 'Watch may be off the wrist',
  unusual: 'Unusual movement',
};

export const QUALITY_LABEL: Record<SensorQuality, { label: string; tone: Tone }> = {
  good: { label: 'Good', tone: 'success' },
  degraded: { label: 'Some readings missing', tone: 'warning' },
  poor: { label: 'Poor', tone: 'danger' },
};

export const RESPONSE_LABEL: Record<FinalUserResponse, string> = {
  im_ok: 'Said they are OK',
  requested_help: 'Asked for help',
  no_response: 'Did not respond',
};

export const CLOUD_LABEL: Record<CloudStatus, { label: string; tone: Tone }> = {
  disabled: { label: 'Cloud off', tone: 'neutral' },
  connecting: { label: 'Cloud connecting', tone: 'info' },
  online: { label: 'Cloud connected', tone: 'success' },
  offline: { label: 'Cloud offline', tone: 'warning' },
  error: { label: 'Cloud error', tone: 'danger' },
};

export const formatAxis = (v: number | null | undefined) => (v === null || v === undefined ? '--' : v.toFixed(3));
