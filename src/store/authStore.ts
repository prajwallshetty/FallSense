// Authentication & profile state, driven by Firebase Auth (session persisted by the Firebase SDK
// in AsyncStorage) and a live Firestore subscription to the user's profile and relations.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { env } from '../config/env';
import { firebaseService } from '../services/firebase';
import { describeFirebaseError } from '../services/firebaseApp';
import { CaregiverRelation, UserProfile } from '../types';

export type AuthStatus =
  | 'initializing'
  | 'config_error'
  | 'signed_out'
  | 'loading_profile'
  | 'needs_profile'
  | 'ready'
  | 'error';

const ACTIVE_ELDER_KEY = 'safefall.activeElderlyId';
const NEW_ACCOUNT_GRACE_MS = 8_000;

interface AuthStore {
  status: AuthStatus;
  uid: string | null;
  email: string | null;
  profile: UserProfile | null;
  error: string | null;
  relations: CaregiverRelation[];
  relationsLoaded: boolean;
  /** Caregivers: which linked elderly user the app is currently showing. */
  activeElderlyId: string | null;

  initialize: () => () => void;
  setActiveElderly: (elderlyId: string | null) => void;
}

export const useAuthStore = create<AuthStore>((set, get) => {
  let profileUnsub: (() => void) | null = null;
  let relationsUnsub: (() => void) | null = null;

  const stopSubs = () => {
    profileUnsub?.();
    relationsUnsub?.();
    profileUnsub = relationsUnsub = null;
  };

  const watchRelations = (profile: UserProfile) => {
    relationsUnsub?.();
    relationsUnsub = firebaseService.subscribeRelations(
      profile,
      async (relations) => {
        let active = get().activeElderlyId;
        if (profile.role === 'caregiver') {
          if (!active) active = await AsyncStorage.getItem(ACTIVE_ELDER_KEY).catch(() => null);
          if (!active || !relations.some((r) => r.elderlyId === active)) active = relations[0]?.elderlyId ?? null;
        } else {
          active = null;
        }
        set({ relations, relationsLoaded: true, activeElderlyId: active });
      },
      () => set({ relationsLoaded: true }),
    );
  };

  return {
    status: 'initializing',
    uid: null,
    email: null,
    profile: null,
    error: null,
    relations: [],
    relationsLoaded: false,
    activeElderlyId: null,

    initialize: () => {
      if (!env.isFirebaseConfigured) {
        set({ status: 'config_error' });
        return () => undefined;
      }
      const authUnsub = firebaseService.onAuthChanged((user) => {
        stopSubs();
        if (!user) {
          set({ status: 'signed_out', uid: null, email: null, profile: null, relations: [], relationsLoaded: false, activeElderlyId: null, error: null });
          return;
        }
        set({ status: 'loading_profile', uid: user.uid, email: user.email, error: null });
        profileUnsub = firebaseService.subscribeProfile(
          user.uid,
          (profile) => {
            if (!profile) {
              // Right after sign-up the profile document is still being written: give it a
              // moment before asking the user to complete their profile.
              const age = Date.now() - Date.parse(user.metadata.creationTime ?? '');
              if (age >= 0 && age < NEW_ACCOUNT_GRACE_MS) {
                set({ status: 'loading_profile', profile: null });
                setTimeout(() => {
                  if (get().uid === user.uid && !get().profile) set({ status: 'needs_profile' });
                }, NEW_ACCOUNT_GRACE_MS - age);
                return;
              }
              set({ status: 'needs_profile', profile: null });
              return;
            }
            const prevRole = get().profile?.role;
            set({ status: 'ready', profile });
            if (!relationsUnsub || prevRole !== profile.role) watchRelations(profile);
          },
          (e) => {
            // Offline on a cold start with no cached profile, or rules misconfigured.
            set({ status: 'error', error: describeFirebaseError(e) });
          },
        );
      });
      return () => {
        authUnsub();
        stopSubs();
      };
    },

    setActiveElderly: (elderlyId) => {
      set({ activeElderlyId: elderlyId });
      if (elderlyId) AsyncStorage.setItem(ACTIVE_ELDER_KEY, elderlyId).catch(() => undefined);
      else AsyncStorage.removeItem(ACTIVE_ELDER_KEY).catch(() => undefined);
    },
  };
});

export const selectIsElderly = (s: AuthStore) => s.profile?.role === 'elderly';
export const selectIsCaregiver = (s: AuthStore) => s.profile?.role === 'caregiver';
