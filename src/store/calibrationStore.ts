// Labelled recordings for calibration and accuracy testing. Everything recorded here is real watch
// data with a human-supplied label. It is exported for offline evaluation on a computer.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { Activity, Recording } from '../detection/evaluation';
import { Sample } from '../services/sensorService';

const MAX_RECORDINGS = 200;
const MAX_SAMPLES_PER_RECORDING = 3600;

interface CalibrationStore {
  recordings: Recording[];
  active: Recording | null;

  startRecording: (r: { participant: string; activity: Activity; orientation: string }) => void;
  /** Marks when a labelled fall happened during the current recording. */
  markFall: () => void;
  addSample: (s: Sample) => void;
  stopRecording: () => void;
  discardRecording: () => void;
  deleteRecording: (id: string) => void;
}

export const useCalibrationStore = create<CalibrationStore>()(
  persist(
    (set, get) => ({
      recordings: [],
      active: null,

      startRecording: ({ participant, activity, orientation }) => {
        set({ active: { id: `${Date.now()}`, participant, activity, orientation, samples: [] } });
      },

      markFall: () => {
        const { active } = get();
        if (active) set({ active: { ...active, fallAt: Date.now() } });
      },

      addSample: (s) => {
        const { active } = get();
        if (!active || active.samples.length >= MAX_SAMPLES_PER_RECORDING) return;
        set({ active: { ...active, samples: [...active.samples, { t: s.receivedAt, epoch: s.epoch, x: s.x, y: s.y, z: s.z }] } });
      },

      stopRecording: () => {
        const { active, recordings } = get();
        if (!active) return;
        set({ active: null, recordings: active.samples.length ? [active, ...recordings].slice(0, MAX_RECORDINGS) : recordings });
      },

      discardRecording: () => set({ active: null }),
      deleteRecording: (id) => set((s) => ({ recordings: s.recordings.filter((r) => r.id !== id) })),
    }),
    {
      name: 'safefall.calibration.v1',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ recordings: s.recordings }),
    },
  ),
);
