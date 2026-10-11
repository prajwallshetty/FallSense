// Starts and stops per-user services when the signed-in profile changes.

import { pendingSync } from '../emergency/incidentMachine';
import { useActivityStore } from '../store/activityStore';
import { useAuthStore } from '../store/authStore';
import { useCaregiverStore } from '../store/caregiverStore';
import { useDeviceStore } from '../store/deviceStore';
import { useIncidentStore } from '../store/incidentStore';
import { UserProfile } from '../types';
import { bleService } from './bleService';
import { emergencyService } from './emergencyService';
import { firebaseService } from './firebase';
import { notificationService } from './notificationService';
import { syncService } from './syncService';

interface PersistedStore {
  persist: { hasHydrated: () => boolean; onFinishHydration: (fn: () => void) => () => void };
}

/** Resolves once a persisted Zustand store has loaded its saved state from AsyncStorage. */
export function waitForHydration(store: PersistedStore): Promise<void> {
  if (store.persist.hasHydrated()) return Promise.resolve();
  return new Promise((resolve) => {
    const unsub = store.persist.onFinishHydration(() => {
      unsub();
      resolve();
    });
  });
}

let currentUid: string | null = null;
let currentRole: UserProfile['role'] | null = null;
let currentIsDemo = false;

/**
 * Starts the services this profile needs.
 *
 * In demo mode the local safety pipeline runs for real - BLE pairing, the watch link, fall
 * detection and the alert countdown are untouched - but services that write to Firestore
 * (incident sync, push-token registration) are skipped, because a demo account has no
 * Firebase credentials and those calls would only fail and retry.
 */
export async function startSession(profile: UserProfile, isDemo = false): Promise<void> {
  if (currentUid === profile.userId && currentRole === profile.role && currentIsDemo === isDemo) return;
  if (currentUid) await stopServices();
  currentUid = profile.userId;
  currentRole = profile.role;
  currentIsDemo = isDemo;
  await Promise.all([waitForHydration(useIncidentStore), waitForHydration(useDeviceStore)]);

  // Incidents persisted for a different account must never be uploaded under this one.
  const s = useIncidentStore.getState();
  const foreign = [s.active, ...s.history].some((i) => i && i.elderlyId !== profile.userId);
  if (foreign) useIncidentStore.getState().reset();

  if (profile.role === 'elderly') {
    emergencyService.start();
    if (!isDemo) syncService.start();
    bleService.resume().catch(() => undefined);
  }
  if (!isDemo) notificationService.registerPushToken(profile.userId).catch(() => undefined);
}

async function stopServices() {
  emergencyService.stop();
  syncService.stop();
  useCaregiverStore.getState().stop();
  await bleService.stop();
}

/** Number of incidents that have not reached the server yet (shown before sign-out). */
export function unsyncedIncidentCount(): number {
  return pendingSync(useIncidentStore.getState()).length;
}

/** Stops services and clears per-user data on this phone (no network calls). */
export async function endLocalSession(): Promise<void> {
  if (!currentUid) return;
  await stopServices();
  useIncidentStore.getState().reset();
  useActivityStore.getState().clear();
  useDeviceStore.getState().setPaired(null);
  useDeviceStore.getState().resetLive();
  currentUid = null;
  currentRole = null;
  currentIsDemo = false;
}

/**
 * Signs out: tries to upload pending incidents, removes this phone's push token, disconnects
 * the watch and clears local per-user data.
 */
export async function signOutEverywhere(): Promise<void> {
  // Demo sessions have nothing on the server: clear local state and the stored demo session
  // only. Calling Firebase here would surface an auth error on a successful sign-out.
  if (currentIsDemo) {
    await endLocalSession();
    await useAuthStore.getState().signOutDemo();
    return;
  }
  if (currentRole === 'elderly') await syncService.flush().catch(() => undefined);
  await notificationService.unregisterPushToken();
  await endLocalSession();
  await firebaseService.signOut();
}
