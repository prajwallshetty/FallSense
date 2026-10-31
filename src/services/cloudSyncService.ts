// CloudSyncService: the phone as gateway between the watch and the cloud.
//
//   Incidents  upload immediately, and survive restarts: each one carries a version persisted in the
//              incident store, and uploads are idempotent, so a retry is always safe.
//   Readings   are downsampled to one per cloud interval, independent of the local display rate,
//              and held in a bounded queue while offline.
//   Status     goes up every cloud interval, so a caretaker can tell the phone is still reporting.
//
// It runs from ticks, not timers alone, because Android pauses JavaScript timers in the background
// while monitoring ticks keep arriving from the foreground service.
//
// The phone may be connected only to the watch hotspot, which has no internet. That is a normal
// state: local monitoring continues, events queue, and the UI says the cloud is offline.

import { pendingSync } from '../emergency/incidentMachine';
import { CloudIncident, remoteFieldsFrom, toCloudIncident } from '../emergency/cloudMapping';
import { useCloudStore } from '../store/cloudStore';
import { useIncidentStore } from '../store/incidentStore';
import { useWatchStore } from '../store/watchStore';
import { ApiClient, apiClient, ApiError } from './apiClient';
import { Sample } from './sensorService';

export interface CloudReading {
  epoch: number;
  x: number;
  y: number;
  z: number;
}

export interface SyncOptions {
  /** How often a reading and the status are uploaded (ms). Independent of the polling rate. */
  intervalMs: number;
  /** Readings kept while offline. The oldest are dropped first; incidents are never dropped. */
  maxQueuedReadings: number;
  maxBatch: number;
}

export const DEFAULT_SYNC_OPTIONS: SyncOptions = { intervalMs: 15_000, maxQueuedReadings: 1000, maxBatch: 200 };

const RETRY_MS = [2_000, 5_000, 15_000, 30_000, 60_000];
const FOREGROUND_TICK_MS = 5_000;

export class CloudSyncService {
  private started = false;
  private queue: CloudReading[] = [];
  private lastSampleQueuedAt = 0;
  private nextIncidentAttemptAt = 0;
  private nextIntervalAt = 0;
  private attempt = 0;
  private running = false;
  private foregroundTimer: ReturnType<typeof setInterval> | null = null;
  private unsubscribe: (() => void) | null = null;
  private safetyState: () => string = () => 'SENSOR_UNAVAILABLE';

  constructor(
    private readonly client: ApiClient = apiClient,
    private readonly options: SyncOptions = DEFAULT_SYNC_OPTIONS,
    private readonly now: () => number = Date.now,
  ) {}

  setSafetyStateSource(fn: () => string): void {
    this.safetyState = fn;
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    useCloudStore.getState().patch({ status: 'connecting', message: null });
    this.unsubscribe = useIncidentStore.subscribe((s, prev) => {
      if (s.active !== prev.active || s.history !== prev.history) this.kick();
    });
    this.foregroundTimer = setInterval(() => this.tick(this.now()), FOREGROUND_TICK_MS);
    this.tick(this.now());
  }

  stop(): void {
    this.started = false;
    this.unsubscribe?.();
    this.unsubscribe = null;
    if (this.foregroundTimer) clearInterval(this.foregroundTimer);
    this.foregroundTimer = null;
    this.queue = [];
    useCloudStore.getState().reset();
  }

  /** Requests an incident upload at the next opportunity. */
  kick(): void {
    this.nextIncidentAttemptAt = 0;
    if (this.started) this.tick(this.now());
  }

  /** Called for each accepted sample. Downsamples to the cloud interval. */
  addSample(sample: Sample): void {
    if (!this.started) return;
    if (sample.receivedAt - this.lastSampleQueuedAt < this.options.intervalMs) return;
    this.lastSampleQueuedAt = sample.receivedAt;
    this.queue.push({ epoch: sample.epoch, x: sample.x, y: sample.y, z: sample.z });
    if (this.queue.length > this.options.maxQueuedReadings) this.queue.shift();
    useCloudStore.getState().patch({ pendingReadings: this.queue.length });
  }

  tick(now: number): void {
    if (!this.started || this.running) return;
    const incidentsDue = pendingSync(useIncidentStore.getState()).length > 0 && now >= this.nextIncidentAttemptAt;
    const intervalDue = now >= this.nextIntervalAt;
    if (!incidentsDue && !intervalDue) return;
    this.running = true;
    this.pump(now, intervalDue).finally(() => {
      this.running = false;
    });
  }

