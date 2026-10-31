// Starts and stops per-user services when the signed-in profile changes.

import * as Crypto from 'expo-crypto';
import { pendingSync } from '../emergency/incidentMachine';
import { useActivityStore } from '../store/activityStore';
import { AuthSource, useAuthStore } from '../store/authStore';
import { useCaregiverStore } from '../store/caregiverStore';
import { useCaretakerStore } from '../store/caretakerStore';
import { useCalibrationStore } from '../store/calibrationStore';
import { useDetectionStore } from '../store/detectionStore';
import { useDeviceStore } from '../store/deviceStore';
import { useIncidentStore } from '../store/incidentStore';
import { useWatchStore } from '../store/watchStore';
import { UserProfile } from '../types';
import { bleService } from './bleService';
import { cloudSyncService } from './cloudSyncService';
import { connectionService } from './connectionService';
import { emergencyService } from './emergencyService';
import { firebaseService } from './firebase';
import { incidentService } from './incidentService';
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
let currentSource: AuthSource | null = null;
let pipeline: (() => void)[] = [];

/** Connects the watch to detection, the cloud and calibration recording. */
function startWatchPipeline(profile: UserProfile): void {
  incidentService.start({ uid: profile.userId, name: profile.fullName }, () => Crypto.randomUUID().replace(/-/g, ''));
  cloudSyncService.setSafetyStateSource(() => incidentService.engine.state);
  pipeline = [
    connectionService.onSample((sample, missed) => {
      incidentService.handleSample(sample, missed);
      cloudSyncService.addSample(sample);
      useCalibrationStore.getState().addSample(sample);
    }),
    connectionService.onSensorLost((at) => incidentService.handleSensorLost(at)),
    connectionService.onTick((at) => {
      incidentService.handleTick(at);
      cloudSyncService.tick(at);
    }),
  ];
}

/**
 * Starts the services this profile needs. The local safety pipeline runs in every session: watch
 * polling, detection and the alert countdown need neither a server nor an internet connection.
 * Services that write to a backend only start for a session that has one.
 */
export async function startSession(profile: UserProfile, source: AuthSource): Promise<void> {
  if (currentUid === profile.userId && currentRole === profile.role && currentSource === source) return;
  if (currentUid) await stopServices();
  currentUid = profile.userId;
  currentRole = profile.role;
  currentSource = source;
  await Promise.all([waitForHydration(useIncidentStore), waitForHydration(useDeviceStore), waitForHydration(useWatchStore), waitForHydration(useDetectionStore)]);

  // Incidents persisted for a different account must never be uploaded under this one.
  const s = useIncidentStore.getState();
  const foreign = [s.active, ...s.history].some((i) => i && i.elderlyId !== profile.userId);
  if (foreign) useIncidentStore.getState().reset();

  if (profile.role === 'elderly') {
    emergencyService.start();
    if (source === 'firebase') syncService.start();
    if (source === 'cloud') cloudSyncService.start();
    bleService.resume().catch(() => undefined);
    startWatchPipeline(profile);
    if (useWatchStore.getState().monitoringEnabled) connectionService.start();
  } else if (source === 'cloud') {
    useCaretakerStore.getState().start();
  }
  if (source === 'firebase') notificationService.registerPushToken(profile.userId).catch(() => undefined);
}

async function stopServices() {
  pipeline.forEach((off) => off());
  pipeline = [];
  connectionService.shutdown();
  incidentService.stop();
  cloudSyncService.stop();
  useCaretakerStore.getState().stop();
  emergencyService.stop();
  syncService.stop();
  useCaregiverStore.getState().stop();
  await bleService.stop();
}

/** Incidents that have not reached the server yet (shown before sign-out). */
export function unsyncedIncidentCount(): number {
  if (currentSource === 'demo') return 0; // Demo sessions have no server to reach.
  return pendingSync(useIncidentStore.getState()).length;
}

/** Stops services and clears per-user data on this phone (no network calls). */
export async function endLocalSession(): Promise<void> {
  if (!currentUid) return;
  await stopServices();
  useIncidentStore.getState().reset();
  useActivityStore.getState().clear();
  useDetectionStore.getState().reset();
  useDeviceStore.getState().setPaired(null);
  useDeviceStore.getState().resetLive();
  currentUid = null;
  currentRole = null;
  currentSource = null;
}

/**
 * Signs out: tries to upload pending incidents, removes this phone's push token, stops the watch
 * and clears local per-user data.
 */
export async function signOutEverywhere(): Promise<void> {
  const source = useAuthStore.getState().authSource;
  if (source === 'firebase') {
    if (currentRole === 'elderly') await syncService.flush().catch(() => undefined);
    await notificationService.unregisterPushToken();
    await endLocalSession();
    await firebaseService.signOut();
    return;
  }
  if (source === 'cloud') {
    if (currentRole === 'elderly') await cloudSyncService.flush().catch(() => undefined);
    await notificationService.unregisterCaretakerPush();
  }
  await endLocalSession();
  await useAuthStore.getState().signOutLocal();
}
