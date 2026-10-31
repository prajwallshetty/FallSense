// ConnectionService: owns the watch link. Drives polling, classifies each result, tracks connection
// state and staleness, and passes accepted samples on. It knows nothing about falls or the cloud.
//
// It is event driven: every poll result, success or failure, is one tick of work. On Android those
// results come from a foreground service, so this keeps running in the background where JavaScript
// timers would be paused.

import { useWatchStore, WatchSettings } from '../store/watchStore';
import { checkWatchClock, parseWatchBody } from '../watch/protocol';
import { Sample, SensorBuffer } from './sensorService';
import { PollDriver, PollResult, watchApiService } from './watchApiService';

/** Consecutive failures before a connected watch is reported as disconnected. */
const DISCONNECT_AFTER_FAILURES = 3;
/** Consecutive unusable responses before the link is reported as an error. */
const ERROR_AFTER_INVALID = 3;
/** After this many failures in a row, poll more slowly to save battery. */
const BACKOFF_AFTER_FAILURES = 30;
const BACKOFF_INTERVAL_MS = 5000;
const MIN_STALE_MS = 5000;

export function staleLimitMs(settings: WatchSettings): number {
  return Math.max(MIN_STALE_MS, settings.pollIntervalMs * 4);
}

export interface TestResult {
  ok: boolean;
  message: string;
  latencyMs: number;
  via: 'wifi' | 'default';
}

type SampleListener = (sample: Sample, missed: number) => void;
type LostListener = (at: number) => void;
type TickListener = (at: number) => void;

export class ConnectionService {
  readonly buffer = new SensorBuffer({ expectedIntervalMs: 1000 });
  private driver: PollDriver | null = null;
  private invalidStreak = 0;
  private backedOff = false;
  private lastSentStatus: string | null = null;
  private sensorLost = false;
  private sampleListeners = new Set<SampleListener>();
  private lostListeners = new Set<LostListener>();
  private tickListeners = new Set<TickListener>();

  constructor(
    private readonly createDriver: () => PollDriver = () => watchApiService.createDriver(),
    private readonly now: () => number = Date.now,
  ) {}

  onSample(fn: SampleListener): () => void {
    this.sampleListeners.add(fn);
    return () => this.sampleListeners.delete(fn);
  }

  onSensorLost(fn: LostListener): () => void {
    this.lostListeners.add(fn);
    return () => this.lostListeners.delete(fn);
  }

  /** Fires on every poll result, connected or not. The app's clock while monitoring. */
  onTick(fn: TickListener): () => void {
    this.tickListeners.add(fn);
    return () => this.tickListeners.delete(fn);
  }

  get isRunning(): boolean {
    return this.driver !== null;
  }

  start(): void {
    this.stopDriver();
    const store = useWatchStore.getState();
    const settings = store.settings;
    this.buffer.setExpectedInterval(settings.pollIntervalMs);
    this.invalidStreak = 0;
    this.backedOff = false;
    this.sensorLost = false;
    this.lastSentStatus = null;
    this.driver = this.createDriver();
    store.setMonitoringEnabled(true);
    store.patch({ connection: 'connecting', message: null, consecutiveFailures: 0, backgroundCapable: this.driver.background });
    this.driver.start({ host: settings.host, intervalMs: settings.pollIntervalMs, timeoutMs: settings.timeoutMs }, (r) => this.handle(r));
  }

  /** Stops monitoring on purpose. The last reading stays visible, marked as not live. */
  stop(): void {
    this.stopDriver();
    const store = useWatchStore.getState();
    store.setMonitoringEnabled(false);
    store.patch({ connection: 'idle', message: 'Monitoring is off.', isStale: store.lastReading !== null });
    this.reportLost(this.now());
  }

  /** Clears everything on sign-out so nothing carries over to the next account. */
  shutdown(): void {
    this.stopDriver();
    this.buffer.reset();
    useWatchStore.getState().setMonitoringEnabled(false);
    useWatchStore.getState().resetLive();
    this.sensorLost = false;
  }

  /** Reconnect button: starts a fresh attempt straight away. */
  retry(): void {
    this.start();
  }

  private stopDriver(): void {
    this.driver?.stop();
    this.driver = null;
  }