  /** Uploads whatever is pending. Used before sign-out. Resolves with the incidents left over. */
  async flush(timeoutMs = 8_000): Promise<number> {
    const work = this.uploadIncidents();
    await Promise.race([work.catch(() => undefined), new Promise((r) => setTimeout(r, timeoutMs))]);
    return pendingSync(useIncidentStore.getState()).length;
  }

  private async pump(now: number, intervalDue: boolean): Promise<void> {
    try {
      await this.uploadIncidents();
      if (intervalDue) {
        this.nextIntervalAt = now + this.options.intervalMs;
        await this.uploadReadings();
        await this.uploadStatus();
        await this.pollAcknowledgments();
      }
      this.attempt = 0;
      useCloudStore.getState().patch({ status: 'online', message: null, lastSuccessAt: this.now() });
    } catch (e) {
      this.recordFailure(e, now);
    } finally {
      useCloudStore.getState().patch({ pendingIncidents: pendingSync(useIncidentStore.getState()).length, pendingReadings: this.queue.length });
    }
  }

  private recordFailure(e: unknown, now: number): void {
    const delay = RETRY_MS[Math.min(this.attempt, RETRY_MS.length - 1)];
    this.attempt++;
    this.nextIncidentAttemptAt = now + delay;
    this.nextIntervalAt = Math.max(this.nextIntervalAt, now + delay);
    const err = e as ApiError;
    const unreachable = !(e instanceof ApiError) || err.kind === 'network' || err.kind === 'timeout';
    useCloudStore.getState().patch(
      unreachable
        ? { status: 'offline', message: 'No internet connection to the SafeFall cloud. Alerts are saved and will be sent automatically.' }
        : { status: 'error', message: err.message },
    );
  }

  private async uploadIncidents(): Promise<void> {
    for (const incident of pendingSync(useIncidentStore.getState())) {
      const version = incident.version;
      try {
        const saved = await this.client.request<CloudIncident>('/v1/incidents', { body: toCloudIncident(incident) });
        useIncidentStore.getState().dispatch({ type: 'SYNCED', incidentId: incident.id, version });
        const remote = remoteFieldsFrom(saved);
        if (remote.state) useIncidentStore.getState().dispatch({ type: 'REMOTE_UPDATE', now: this.now(), incidentId: incident.id, remote });
      } catch (e) {
        const permanent = e instanceof ApiError && e.permanent;
        useIncidentStore.getState().dispatch({ type: 'SYNC_FAILED', incidentId: incident.id, error: (e as Error).message });
        // A permanently rejected incident must not block the ones behind it.
        if (!permanent) throw e;
      }
    }
  }

  private async uploadReadings(): Promise<void> {
    while (this.queue.length) {
      const batch = this.queue.slice(0, this.options.maxBatch);
      await this.client.request('/v1/sync/readings', { body: { readings: batch } });
      this.queue.splice(0, batch.length);
    }
  }

  private async uploadStatus(): Promise<void> {
    const { connection, isStale, lastReading } = useWatchStore.getState();
    await this.client.request('/v1/sync/status', {
      body: {
        watchConnectionStatus: connection === 'connected' && isStale ? 'disconnected' : connection,
        safetyState: this.safetyState(),
        lastSync: useCloudStore.getState().lastSuccessAt,
        latest: lastReading ? { epoch: lastReading.epoch, x: lastReading.x, y: lastReading.y, z: lastReading.z } : null,
      },
    });
  }

  /** Brings a caretaker's acknowledgment to the wearer's alert screen. */
  private async pollAcknowledgments(): Promise<void> {
    const { active } = useIncidentStore.getState();
    if (!active || active.syncedVersion === 0 || active.state !== 'escalated') return;
    const { incidents } = await this.client.request<{ incidents: CloudIncident[] }>('/v1/incidents?limit=20');
    const match = incidents.find((i) => i.client_event_id === active.id);
    if (match?.acknowledged_at) {
      useIncidentStore.getState().dispatch({ type: 'REMOTE_UPDATE', now: this.now(), incidentId: active.id, remote: remoteFieldsFrom(match) });
    }
  }
}

export const cloudSyncService = new CloudSyncService();
