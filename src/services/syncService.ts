// Uploads incidents to Firestore and listens for caregiver acknowledgements.
//
// The Firestore JS SDK on React Native keeps its offline write queue in memory only, so writes
// would be lost if the app is killed while offline. Instead, every incident carries a version
// counter persisted in AsyncStorage (incidentStore); this service uploads the latest snapshot
// of each incident whose version is ahead of what the server has. Uploads are idempotent
// (setDoc merge on a stable id), so retrying after a crash or timeout is always safe.

import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { AppState, AppStateStatus } from 'react-native';
import { pendingSync } from '../emergency/incidentMachine';
import { useIncidentStore } from '../store/incidentStore';
import { firebaseService } from './firebase';
import { describeFirebaseError } from './firebaseApp';

const BACKOFF_MS = [2_000, 5_000, 15_000, 30_000, 60_000];

class SyncService {
  private started = false;
  private running = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private attempt = 0;
  private online = true;
  private unsubs: (() => void)[] = [];
  private remoteUnsub: (() => void) | null = null;
  private watchedId: string | null = null;

  get isOnline() {
    return this.online;
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.unsubs.push(
      NetInfo.addEventListener((s: NetInfoState) => {
        const wasOnline = this.online;
        this.online = !!s.isConnected && s.isInternetReachable !== false;
        if (this.online && !wasOnline) {
          this.attempt = 0;
          this.kick();
        }
      }),
    );
    const appSub = AppState.addEventListener('change', (s: AppStateStatus) => {
      if (s === 'active') this.kick();
    });
    this.unsubs.push(() => appSub.remove());
    this.unsubs.push(useIncidentStore.subscribe((s) => this.watchActive(s.active?.id ?? null, s.active?.simulated ?? true, (s.active?.syncedVersion ?? 0) > 0)));
    this.kick();
  }

  stop(): void {
    this.started = false;
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
    this.remoteUnsub?.();
    this.remoteUnsub = null;
    this.watchedId = null;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /** Requests an upload soon (debounced). */
  kick(delay = 250): void {
    if (!this.started) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.run();
    }, delay);
  }

  /** Uploads everything pending now; resolves when the attempt finishes. */
  async flush(timeoutMs = 8_000): Promise<number> {
    await Promise.race([this.run(), new Promise((r) => setTimeout(r, timeoutMs))]);
    return pendingSync(useIncidentStore.getState()).length;
  }

  private async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    const store = useIncidentStore.getState();
    let failed = false;
    try {
      for (const incident of pendingSync(store)) {
        try {
          await firebaseService.upsertAlert(incident);
          useIncidentStore.getState().dispatch({ type: 'SYNCED', incidentId: incident.id, version: incident.version });
        } catch (e) {
          failed = true;
          const code = (e as { code?: string }).code;
          if (code === 'permission-denied') {
            // Usually a caregiver moved the incident forward (acknowledged/resolved) and our
            // older state would be a backwards transition. Adopt the server state and retry.
            const remote = await firebaseService.getAlertRemoteFields(incident.id).catch(() => null);
            if (remote) useIncidentStore.getState().dispatch({ type: 'REMOTE_UPDATE', now: Date.now(), incidentId: incident.id, remote });
          }
          useIncidentStore.getState().dispatch({ type: 'SYNC_FAILED', incidentId: incident.id, error: describeFirebaseError(e) });
        }
      }
    } finally {
      this.running = false;
    }
    if (failed || pendingSync(useIncidentStore.getState()).length > 0) {
      const delay = BACKOFF_MS[Math.min(this.attempt, BACKOFF_MS.length - 1)];
      this.attempt++;
      this.kick(delay);
    } else {
      this.attempt = 0;
    }
  }

  /** Mirrors caregiver acknowledgement/resolution and server dispatch results to the phone. */
  private watchActive(id: string | null, simulated: boolean, existsRemotely: boolean) {
    const target = id && !simulated && existsRemotely ? id : null;
    if (target === this.watchedId) return;
    this.remoteUnsub?.();
    this.remoteUnsub = null;
    this.watchedId = target;
    if (!target) return;
    this.remoteUnsub = firebaseService.subscribeAlert(
      target,
      (remote) => {
        if (remote) useIncidentStore.getState().dispatch({ type: 'REMOTE_UPDATE', now: Date.now(), incidentId: target, remote });
      },
      () => undefined,
    );
  }
}

export const syncService = new SyncService();
