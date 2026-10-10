// Local activity log (watch connections, battery warnings, incident milestones) for the
// History screen. Real events only; capped and persisted.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type ActivityType =
  | 'watch_connected'
  | 'watch_disconnected'
  | 'watch_reconnecting'
  | 'watch_paired'
  | 'watch_unpaired'
  | 'battery_low'
  | 'data_stale'
  | 'protocol_error'
  | 'incident';

export interface ActivityEntry {
  id: string;
  at: number;
  type: ActivityType;
  detail: string;
  simulated?: boolean;
}

export const MAX_ACTIVITY = 200;

interface ActivityStore {
  entries: ActivityEntry[];
  log: (type: ActivityType, detail: string, simulated?: boolean) => void;
  clear: () => void;
}

let counter = 0;

export const useActivityStore = create<ActivityStore>()(
  persist(
    (set) => ({
      entries: [],
      log: (type, detail, simulated) =>
        set((s) => {
          const last = s.entries[0];
          // Collapse identical consecutive entries (e.g. repeated reconnect attempts).
          if (last && last.type === type && last.detail === detail && Date.now() - last.at < 60_000) return s;
          const entry: ActivityEntry = { id: `${Date.now()}-${counter++}`, at: Date.now(), type, detail, simulated };
          return { entries: [entry, ...s.entries].slice(0, MAX_ACTIVITY) };
        }),
      clear: () => set({ entries: [] }),
    }),
    { name: 'safefall.activity.v1', storage: createJSONStorage(() => AsyncStorage), version: 1 },
  ),
);
