// Firebase initialisation. Uses the Firebase JS SDK, which works in Expo dev builds and
// release builds. There is deliberately NO mock fallback: when configuration is missing the
// app shows a configuration screen instead of pretending to work.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { FirebaseApp, getApp, getApps, initializeApp } from 'firebase/app';
import * as FirebaseAuth from 'firebase/auth';
import { Auth, connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, Firestore, initializeFirestore, getFirestore } from 'firebase/firestore';
import { env, missingFirebaseKeys } from '../config/env';

export class FirebaseNotConfiguredError extends Error {
  constructor() {
    super(`Firebase is not configured. Missing: ${missingFirebaseKeys().join(', ')}. See .env.example.`);
    this.name = 'FirebaseNotConfiguredError';
  }
}

interface FirebaseHandles {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
}

let handles: FirebaseHandles | null = null;

// The React Native build of @firebase/auth exports getReactNativePersistence, but the default
// TypeScript entry point does not declare it. Metro resolves the "react-native" export condition.
type RNPersistenceFactory = (storage: typeof AsyncStorage) => FirebaseAuth.Persistence;
const getReactNativePersistence = (FirebaseAuth as unknown as { getReactNativePersistence?: RNPersistenceFactory })
  .getReactNativePersistence;

export function getFirebase(): FirebaseHandles {
  if (handles) return handles;
  if (!env.isFirebaseConfigured) throw new FirebaseNotConfiguredError();

  const isFresh = getApps().length === 0;
  const app = isFresh ? initializeApp(env.firebase) : getApp();

  let auth: Auth;
  if (isFresh && getReactNativePersistence) {
    // Persists the signed-in session across app restarts (Firebase refresh token in AsyncStorage).
    auth = FirebaseAuth.initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
  } else {
    auth = getAuth(app);
  }

  const db = isFresh ? initializeFirestore(app, { ignoreUndefinedProperties: true }) : getFirestore(app);

  if (isFresh && env.useFirebaseEmulator) {
    connectAuthEmulator(auth, `http://${env.firebaseEmulatorHost}:9099`, { disableWarnings: true });
    connectFirestoreEmulator(db, env.firebaseEmulatorHost, 8080);
  }

  handles = { app, auth, db };
  return handles;
}

/** Maps Firebase error codes to messages that make sense to an older, non-technical user. */
export function describeFirebaseError(e: unknown): string {
  const code = (e as { code?: string })?.code ?? '';
  const map: Record<string, string> = {
    'auth/invalid-credential': 'Email or password is incorrect.',
    'auth/wrong-password': 'Email or password is incorrect.',
    'auth/user-not-found': 'Email or password is incorrect.',
    'auth/invalid-email': 'That email address is not valid.',
    'auth/email-already-in-use': 'An account with this email already exists. Try signing in.',
    'auth/weak-password': 'Please choose a stronger password.',
    'auth/too-many-requests': 'Too many attempts. Please wait a few minutes and try again.',
    'auth/network-request-failed': 'No internet connection. Check your connection and try again.',
    'auth/user-disabled': 'This account has been disabled.',
    'permission-denied': 'You do not have permission to do that.',
    unavailable: 'The server cannot be reached right now. Your change will be retried.',
    'deadline-exceeded': 'The server took too long to respond. Please try again.',
    'not-found': 'That item no longer exists.',
  };
  if (map[code]) return map[code];
  if (e instanceof FirebaseNotConfiguredError) return e.message;
  if (e instanceof Error && e.message) return e.message;
  return 'Something went wrong. Please try again.';
}
