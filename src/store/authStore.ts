// Authentication and profile state. One session source at a time:
//   cloud     access code validated by the SafeFall backend (the normal path)
//   demo      local demo accounts, only in builds that enable them (services/demoAuth.ts)
//   firebase  older email accounts, off unless EXPO_PUBLIC_ENABLE_FIREBASE_AUTH=true
//
// Cloud and demo sessions never attach a Firebase listener, so a Firebase error can never sign
// someone out. The rest of the app uses one role identifier, UserRole: the backend's
// 'user' and 'caretaker' are mapped to it here, at the boundary, and nowhere else.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { env } from '../config/env';
import { authService, CloudRole, CloudSession } from '../services/authService';
import { ApiError } from '../services/apiClient';
import { clearDemoSession, DEMO_RELATION, DemoAccount, findDemoAccount, loadDemoSession, saveDemoSession } from '../services/demoAuth';
import { firebaseService } from '../services/firebase';
import { describeFirebaseError } from '../services/firebaseApp';
import { CaregiverRelation, UserProfile, UserRole } from '../types';

export type AuthStatus = 'initializing' | 'signed_out' | 'loading_profile' | 'needs_profile' | 'ready' | 'error';

export type AuthSource = 'cloud' | 'demo' | 'firebase';

const ACTIVE_ELDER_KEY = 'safefall.activeElderlyId';
const NEW_ACCOUNT_GRACE_MS = 8_000;

const SIGNED_OUT = {
  status: 'signed_out' as AuthStatus,
  authSource: null,
  uid: null,
  email: null,
  profile: null,
  error: null,
  relations: [],
  relationsLoaded: false,
  activeElderlyId: null,
  isDemo: false,
  calibrationAccess: false,
};

interface AuthStore {
  status: AuthStatus;
  authSource: AuthSource | null;
  uid: string | null;
  email: string | null;
  profile: UserProfile | null;
  error: string | null;
  relations: CaregiverRelation[];
  relationsLoaded: boolean;
  /** Caregivers: which linked person the app is currently showing. */
  activeElderlyId: string | null;
  isDemo: boolean;
  /** May open the detection configuration and calibration tools. */
  calibrationAccess: boolean;

