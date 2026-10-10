// Persisted incident store. Wraps the pure state machine (emergency/incidentMachine.ts) and
// persists it to AsyncStorage on every change, so an active incident and the dedupe list
// survive app restarts. Side effects are delegated to a handler registered by
// services/emergencyService.ts, which keeps this store free of platform code (and testable).

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { env } from '../config/env';
import {
  Action,
  DEFAULT_CONFIG,
  Effect,
  IncidentsState,
  initialIncidentsState,
  MachineConfig,
  reduce,
} from '../emergency/incidentMachine';

export type EffectHandler = (effects: Effect[], state: IncidentsState) => void;

let effectHandler: EffectHandler | null = null;
/** Effects produced before a handler is registered (e.g. during rehydration) are queued. */
let queuedEffects: Effect[] = [];

export function setEffectHandler(handler: EffectHandler | null): void {
  effectHandler = handler;
  if (handler && queuedEffects.length) {
    const q = queuedEffects;
    queuedEffects = [];
    handler(q, useIncidentStore.getState());
  }
}

export const machineConfig: MachineConfig = {
  ...DEFAULT_CONFIG,
  countdownMs: env.fallCountdownSeconds * 1000,
};

interface IncidentStore extends IncidentsState {
  hydrated: boolean;
  dispatch: (action: Action) => { duplicate?: boolean };
  /** Clears local incident data on sign-out (after pending uploads were attempted). */
  reset: () => void;
}

export const useIncidentStore = create<IncidentStore>()(
  persist(
    (set, get) => ({
      ...initialIncidentsState,
      hydrated: false,

      dispatch: (action) => {
        const { active, history, processedEventKeys } = get();
        const result = reduce({ active, history, processedEventKeys }, action, machineConfig);
        if (result.state.active !== active || result.state.history !== history || result.state.processedEventKeys !== processedEventKeys) {
          set(result.state);
        }
        if (result.effects.length) {
          if (effectHandler) effectHandler(result.effects, result.state);
          else queuedEffects.push(...result.effects);
        }
        return { duplicate: result.duplicate };
      },

      reset: () => set({ ...initialIncidentsState }),
    }),
    {
      name: 'safefall.incidents.v1',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ active: s.active, history: s.history, processedEventKeys: s.processedEventKeys }),
      onRehydrateStorage: () => () => {
        useIncidentStore.setState({ hydrated: true });
      },
    },
  ),
);
