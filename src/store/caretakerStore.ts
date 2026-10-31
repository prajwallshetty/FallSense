// What a remote caretaker sees: linked users, the status their phones last reported, and incidents.
// All of it comes from the cloud, so the caretaker never needs the watch Wi-Fi. Every value is shown
// with its age, because a silent phone looks exactly like a quiet day otherwise.

import { create } from 'zustand';
import { CloudIncident } from '../emergency/cloudMapping';
import { apiClient } from '../services/apiClient';
import { notificationService } from '../services/notificationService';
import { subscribeToChanges } from '../services/realtimeService';

export interface DeviceStatus {
  user_id: string;
  watch_connection_status: string;
  safety_state: string;
  last_sync: string | null;
  battery_level: number | null;
  latest_epoch: number | string | null;
  latest_x: number | null;
  latest_y: number | null;
  latest_z: number | null;
  updated_at: string;
}

export interface OverviewEntry {
  user: { id: string; name: string; relationship: string };
  status: DeviceStatus | null;
  recentIncidents: CloudIncident[];
}

/** No report for this long means the wearer's phone is not currently monitoring. */
export const STATUS_STALE_MS = 60_000;

const POLL_MS = 15_000;

interface CaretakerStore {
  overview: OverviewEntry[];
  loaded: boolean;
  /** Set when the last refresh failed. Older data stays on screen, with its age. */
  error: string | null;
  lastFetchedAt: number | null;
  pushProblem: string | null;

  start: () => void;
  stop: () => void;
  refresh: () => Promise<void>;
  acknowledge: (incidentId: string) => Promise<void>;
}

const INITIAL = { overview: [], loaded: false, error: null, lastFetchedAt: null, pushProblem: null };

export const useCaretakerStore = create<CaretakerStore>((set, get) => {
  let timer: ReturnType<typeof setInterval> | null = null;
  let stopRealtime: (() => void) | null = null;

  return {
    ...INITIAL,

    start: () => {
      if (timer) return;
      get().refresh();
      timer = setInterval(() => get().refresh(), POLL_MS);
      stopRealtime = subscribeToChanges(() => get().refresh());
      notificationService.registerCaretakerPush().then((r) => set({ pushProblem: r.ok ? null : r.reason })).catch(() => undefined);
    },

    stop: () => {
      if (timer) clearInterval(timer);
      timer = null;
      stopRealtime?.();
      stopRealtime = null;
      set({ ...INITIAL });
    },

    refresh: async () => {
      try {
        const { overview } = await apiClient.request<{ overview: OverviewEntry[] }>('/v1/caretaker/overview');
        set({ overview, loaded: true, error: null, lastFetchedAt: Date.now() });
      } catch (e) {
        set({ loaded: true, error: (e as Error).message });
      }
    },

    acknowledge: async (incidentId) => {
      await apiClient.request(`/v1/incidents/${incidentId}/acknowledge`, { method: 'POST', body: {} });
      await get().refresh();
    },
  };
});

export function needsAttention(i: CloudIncident): boolean {
  return !i.acknowledged_at && (i.detection_status === 'CONFIRMED_FALL' || i.detection_status === 'USER_NEEDS_ASSISTANCE');
}

export function allIncidents(overview: OverviewEntry[]): CloudIncident[] {
  return overview.flatMap((o) => o.recentIncidents).sort((a, b) => Date.parse(b.event_timestamp) - Date.parse(a.event_timestamp));
}