  initialize: () => () => void;
  setActiveElderly: (elderlyId: string | null) => void;
  signInWithAccessCode: (code: string, role: CloudRole) => Promise<{ ok: true } | { ok: false; error: string }>;
  signInDemo: (email: string, password: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  /** Clears cloud or demo credentials and returns to signed-out. */
  signOutLocal: () => Promise<void>;
}

const CLOUD_ROLE: Record<CloudRole, UserRole> = { user: 'elderly', caretaker: 'caregiver' };

function fromCloud(s: CloudSession): { profile: UserProfile; relations: CaregiverRelation[] } {
  const { subject, links } = s;
  const role = CLOUD_ROLE[subject.role];
  return {
    profile: { userId: subject.id, email: '', role, fullName: subject.name, phone: '', onboardingComplete: true, createdAt: 0 },
    relations: links.map((l) => ({
      relationId: l.id,
      caregiverId: role === 'caregiver' ? subject.id : l.id,
      elderlyId: role === 'caregiver' ? l.id : subject.id,
      caregiverName: role === 'caregiver' ? subject.name : l.name,
      elderlyName: role === 'caregiver' ? l.name : subject.name,
      createdAt: 0,
    })),
  };
}

export const useAuthStore = create<AuthStore>((set, get) => {
  let profileUnsub: (() => void) | null = null;
  let relationsUnsub: (() => void) | null = null;
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

  const applyDemo = (account: DemoAccount) => {
    const { profile } = account;
    set({
      status: 'ready',
      authSource: 'demo',
      isDemo: true,
      calibrationAccess: env.devToolsEnabled,
      uid: profile.userId,
      email: profile.email,
      profile,
      error: null,
      relations: [DEMO_RELATION],
      relationsLoaded: true,
      activeElderlyId: profile.role === 'caregiver' ? DEMO_RELATION.elderlyId : null,
    });
  };

  const applyCloud = (session: CloudSession) => {
    const { profile, relations } = fromCloud(session);
    set({
      status: 'ready',
      authSource: 'cloud',
      isDemo: false,
      calibrationAccess: session.subject.calibrationAccess,
      uid: profile.userId,
      email: null,
      profile,
      error: null,
      relations,
      relationsLoaded: true,
      activeElderlyId: profile.role === 'caregiver' ? relations[0]?.elderlyId ?? null : null,
    });
  };

  const refreshCloudProfile = () => {
    authService
      .refreshProfile()
      .then((session) => {
        if (session && get().authSource === 'cloud') applyCloud(session);
      })
      .catch(() => undefined); // Offline is normal here. The cached session stands.
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

  const attachFirebase = () => {
    authUnsub?.();
    authUnsub = firebaseService.onAuthChanged((user) => {
      if (get().authSource === 'demo' || get().authSource === 'cloud') return;
      stopSubs();
      if (!user) {
        set({ ...SIGNED_OUT });
        return;
      }
      set({ status: 'loading_profile', authSource: 'firebase', uid: user.uid, email: user.email, error: null });
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
  };

  const attachFallback = () => {
    if (env.legacyFirebaseAuth && env.isFirebaseConfigured) attachFirebase();
    else set({ ...SIGNED_OUT });
  };

  authService.setExpiredHandler(() => {
    // The backend refused this session for good, for example a revoked access code.
    if (get().authSource === 'cloud') set({ ...SIGNED_OUT, error: 'Your access code is no longer valid. Ask your administrator for a new one.' });
  });

  return {
    status: 'initializing',
    authSource: null,
    uid: null,
    email: null,
    profile: null,
    error: null,
    relations: [],
    relationsLoaded: false,
    activeElderlyId: null,
    isDemo: false,
    calibrationAccess: false,

    initialize: () => {
      let cancelled = false;

      // Resolve stored sessions first. Attaching Firebase at the same time would race: it reports
      // "no user" on a cold start and would briefly sign a restored session out.
      void (async () => {
        const demo = env.demoModeEnabled ? await loadDemoSession() : null;
        if (cancelled) return;
        if (demo) {
          applyDemo(demo);
          return;
        }
        const session = await authService.restore();
        if (cancelled) return;
        if (session) {
          applyCloud(session);
          refreshCloudProfile();
          return;
        }
        attachFallback();
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

    signInWithAccessCode: async (code, role) => {
      try {
        const session = await authService.login(code, role);
        stopFirebase();
        applyCloud(session);
        return { ok: true as const };
      } catch (e) {
        const err = e as ApiError;
        if (err.kind === 'network' || err.kind === 'timeout') {
          return { ok: false as const, error: 'Could not reach SafeFall. If you are connected to the watch Wi-Fi, switch to mobile data or home Wi-Fi to sign in.' };
        }
        return { ok: false as const, error: err.message };
      }
    },

    signInDemo: async (email, password) => {
      if (!env.demoModeEnabled) return { ok: false as const, error: 'Demo mode is not available in this build.' };
      const account = findDemoAccount(email, password);
      if (!account) return { ok: false as const, error: 'Those demo credentials are not correct.' };
      stopFirebase();
      await saveDemoSession(account.profile.userId);
      applyDemo(account);
      return { ok: true as const };
    },

    signOutLocal: async () => {
      const source = get().authSource;
      if (source === 'demo') await clearDemoSession();
      if (source === 'cloud') await authService.logout();
      set({ ...SIGNED_OUT });
      attachFallback();
    },
  };
});

export const selectIsElderly = (s: AuthStore) => s.profile?.role === 'elderly';
export const selectIsCaregiver = (s: AuthStore) => s.profile?.role === 'caregiver';
