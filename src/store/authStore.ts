// Authentication & profile state. Two independent sources:
//   - Firebase Auth (session persisted by the Firebase SDK in AsyncStorage) with a live
//     Firestore subscription to the user's profile and relations;
//   - local demo mode (src/services/demoAuth.ts), which needs no network or backend.
// A restored demo session short-circuits Firebase entirely: no listener is attached, so a
// Firebase auth error can never sign a demo user out or bounce them back to the login screen.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { env } from '../config/env';
import { firebaseService } from '../services/firebase';
import { describeFirebaseError } from '../services/firebaseApp';
import {
  clearDemoSession,
  DEMO_RELATION,
  DemoAccount,
  findDemoAccount,
  loadDemoSession,
  saveDemoSession,
} from '../services/demoAuth';
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
  /** True while a local demo account is signed in (no Firebase session behind it). */
  isDemo: boolean;
  /** False when Firebase is unconfigured, so only demo sign-in can work. */
  firebaseAvailable: boolean;

  initialize: () => () => void;
  setActiveElderly: (elderlyId: string | null) => void;
  signInDemo: (email: string, password: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  signOutDemo: () => Promise<void>;
}

export const useAuthStore = create<AuthStore>((set, get) => {
  let profileUnsub: (() => void) | null = null;
  let relationsUnsub: (() => void) | null = null;
  // Hoisted so signInDemo can detach the Firebase auth listener when switching to demo mode.
  let authUnsub: (() => void) | null = null;

  const stopSubs = () => {
    profileUnsub?.();
    relationsUnsub?.();
    profileUnsub = relationsUnsub = null;
  };

  const stopFirebase = () => {
    authUnsub?.();
    authUnsub = null;
    stopSubs();
  };

  /** Puts a demo account into state. Deliberately touches no Firestore subscription. */
  const applyDemo = (account: DemoAccount) => {
    const { profile } = account;
    set({
      status: 'ready',
      isDemo: true,
      uid: profile.userId,
      email: profile.email,
      profile,
      error: null,
      relations: [DEMO_RELATION],
      relationsLoaded: true,
      activeElderlyId: profile.role === 'caregiver' ? DEMO_RELATION.elderlyId : null,
    });
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

  /** Attaches the Firebase auth listener. Never called while a demo session is active. */
  const attachFirebase = () => {
    authUnsub?.();
    authUnsub = firebaseService.onAuthChanged((user) => {
      // A demo sign-in may have landed between the callback being queued and running.
      if (get().isDemo) return;
      stopSubs();
      if (!user) {
        set({ status: 'signed_out', uid: null, email: null, profile: null, relations: [], relationsLoaded: false, activeElderlyId: null, error: null });
        return;
      }
      set({ status: 'loading_profile', uid: user.uid, email: user.email, error: null });
      profileUnsub = firebaseService.subscribeProfile(
        user.uid,
        (profile) => {
          if (get().isDemo) return;
          if (!profile) {
            // Right after sign-up the profile document is still being written: give it a
            // moment before asking the user to complete their profile.
            const age = Date.now() - Date.parse(user.metadata.creationTime ?? '');
            if (age >= 0 && age < NEW_ACCOUNT_GRACE_MS) {
              set({ status: 'loading_profile', profile: null });
              setTimeout(() => {
                if (!get().isDemo && get().uid === user.uid && !get().profile) set({ status: 'needs_profile' });
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
          if (get().isDemo) return;
          // Offline on a cold start with no cached profile, or rules misconfigured.
          set({ status: 'error', error: describeFirebaseError(e) });
        },
      );
    });
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
    isDemo: false,
    firebaseAvailable: env.isFirebaseConfigured,

    initialize: () => {
      let cancelled = false;

      // Resolve the stored demo session first and only then decide whether to attach the
      // Firebase listener. Doing both concurrently would race: Firebase reports "no user"
      // on a cold start and would briefly sign a restored demo user out.
      void (async () => {
        const demo = await loadDemoSession();
        if (cancelled) return;
        if (demo) {
          applyDemo(demo);
          return;
        }
        if (!env.isFirebaseConfigured) {
          // Not a hard wall: the login screen stays reachable so demo mode can be used.
          set({ status: 'signed_out', firebaseAvailable: false });
          return;
        }
        attachFirebase();
      })();

      return () => {
        cancelled = true;
        stopFirebase();
      };
    },

    setActiveElderly: (elderlyId) => {
      set({ activeElderlyId: elderlyId });
      if (elderlyId) AsyncStorage.setItem(ACTIVE_ELDER_KEY, elderlyId).catch(() => undefined);
      else AsyncStorage.removeItem(ACTIVE_ELDER_KEY).catch(() => undefined);
    },

    signInDemo: async (email, password) => {
      const account = findDemoAccount(email, password);
      if (!account) return { ok: false as const, error: 'Those demo credentials are not correct.' };
      // Detach Firebase before switching, so its "no user" callback cannot sign the demo
      // user straight back out.
      stopFirebase();
      await saveDemoSession(account.profile.userId);
      applyDemo(account);
      return { ok: true as const };
    },

    signOutDemo: async () => {
      await clearDemoSession();
      set({
        status: 'signed_out',
        isDemo: false,
        uid: null,
        email: null,
        profile: null,
        error: null,
        relations: [],
        relationsLoaded: false,
        activeElderlyId: null,
      });
      // Restore real auth so a Firebase account can still sign in after the demo.
      if (env.isFirebaseConfigured) attachFirebase();
    },
  };
});

export const selectIsElderly = (s: AuthStore) => s.profile?.role === 'elderly';
export const selectIsCaregiver = (s: AuthStore) => s.profile?.role === 'caregiver';
