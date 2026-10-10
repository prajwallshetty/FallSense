// Owns the lifecycle of the link to one SafeFall watch: connect (with timeout), GATT
// validation, subscriptions, automatic reconnection with backoff, stale-data detection and
// cleanup. UI/state concerns live behind the `ConnectionSink` interface.

import {
  BATTERY_LEVEL_CHAR_UUID,
  BATTERY_SERVICE_UUID,
  CommandCode,
  COMMAND_CHAR_UUID,
  DEVICE_INFO_SERVICE_UUID,
  encodeCommandBase64,
  EventPacket,
  EVENT_CHAR_UUID,
  FIRMWARE_REVISION_CHAR_UUID,
  parseBatteryLevel,
  parseEvent,
  parseStatus,
  parseTelemetry,
  parseUtf8String,
  base64ToBytes,
  ProtocolError,
  SAFEFALL_SERVICE_UUID,
  StatusPacket,
  STATUS_CHAR_UUID,
  TelemetryPacket,
  TELEMETRY_CHAR_UUID,
} from './protocol';
import { AdapterState, BleSubscription, BleTransport, GattTable } from './transport';

export type LinkStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'bluetooth_off'
  | 'unauthorized'
  | 'unsupported'
  | 'error';

export interface ConnectionSink {
  onLinkStatus(status: LinkStatus, detail: { deviceId: string | null; error?: string; nextRetryAt?: number | null }): void;
  onConnected(info: { deviceId: string; name: string | null; firmwareRevision: string | null; hasTelemetry: boolean }): void;
  onStatus(status: StatusPacket): void;
  onBatteryLevel(percent: number): void;
  onTelemetry(t: TelemetryPacket): void;
  /**
   * `ageMs` is how long ago the watch raised the event, derived from the watch's uptime clock
   * (null when unknown). Events read on (re)connect can be old: the watch keeps its latest event
   * readable, so the sink decides whether it is still actionable.
   */
  onEvent(e: EventPacket, meta: { source: 'notify' | 'read'; ageMs: number | null }): void;
  onStale(isStale: boolean, lastPacketAt: number | null): void;
  onProtocolError(message: string): void;
}

export interface ManagerOptions {
  connectTimeoutMs: number;
  /** No packet for this long marks data stale (firmware heartbeats status every 5 s). */
  staleAfterMs: number;
  /** No packet for this long forces a reconnect. */
  reconnectIfSilentMs: number;
  backoffMs: number[];
  /** Automatic reconnection gives up after this many consecutive failed attempts. */
  maxReconnectAttempts: number;
  watchdogIntervalMs: number;
}

export const DEFAULT_MANAGER_OPTIONS: ManagerOptions = {
  connectTimeoutMs: 15_000,
  staleAfterMs: 15_000,
  reconnectIfSilentMs: 45_000,
  backoffMs: [1_000, 2_000, 5_000, 10_000, 20_000, 30_000],
  // ~4.5 minutes of attempts. Afterwards the link shows Disconnected; returning to the app,
  // Bluetooth turning on, or tapping Reconnect starts a fresh round.
  maxReconnectAttempts: 12,
  watchdogIntervalMs: 5_000,
};

export class GattMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GattMismatchError';
  }
}

/** Verifies that the peripheral exposes SafeFall protocol v1. Returns whether telemetry exists. */
export function validateGatt(table: GattTable): { hasTelemetry: boolean; hasBattery: boolean; hasDeviceInfo: boolean } {
  const chars = table[SAFEFALL_SERVICE_UUID];
  if (!chars) {
    throw new GattMismatchError(
      'This device does not expose the SafeFall service. Check that the watch runs SafeFall firmware (protocol v1).',
    );
  }
  const missing = [EVENT_CHAR_UUID, STATUS_CHAR_UUID, COMMAND_CHAR_UUID].filter((c) => !chars.includes(c));
  if (missing.length) {
    throw new GattMismatchError(`Watch firmware is missing required characteristics: ${missing.join(', ')}`);
  }
  return {
    hasTelemetry: chars.includes(TELEMETRY_CHAR_UUID),
    hasBattery: !!table[BATTERY_SERVICE_UUID]?.includes(BATTERY_LEVEL_CHAR_UUID),
    hasDeviceInfo: !!table[DEVICE_INFO_SERVICE_UUID]?.includes(FIRMWARE_REVISION_CHAR_UUID),
  };
}

