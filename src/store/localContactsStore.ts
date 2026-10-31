// Emergency contacts kept on this phone for sessions with no Firestore account. They exist to power
// the call and text buttons on the alert screen, which must work offline in any case.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { EmergencyContact } from '../types';

interface LocalContactsStore {
  byUser: Record<string, EmergencyContact[]>;
  set: (uid: string, contacts: EmergencyContact[]) => void;
}

export const useLocalContactsStore = create<LocalContactsStore>()(
  persist(
    (set) => ({
      byUser: {},
      set: (uid, contacts) => set((s) => ({ byUser: { ...s.byUser, [uid]: contacts } })),
    }),
    { name: 'safefall.localContacts.v1', version: 1, storage: createJSONStorage(() => AsyncStorage) },
  ),
);
