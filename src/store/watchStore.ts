// Live watch connection and sensor state. Only the user's settings are persisted: connection state
// always starts idle, so the app can never show a stale "connected" after a restart.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { NetworkDiagnostics } from '../../modules/watch-network';
import { Sample, SensorStats } from '../services/sensorService';
import { ClockCheck, DEFAULT_WATCH_HOST, WatchReading } from '../watch/protocol';

export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error';

export interface WatchSettings {
  host: string;
  /** Limits per request and between requests. Configurable for calibration and slow links. */
  timeoutMs: number;
  pollIntervalMs: number;
}

export const DEFAULT_WATCH_SETTINGS: WatchSettings = { host: DEFAULT_WATCH_HOST, timeoutMs: 3000, pollIntervalMs: 1000 };

export const SETTING_LIMITS = {
  timeoutMs: [500, 15000],
  pollIntervalMs: [250, 60000],
} as const;

interface WatchStore {
  settings: WatchSettings;
  /** True once monitoring was started, so it can resume after the app restarts. */
  monitoringEnabled: boolean;

  connection: ConnectionState;
  /** Plain-language reason for the current state, when there is one. */
  message: string | null;
  lastReading: WatchReading | null;
  lastSampleAt: number | null;
  /** True while the last reading on screen is older than the stale limit. */
  isStale: boolean;
  consecutiveFailures: number;
  latencyMs: number | null;
  via: 'wifi' | 'default' | null;
  clock: ClockCheck | null;
  history: Sample[];
  stats: SensorStats;
  invalidResponses: number;
  backgroundCapable: boolean;
  diagnostics: NetworkDiagnostics | null;

  setSettings: (s: Partial<WatchSettings>) => void;
  setMonitoringEnabled: (v: boolean) => void;
  patch: (p: Partial<Omit<WatchStore, 'setSettings' | 'setMonitoringEnabled' | 'patch' | 'resetLive'>>) => void;
  resetLive: () => void;
}

const LIVE = {
  connection: 'idle' as ConnectionState,
  message: null,
  lastReading: null,
  lastSampleAt: null,
  isStale: false,
  consecutiveFailures: 0,
  latencyMs: null,
  via: null,
  clock: null,
  history: [],
  stats: { accepted: 0, duplicates: 0, outOfOrder: 0, missing: 0 },
  invalidResponses: 0,
  backgroundCapable: false,
  diagnostics: null,
};

export const useWatchStore = create<WatchStore>()(
  persist(
    (set) => ({
      settings: DEFAULT_WATCH_SETTINGS,
      monitoringEnabled: false,
      ...LIVE,
      setSettings: (s) => set((state) => ({ settings: { ...state.settings, ...s } })),
      setMonitoringEnabled: (monitoringEnabled) => set({ monitoringEnabled }),
      patch: (p) => set(p),
      resetLive: () => set({ ...LIVE }),
    }),
    {
      name: 'safefall.watch.v1',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ settings: s.settings, monitoringEnabled: s.monitoringEnabled }),
    },
  ),
);
