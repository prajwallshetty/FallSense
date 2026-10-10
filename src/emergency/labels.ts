// Human-readable labels for states, used consistently across screens.
import type { Tone } from '../components/ui/StatusBadge';
import type { LinkStatus } from '../ble/connectionManager';
import type { Incident, IncidentState, LocationSnapshot } from './incidentMachine';

export const INCIDENT_STATE: Record<IncidentState, { label: string; tone: Tone }> = {
  possible_fall: { label: 'Possible fall', tone: 'warning' },
  countdown: { label: 'Fall: counting down', tone: 'danger' },
  escalated: { label: 'Alert sent: waiting for a caregiver', tone: 'danger' },
  acknowledged: { label: 'Caregiver responding', tone: 'info' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
  resolved: { label: 'Resolved', tone: 'success' },
};

export function sourceLabel(i: Pick<Incident, 'source'>): string {
  return i.source === 'manual_sos' ? 'SOS from phone' : i.source === 'wearable_sos' ? 'SOS from watch' : 'Fall detected by watch';
}

export const LINK_STATUS: Record<LinkStatus, { label: string; tone: Tone }> = {
  idle: { label: 'Not connected', tone: 'neutral' },
  connecting: { label: 'Connecting…', tone: 'info' },
  connected: { label: 'Connected', tone: 'success' },
  reconnecting: { label: 'Reconnecting…', tone: 'warning' },
  disconnected: { label: 'Disconnected', tone: 'danger' },
  bluetooth_off: { label: 'Bluetooth is off', tone: 'danger' },
  unauthorized: { label: 'Bluetooth permission needed', tone: 'danger' },
  unsupported: { label: 'Bluetooth not supported', tone: 'danger' },
  error: { label: 'Connection problem', tone: 'danger' },
};

export function locationSummary(l: LocationSnapshot): string {
  switch (l.status) {
    case 'pending':
      return 'Getting location…';
    case 'ok':
      return l.address ?? `${l.latitude.toFixed(5)}, ${l.longitude.toFixed(5)}`;
    case 'permission_denied':
      return 'Location unavailable: permission not granted';
    case 'services_disabled':
      return 'Location unavailable: location services are off';
    case 'timeout':
      return 'Location unavailable: no GPS signal';
    default:
      return 'Location unavailable';
  }
}

export function timeAgo(ts: number | null | undefined, now = Date.now()): string {
  if (!ts) return 'never';
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 10) return 'just now';
  if (s < 60) return `${s} seconds ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  return new Date(ts).toLocaleString();
}

/** What we can honestly say about notification delivery for an escalated incident. */
export function dispatchSummary(i: Incident): { text: string; tone: Tone } {
  if (i.simulated) return { text: 'Simulator test: nobody was notified.', tone: 'simulated' };
  if (i.version > i.syncedVersion) {
    return { text: i.lastSyncError ? `Not sent yet: ${i.lastSyncError} Retrying automatically.` : 'Sending alert to the server…', tone: 'warning' };
  }
  const d = i.dispatch;
  if (!d || d.pushAttemptedAt == null) return { text: 'Alert saved on the server. Waiting for the notification service…', tone: 'info' };
  if (d.error && d.pushAccepted === 0) return { text: `Caregivers could not be notified: ${d.error}`, tone: 'danger' };
  if (d.pushAccepted > 0) {
    return {
      text: `Notification accepted by the push service for ${d.pushAccepted} of ${d.pushRecipients} caregiver device${d.pushRecipients === 1 ? '' : 's'}. Delivery to their phones is not confirmed until someone responds.`,
      tone: 'info',
    };
  }
  return { text: 'Sending notifications to caregivers…', tone: 'info' };
}