export class ConnectionManager {
  private status: LinkStatus = 'idle';
  private deviceId: string | null = null;
  private autoReconnect = false;
  private generation = 0;
  private subs: BleSubscription[] = [];
  private stateSub: BleSubscription | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private watchdog: ReturnType<typeof setInterval> | null = null;
  private attempt = 0;
  private lastPacketAt: number | null = null;
  private stale = false;
  private adapterState: AdapterState = 'unknown';
  private commandChain: Promise<unknown> = Promise.resolve();
  private telemetryWanted = false;
  private hasTelemetry = false;
  private appActive = true;
  /** Latest watch uptime from a status packet, with the phone time it was received. */
  private watchClock: { uptimeMs: number; at: number } | null = null;

  constructor(
    readonly transport: BleTransport,
    private readonly sink: ConnectionSink,
    private readonly opts: ManagerOptions = DEFAULT_MANAGER_OPTIONS,
    private readonly now: () => number = Date.now,
  ) {
    this.stateSub = transport.onStateChange((s) => this.handleAdapterState(s));
  }

  get currentStatus(): LinkStatus {
    return this.status;
  }

  get currentDeviceId(): string | null {
    return this.deviceId;
  }

  /**
   * Connects to `deviceId`. With `autoReconnect`, failures and link loss are retried with
   * backoff until `disconnect()` is called; otherwise a failed attempt is reported once.
   */
  async connect(deviceId: string, { autoReconnect }: { autoReconnect: boolean }): Promise<void> {
    if (this.deviceId && this.deviceId !== deviceId) await this.disconnect();
    this.deviceId = deviceId;
    this.autoReconnect = autoReconnect;
    this.attempt = 0;
    this.clearRetry();
    await this.tryConnect(false);
  }

  /** Keep the current link alive from now on (used after a successful first pairing). */
  enableAutoReconnect(): void {
    if (this.deviceId) this.autoReconnect = true;
  }

  /** User-initiated disconnect: stops reconnection and releases the link. */
  async disconnect(): Promise<void> {
    const id = this.deviceId;
    this.autoReconnect = false;
    this.generation++;
    this.clearRetry();
    this.teardown();
    this.deviceId = null;
    if (id) await this.transport.disconnect(id);
    this.setStatus('disconnected', {});
  }

  destroy(): void {
    this.autoReconnect = false;
    this.generation++;
    this.clearRetry();
    this.teardown();
    this.stateSub?.remove();
    this.stateSub = null;
  }

  /** Commands are serialised: Android GATT does not tolerate concurrent operations. */
  sendCommand(command: CommandCode, eventId = 0, arg = 0): Promise<void> {
    const id = this.deviceId;
    const run = async () => {
      if (!id || this.status !== 'connected') throw new Error('Watch is not connected');
      const payload = encodeCommandBase64(command, eventId, arg);
      try {
        await this.transport.write(id, SAFEFALL_SERVICE_UUID, COMMAND_CHAR_UUID, payload);
      } catch {
        // One retry for transient GATT busy errors.
        await this.transport.write(id, SAFEFALL_SERVICE_UUID, COMMAND_CHAR_UUID, payload);
      }
    };
    const p = this.commandChain.then(run, run);
    this.commandChain = p.catch(() => undefined);
    return p;
  }

  /** Telemetry costs watch battery; the app enables it only while the dashboard is visible. */
  setTelemetryEnabled(enabled: boolean): void {
    this.telemetryWanted = enabled;
    this.syncTelemetry();
  }

  /**
   * App moved to background/foreground. In background, telemetry is paused (it only feeds the
   * dashboard) while events and status keep flowing. Coming back resets the reconnect budget and
   * reconnects if the link was given up.
   */
  setAppActive(active: boolean): void {
    if (this.appActive === active) return;
    this.appActive = active;
    this.syncTelemetry();
    if (active && this.deviceId && this.autoReconnect && (this.status === 'disconnected' || this.status === 'error')) {
      this.attempt = 0;
      this.tryConnect(true);
    }
  }

  private syncTelemetry() {
    if (this.status === 'connected' && this.hasTelemetry) {
      this.sendCommand(CommandCode.SetTelemetry, 0, this.telemetryWanted && this.appActive ? 1 : 0).catch(() => undefined);
    }
  }

  /** Estimated age of an event, using the watch's own uptime clock. */
  eventAgeMs(e: EventPacket): number | null {
    if (!this.watchClock) return null;
    // Extrapolate the watch's current uptime from its last status heartbeat.
    const watchNow = this.watchClock.uptimeMs + (this.now() - this.watchClock.at);
    // An event "from the future" means the clocks disagree (e.g. a reboot we have not seen yet).
    if (e.uptimeMs > watchNow + 10_000) return null;
    return Math.max(0, watchNow - e.uptimeMs);
  }

