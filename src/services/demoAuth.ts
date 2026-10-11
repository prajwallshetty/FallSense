// Local demo authentication.
//
// Lets SafeFall AI be demonstrated and tested without Firebase Authentication, which this
// project's Firebase instance has not provisioned (the Identity Toolkit returns
// CONFIGURATION_NOT_FOUND until Email/Password is enabled in the Firebase console - see
// docs/FIREBASE_SETUP.md). Demo sign-in needs no network, OTP, email verification or backend.
//
// SECURITY: the credentials below are hardcoded and checked on-device. This is a local
// demonstration mode only - it is NOT production authentication. Real accounts must be
// verified server-side; never ship these accounts in a production build.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { CaregiverRelation, UserProfile, UserRole } from '../types';

/**
 * Role names used by the demo specification. They are normalised to the app's canonical
 * UserRole straight away, so nothing past this module ever sees a second role identifier.
 */
export type DemoRole = 'caretaker' | 'watch_wearer';

const DEMO_ROLE_TO_CANONICAL: Record<DemoRole, UserRole> = {
  caretaker: 'caregiver',
  watch_wearer: 'elderly',
};

/** Maps a demo role name onto the single role identifier the rest of the app uses. */
export function canonicalRole(role: DemoRole): UserRole {
  return DEMO_ROLE_TO_CANONICAL[role];
}

export interface DemoAccount {
  demoRole: DemoRole;
  /** Shown on the login screen. */
  label: string;
  /** One line describing what this account demonstrates. */
  blurb: string;
  email: string;
  password: string;
  profile: UserProfile;
}

const CARETAKER_UID = 'demo-caretaker';
const WEARER_UID = 'demo-watch-wearer';

const CARETAKER_NAME = 'Demo Care Taker';
const WEARER_NAME = 'Demo Watch Wearer';

// Fixed timestamp so a restored session is identical to a fresh sign-in.
const DEMO_CREATED_AT = 0;

function demoProfile(args: {
  userId: string;
  email: string;
  fullName: string;
  phone: string;
  demoRole: DemoRole;
}): UserProfile {
  return {
    userId: args.userId,
    email: args.email,
    role: canonicalRole(args.demoRole),
    fullName: args.fullName,
    phone: args.phone,
    // Demo accounts skip onboarding so sign-in lands straight on the dashboard.
    onboardingComplete: true,
    createdAt: DEMO_CREATED_AT,
  };
}

export const DEMO_ACCOUNTS: readonly DemoAccount[] = [
  {
    demoRole: 'caretaker',
    label: 'Care Taker',
    blurb: 'Receives the wearer’s fall alerts and sees their watch status.',
    email: 'caretaker@demo.com',
    password: 'Care1234',
    profile: demoProfile({
      userId: CARETAKER_UID,
      email: 'caretaker@demo.com',
      fullName: CARETAKER_NAME,
      phone: '+919000000001',
      demoRole: 'caretaker',
    }),
  },
  {
    demoRole: 'watch_wearer',
    label: 'Watch Wearer',
    blurb: 'Pairs the SafeFall watch over Bluetooth and raises fall alerts.',
    email: 'wearer@demo.com',
    password: 'Wear1234',
    profile: demoProfile({
      userId: WEARER_UID,
      email: 'wearer@demo.com',
      fullName: WEARER_NAME,
      phone: '+919000000002',
      demoRole: 'watch_wearer',
    }),
  },
] as const;

/**
 * Links the two demo accounts to each other, so the Care Taker dashboard has a wearer to show
 * and the wearer can see who receives their alerts. Mirrors what Firestore would return.
 */
export const DEMO_RELATION: CaregiverRelation = {
  relationId: 'demo-relation',
  caregiverId: CARETAKER_UID,
  elderlyId: WEARER_UID,
  caregiverName: CARETAKER_NAME,
  elderlyName: WEARER_NAME,
  createdAt: DEMO_CREATED_AT,
};

const SESSION_KEY = 'safefall.demoSession';

function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** True when this email belongs to a demo account, whatever the password. */
export function isDemoEmail(email: string): boolean {
  const e = normaliseEmail(email);
  return DEMO_ACCOUNTS.some((a) => a.email === e);
}

/** Returns the demo account for these credentials, or null when they do not match. */
export function findDemoAccount(email: string, password: string): DemoAccount | null {
  const e = normaliseEmail(email);
  return DEMO_ACCOUNTS.find((a) => a.email === e && a.password === password) ?? null;
}

export function demoAccountByUid(userId: string): DemoAccount | null {
  return DEMO_ACCOUNTS.find((a) => a.profile.userId === userId) ?? null;
}

/**
 * Persists which demo account is signed in. Only the user id is stored - the profile is
 * rebuilt from the registry above, so no password ever reaches storage.
 */
export async function saveDemoSession(userId: string): Promise<void> {
  await AsyncStorage.setItem(SESSION_KEY, userId);
}

/** Restores the demo account saved by a previous run, or null when there is none. */
export async function loadDemoSession(): Promise<DemoAccount | null> {
  try {
    const userId = await AsyncStorage.getItem(SESSION_KEY);
    return userId ? demoAccountByUid(userId) : null;
  } catch {
    // Storage unavailable: treat as signed out rather than failing to start.
    return null;
  }
}

export async function clearDemoSession(): Promise<void> {
  try {
    await AsyncStorage.removeItem(SESSION_KEY);
  } catch {
    // Nothing useful to do; the in-memory session is cleared by the caller regardless.
  }
}
