// Live data a caregiver sees about their linked elderly users: alerts and watch status.

import { create } from 'zustand';
import { Incident, isOpen } from '../emergency/incidentMachine';
import { firebaseService } from '../services/firebase';
import { describeFirebaseError } from '../services/firebaseApp';
import { resilientSubscription } from '../services/resilientSubscription';
import { CloudDeviceStatus } from '../types';

interface CaregiverStore {
  alertsByElder: Record<string, Incident[]>;
  devicesByElder: Record<string, CloudDeviceStatus[]>;
  errors: Record<string, string>;
  loaded: Record<string, boolean>;
  watch: (elderlyIds: string[]) => void;
  stop: () => void;
}

export const useCaregiverStore = create<CaregiverStore>((set) => {
  const subs = new Map<string, (() => void)[]>();

  return {
    alertsByElder: {},
    devicesByElder: {},
    errors: {},
    loaded: {},

    watch: (elderlyIds) => {
      for (const [id, unsubs] of subs) {
        if (!elderlyIds.includes(id)) {
          unsubs.forEach((u) => u());
          subs.delete(id);
        }
      }
      for (const id of elderlyIds) {
        if (subs.has(id)) continue;
        const onError = (e: Error) => set((s) => ({ errors: { ...s.errors, [id]: describeFirebaseError(e) }, loaded: { ...s.loaded, [id]: true } }));
        subs.set(id, [
          resilientSubscription(
            (fail, ok) =>
              firebaseService.subscribeAlertsFor(
                id,
                (alerts) => {
                  ok();
                  set((s) => ({ alertsByElder: { ...s.alertsByElder, [id]: alerts }, loaded: { ...s.loaded, [id]: true }, errors: { ...s.errors, [id]: '' } }));
                },
                fail,
              ),
            onError,
          ),
          resilientSubscription(
            (fail, ok) =>
              firebaseService.subscribeDeviceStatus(
                id,
                (devices) => {
                  ok();
                  set((s) => ({ devicesByElder: { ...s.devicesByElder, [id]: devices } }));
                },
                fail,
              ),
            onError,
          ),
        ]);
      }
    },

    stop: () => {
      subs.forEach((unsubs) => unsubs.forEach((u) => u()));
      subs.clear();
      set({ alertsByElder: {}, devicesByElder: {}, errors: {}, loaded: {} });
    },
  };
});

/** Open alerts across all linked elders, most recent first. */
export function openCaregiverAlerts(s: Pick<CaregiverStore, 'alertsByElder'>): Incident[] {
  return Object.values(s.alertsByElder)
    .flat()
    .filter((a) => isOpen(a.state) && a.state !== 'possible_fall')
    .sort((a, b) => b.createdAt - a.createdAt);
}