  // ---------------------------------------------------------------------------------------

  private setStatus(status: LinkStatus, detail: { error?: string; nextRetryAt?: number | null }) {
    this.status = status;
    this.sink.onLinkStatus(status, { deviceId: this.deviceId, ...detail });
  }

  private handleAdapterState(s: AdapterState) {
    const prev = this.adapterState;
    this.adapterState = s;
    if (s === 'powered_off') {
      this.generation++;
      this.clearRetry();
      this.teardown();
      this.setStatus('bluetooth_off', { error: 'Bluetooth is turned off.' });
    } else if (s === 'unauthorized') {
      this.setStatus('unauthorized', { error: 'Bluetooth permission has not been granted.' });
    } else if (s === 'unsupported') {
      this.setStatus('unsupported', { error: 'This phone does not support Bluetooth Low Energy.' });
    } else if (s === 'powered_on' && prev !== 'powered_on' && prev !== 'unknown' && this.deviceId && this.autoReconnect) {
      this.attempt = 0;
      this.tryConnect(true);
    }
  }

  private async tryConnect(isRetry: boolean): Promise<void> {
    const id = this.deviceId;
    if (!id) return;
    const gen = ++this.generation;
    this.teardown();
    this.watchClock = null;
    this.setStatus(isRetry ? 'reconnecting' : 'connecting', {});
    try {
      const { name } = await this.transport.connect(id, this.opts.connectTimeoutMs);
      if (gen !== this.generation) return;
      const gatt = await this.transport.discover(id);
      if (gen !== this.generation) return;
      const caps = validateGatt(gatt);
      this.hasTelemetry = caps.hasTelemetry;
      await this.transport.requestMtu(id, 64).catch(() => undefined);
      if (gen !== this.generation) return;

      this.subs.push(this.transport.onDisconnected(id, (err) => this.handleLinkLoss(gen, err)));
      this.subscribe(id, gen, EVENT_CHAR_UUID, (b) => {
        const e = parseEvent(b);
        this.sink.onEvent(e, { source: 'notify', ageMs: this.eventAgeMs(e) });
      });
      this.subscribe(id, gen, STATUS_CHAR_UUID, (b) => this.handleStatus(parseStatus(b)));
      if (caps.hasTelemetry) this.subscribe(id, gen, TELEMETRY_CHAR_UUID, (b) => this.sink.onTelemetry(parseTelemetry(b)));
      if (caps.hasBattery) {
        this.subs.push(
          this.transport.monitor(id, BATTERY_SERVICE_UUID, BATTERY_LEVEL_CHAR_UUID, (err, v) => {
            if (gen !== this.generation || err || !v) return;
            const pct = parseBatteryLevel(v);
            if (pct != null) this.sink.onBatteryLevel(pct);
          }),
        );
      }

      let firmwareRevision: string | null = null;
      if (caps.hasDeviceInfo) {
        const fw = await this.transport.read(id, DEVICE_INFO_SERVICE_UUID, FIRMWARE_REVISION_CHAR_UUID).catch(() => null);
        firmwareRevision = fw ? parseUtf8String(fw) : null;
      }
      if (gen !== this.generation) return;

      this.attempt = 0;
      this.lastPacketAt = this.now();
      this.stale = false;
      this.setStatus('connected', {});
      this.sink.onConnected({ deviceId: id, name, firmwareRevision, hasTelemetry: caps.hasTelemetry });
      this.startWatchdog(gen);

      // Initial reads: current status, and any event the watch raised while disconnected
      // (the firmware keeps the latest unacknowledged event readable).
      await this.readAndDispatch(id, gen, STATUS_CHAR_UUID, (b) => this.handleStatus(parseStatus(b)));
      await this.readAndDispatch(id, gen, EVENT_CHAR_UUID, (b) => {
        const e = parseEvent(b);
        this.sink.onEvent(e, { source: 'read', ageMs: this.eventAgeMs(e) });
      });
      if (caps.hasBattery) {
        const v = await this.transport.read(id, BATTERY_SERVICE_UUID, BATTERY_LEVEL_CHAR_UUID).catch(() => null);
        const pct = v ? parseBatteryLevel(v) : null;
        if (gen === this.generation && pct != null) this.sink.onBatteryLevel(pct);
      }
      if (caps.hasTelemetry) this.syncTelemetry();
    } catch (e) {
      if (gen !== this.generation) return;
      this.teardown();
      await this.transport.disconnect(id);
      const message = e instanceof Error ? e.message : String(e);
      // A watch with incompatible firmware will not fix itself by retrying.
      if (this.autoReconnect && !(e instanceof GattMismatchError)) {
        this.scheduleRetry(message);
      } else {
        this.setStatus('error', { error: message });
      }
    }
  }