  async testConnection(): Promise<TestResult> {
    const { host, timeoutMs } = useWatchStore.getState().settings;
    const result = await watchApiService.fetchOnce(host, timeoutMs);
    const base = { latencyMs: Math.round(result.latencyMs), via: result.via };
    if (!result.ok) return { ok: false, message: result.detail, ...base };
    const parsed = parseWatchBody(result.body);
    if (!parsed.ok) return { ok: false, message: `The watch responded, but: ${parsed.detail}`, ...base };
    return { ok: true, message: `Watch responded: X ${parsed.reading.x}, Y ${parsed.reading.y}, Z ${parsed.reading.z}`, ...base };
  }

  /** Public for tests. Poll drivers call this once per finished request. */
  handle(result: PollResult): void {
    const at = this.now();
    if (result.ok) this.handleResponse(result, at);
    else this.handleFailure(result, at);
    this.checkStale(at);
    this.syncNotification();
    this.tickListeners.forEach((fn) => fn(at));
  }

  private handleResponse(result: Extract<PollResult, { ok: true }>, at: number): void {
    const store = useWatchStore.getState();
    const parsed = parseWatchBody(result.body);
    if (!parsed.ok) {
      this.invalidStreak++;
      store.patch({
        invalidResponses: store.invalidResponses + 1,
        latencyMs: result.latencyMs,
        via: result.via,
        ...(this.invalidStreak >= ERROR_AFTER_INVALID ? { connection: 'error' as const, message: parsed.detail } : {}),
      });
      return;
    }

    this.invalidStreak = 0;
    this.restoreInterval();
    const outcome = this.buffer.ingest(parsed.reading, at);
    const patch = {
      connection: 'connected' as const,
      message: null,
      consecutiveFailures: 0,
      latencyMs: result.latencyMs,
      via: result.via,
      stats: { ...this.buffer.stats },
    };
    if (outcome.status !== 'accepted') {
      // The watch answered, so the link is up, but this is not a new reading. If that goes on, the
      // stale check reports it: a stuck clock must not look like live data.
      store.patch(patch);
      return;
    }
    store.patch({
      ...patch,
      lastReading: parsed.reading,
      lastSampleAt: at,
      isStale: false,
      clock: checkWatchClock(parsed.reading.epoch, at),
      history: this.buffer.window(120),
    });
    this.sensorLost = false;
    this.sampleListeners.forEach((fn) => fn(outcome.sample, outcome.missed));
  }

  private handleFailure(result: Extract<PollResult, { ok: false }>, at: number): void {
    const store = useWatchStore.getState();
    const failures = store.consecutiveFailures + 1;
    const wasConnected = store.connection === 'connected';
    const patch: Parameters<typeof store.patch>[0] = { consecutiveFailures: failures, latencyMs: result.latencyMs, via: result.via };
    if (failures >= DISCONNECT_AFTER_FAILURES || (!wasConnected && store.connection !== 'connecting')) {
      patch.connection = 'disconnected';
      patch.message = result.detail;
    }
    store.patch(patch);
    if (failures >= BACKOFF_AFTER_FAILURES) this.backOff();
    void at;
  }

  private checkStale(at: number): void {
    const store = useWatchStore.getState();
    const limit = staleLimitMs(store.settings);
    const reference = store.lastSampleAt;
    if (reference === null) return;
    if (at - reference > limit && !store.isStale) store.patch({ isStale: true });
    if (at - reference > limit) this.reportLost(at);
  }

  private reportLost(at: number): void {
    if (this.sensorLost) return;
    this.sensorLost = true;
    this.lostListeners.forEach((fn) => fn(at));
  }

  private backOff(): void {
    if (this.backedOff || !this.driver) return;
    this.backedOff = true;
    this.restartDriver(BACKOFF_INTERVAL_MS);
  }

  private restoreInterval(): void {
    if (!this.backedOff || !this.driver) return;
    this.backedOff = false;
    this.restartDriver(useWatchStore.getState().settings.pollIntervalMs);
  }

  private restartDriver(intervalMs: number): void {
    const { host, timeoutMs } = useWatchStore.getState().settings;
    this.driver?.stop();
    this.driver?.start({ host, intervalMs, timeoutMs }, (r) => this.handle(r));
  }

  private syncNotification(): void {
    const { connection, isStale, lastReading } = useWatchStore.getState();
    const text =
      connection === 'connected' && !isStale
        ? 'Watch connected. Monitoring is active.'
        : connection === 'connecting'
          ? 'Connecting to your watch.'
          : lastReading
            ? 'Watch not connected. You are NOT being monitored right now.'
            : 'Waiting for your watch. You are NOT being monitored yet.';
    if (text === this.lastSentStatus) return;
    this.lastSentStatus = text;
    watchApiService.setMonitoringStatus(text);
  }
}

export const connectionService = new ConnectionService();
