// Detection state for the UI, plus the persisted thresholds and event timeline.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { DEFAULT_DETECTION_CONFIG, DetectionConfig, sanitizeDetectionConfig } from '../detection/config';
import { DetectionState, Evidence } from '../detection/detectionEngine';
import { Movement } from '../detection/movementClassifier';

export interface TimelineEvent {
  id: string;
  at: number;
  kind: 'state' | 'dismissed' | 'verification' | 'escalated';
  state: DetectionState;
  evidence: Evidence | null;
}

const MAX_TIMELINE = 100;

interface DetectionStore {
  config: DetectionConfig;
  timeline: TimelineEvent[];

  state: DetectionState;
  movement: Movement;
  restMagnitude: number | null;
  evidence: Evidence | null;

  setConfig: (c: Partial<DetectionConfig>) => DetectionConfig;
  resetConfig: () => DetectionConfig;
  addEvent: (e: Omit<TimelineEvent, 'id'>) => void;
  patch: (p: Partial<Pick<DetectionStore, 'state' | 'movement' | 'restMagnitude' | 'evidence'>>) => void;
  reset: () => void;
}

export const useDetectionStore = create<DetectionStore>()(
  persist(
    (set, get) => ({
      config: DEFAULT_DETECTION_CONFIG,
      timeline: [],
      state: 'SENSOR_UNAVAILABLE',
      movement: 'unknown',
      restMagnitude: null,
      evidence: null,

      setConfig: (c) => {
        const config = sanitizeDetectionConfig({ ...get().config, ...c });
        set({ config });
        return config;
      },
      resetConfig: () => {
        set({ config: DEFAULT_DETECTION_CONFIG });
        return DEFAULT_DETECTION_CONFIG;
      },
      addEvent: (e) => set((s) => ({ timeline: [{ ...e, id: `${e.at}-${s.timeline.length}` }, ...s.timeline].slice(0, MAX_TIMELINE) })),
      patch: (p) => set(p),
      reset: () => set({ timeline: [], state: 'SENSOR_UNAVAILABLE', movement: 'unknown', restMagnitude: null, evidence: null }),
    }),
    {
      name: 'safefall.detection.v1',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ config: s.config, timeline: s.timeline }),
    },
  ),
);