  private handleStatus(st: StatusPacket) {
    // A smaller uptime than before means the watch rebooted; the clock simply restarts.
    this.watchClock = { uptimeMs: st.uptimeMs, at: this.now() };
    this.sink.onStatus(st);
  }

  private subscribe(id: string, gen: number, char: string, handle: (bytes: Uint8Array) => void) {
    this.subs.push(
      this.transport.monitor(id, SAFEFALL_SERVICE_UUID, char, (err, value) => {
        if (gen !== this.generation) return;
        if (err) return; // Disconnection is reported via onDisconnected.
        if (!value) return;
        this.markPacket();
        try {
          handle(base64ToBytes(value));
        } catch (e) {
          if (e instanceof ProtocolError) this.sink.onProtocolError(e.message);
          else throw e;
        }
      }),
    );
  }

  private async readAndDispatch(id: string, gen: number, char: string, handle: (bytes: Uint8Array) => void) {
    const v = await this.transport.read(id, SAFEFALL_SERVICE_UUID, char).catch(() => null);
    if (gen !== this.generation || !v) return;
    let bytes: Uint8Array;
    try {
      bytes = base64ToBytes(v);
    } catch (e) {
      this.sink.onProtocolError((e as Error).message);
      return;
    }
    // An all-zero or empty event characteristic means "no pending event".
    if (bytes.length === 0 || bytes.every((b) => b === 0)) return;
    try {
      handle(bytes);
    } catch (e) {
      if (e instanceof ProtocolError) this.sink.onProtocolError(e.message);
      else throw e;
    }
  }

  private markPacket() {
    this.lastPacketAt = this.now();
    if (this.stale) {
      this.stale = false;
      this.sink.onStale(false, this.lastPacketAt);
    }
  }

  private startWatchdog(gen: number) {
    this.stopWatchdog();
    this.watchdog = setInterval(() => {
      if (gen !== this.generation || this.lastPacketAt == null) return;
      const silentFor = this.now() - this.lastPacketAt;
      if (silentFor >= this.opts.reconnectIfSilentMs) {
        this.handleLinkLoss(gen, new Error(`No data from the watch for ${Math.round(silentFor / 1000)} s`));
      } else if (silentFor >= this.opts.staleAfterMs && !this.stale) {
        this.stale = true;
        this.sink.onStale(true, this.lastPacketAt);
      }
    }, this.opts.watchdogIntervalMs);
  }

  private stopWatchdog() {
    if (this.watchdog) clearInterval(this.watchdog);
    this.watchdog = null;
  }

  private handleLinkLoss(gen: number, err: Error | null) {
    if (gen !== this.generation) return;
    const id = this.deviceId;
    this.generation++;
    this.teardown();
    if (id) this.transport.disconnect(id).catch(() => undefined);
    const message = err?.message ?? 'The watch disconnected.';
    if (this.autoReconnect && id) {
      this.attempt = 0;
      this.scheduleRetry(message);
    } else {
      this.setStatus('disconnected', { error: message });
    }
  }

  private scheduleRetry(error: string) {
    this.clearRetry();
    if (this.adapterState === 'powered_off') {
      this.setStatus('bluetooth_off', { error: 'Bluetooth is turned off.' });
      return;
    }
    if (this.attempt >= this.opts.maxReconnectAttempts) {
      this.setStatus('disconnected', {
        error: `Could not reconnect after ${this.opts.maxReconnectAttempts} attempts (${error}). Make sure the watch is switched on and near the phone, then tap Reconnect.`,
        nextRetryAt: null,
      });
      return;
    }
    const delays = this.opts.backoffMs;
    const delay = delays[Math.min(this.attempt, delays.length - 1)];
    this.attempt++;
    const nextRetryAt = this.now() + delay;
    this.setStatus('reconnecting', { error, nextRetryAt });
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.tryConnect(true);
    }, delay);
  }

  private clearRetry() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  private teardown() {
    this.subs.forEach((s) => {
      try {
        s.remove();
      } catch {
        // ignore
      }
    });
    this.subs = [];
    this.stopWatchdog();
  }
}
