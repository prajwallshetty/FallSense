// Wires the BLE ConnectionManager to app state: device store, incident store, activity log and
// the caregiver-visible device status in Firestore.
//
// Real hardware uses PlxTransport (react-native-ble-plx, needs a dev/release build).
// The simulator is only available when EXPO_PUBLIC_ENABLE_DEV_TOOLS=true; simulated devices are
// flagged everywhere, never uploaded as device status, and their incidents never leave the phone.

import { AppState, Platform } from 'react-native';
import * as Location from 'expo-location';
import { env } from '../config/env';
import { ConnectionManager, ConnectionSink, LinkStatus } from '../ble/connectionManager';
import { CommandCode, DeviceEventType, accelMagnitude } from '../ble/protocol';
import { AdapterState, BleTransport, BleUnavailableError, ScannedPeripheral } from '../ble/transport';
import { SimulatedTransport, SIMULATED_DEVICE_ID } from '../ble/simulatedTransport';
import { useDeviceStore, PairedDevice, ScanBlocker } from '../store/deviceStore';
import { useIncidentStore } from '../store/incidentStore';
import { useActivityStore } from '../store/activityStore';
import { useAuthStore } from '../store/authStore';
import { firebaseService } from './firebase';

const TELEMETRY_UI_INTERVAL_MS = 250;
const CLOUD_STATUS_MIN_INTERVAL_MS = 5 * 60 * 1000;
const LOW_BATTERY_PERCENT = 20;
const SCAN_DURATION_MS = 12_000;
/** Events read from the watch that are older than this are acknowledged but not alarmed on. */
export const STALE_EVENT_MS = 60 * 60 * 1000;
const ADAPTER_WAIT_MS = 4_000;

/** Waits briefly for the Bluetooth adapter to leave the transient "unknown"/"resetting" states. */
export function waitForAdapter(t: BleTransport, timeoutMs = ADAPTER_WAIT_MS): Promise<AdapterState> {
  return new Promise((resolve) => {
    let done = false;
    let sub: { remove(): void } | null = null;
    const finish = (s: AdapterState) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      sub?.remove();
      resolve(s);
    };
    const timer = setTimeout(() => t.getState().then(finish, () => finish('unknown')), timeoutMs);
    sub = t.onStateChange((s) => {
      if (s !== 'unknown' && s !== 'resetting') finish(s);
    });
    t.getState().then(
      (s) => {
        if (s !== 'unknown' && s !== 'resetting') finish(s);
      },
      () => undefined,
    );
  });
}

const BLOCKER_MESSAGES: Record<Exclude<ScanBlocker, null>, string> = {
  bluetooth_off: 'Bluetooth is turned off. Turn it on to find your watch.',
  unauthorized: 'SafeFall is not allowed to use Bluetooth. Allow "Nearby devices" in the app settings.',
  unsupported: 'This phone does not support Bluetooth Low Energy, so it cannot connect to the watch.',
  location_off: 'No watch found and location services are off. On many Android phones Bluetooth scanning only works with location turned on.',
};

type PendingCommand = { command: CommandCode.CancelAlarm | CommandCode.Resolve; deviceId: string; eventId: number };

class BleService {
  private realTransport: BleTransport | null = null;
  private realUnavailableReason: string | null = null;
  private simTransport: SimulatedTransport | null = null;
  private manager: ConnectionManager | null = null;
  private managerIsSimulated = false;
  private scanTimer: ReturnType<typeof setTimeout> | null = null;
  private scanningTransports: BleTransport[] = [];
  private lastTelemetryUi = 0;
  private lastCloudUpload = 0;
  private lastCloudSignature = '';
  private lowBatteryLogged = false;
  private pendingCommands: PendingCommand[] = [];
  private appStateSub: { remove(): void } | null = null;

  /** Forwards app foreground/background changes to the connection manager. */
  private watchAppState() {
    if (this.appStateSub) return;
    this.appStateSub = AppState.addEventListener('change', (state) => {
      this.manager?.setAppActive(state === 'active');
      if (state !== 'active') this.stopScan();
    });
  }

  /** Why real BLE cannot be used in this build, or null if it can. */
  get unavailableReason(): string | null {
    this.ensureRealTransport();
    return this.realUnavailableReason;
  }

  get simulatorEnabled(): boolean {
    return env.devToolsEnabled;
  }

  /** Developer controls for the simulated watch (null unless dev tools are enabled). */
  get simulator(): SimulatedTransport | null {
    if (!env.devToolsEnabled) return null;
    if (!this.simTransport) this.simTransport = new SimulatedTransport();
    return this.simTransport;
  }

  // ------------------------------------------------------------------ scanning

  async startScan(): Promise<void> {
    const store = useDeviceStore.getState();
    this.stopScan();
    store.patch({ scanning: true, scanResults: [], scanError: null, scanBlocker: null });
    const transports: BleTransport[] = [];
    const real = this.ensureRealTransport();
    let blocker: ScanBlocker = null;
    if (real) {
      const state = await waitForAdapter(real);
      if (state === 'powered_on' || state === 'unknown') transports.push(real);
      else blocker = state === 'powered_off' ? 'bluetooth_off' : state === 'unauthorized' ? 'unauthorized' : state === 'unsupported' ? 'unsupported' : null;
    }
    if (this.simulator) transports.push(this.simulator);
    if (blocker) store.patch({ scanBlocker: blocker, scanError: BLOCKER_MESSAGES[blocker] });
    if (transports.length === 0) {
      store.patch({ scanning: false, scanError: blocker ? BLOCKER_MESSAGES[blocker] : this.realUnavailableReason });
      return;
    }
    this.scanningTransports = transports;
    for (const t of transports) {
      t.startScan(
        (p) => useDeviceStore.getState().addScanResult(p),
        (e) => useDeviceStore.getState().patch({ scanError: e.message, scanning: false }),
      );
    }
    this.scanTimer = setTimeout(() => {
      this.stopScan();
      this.diagnoseEmptyScan(!!real && transports.includes(real)).catch(() => undefined);
    }, SCAN_DURATION_MS);
  }

  /** After a real scan that found no SafeFall watch, explain the most common Android cause. */
  private async diagnoseEmptyScan(realScanned: boolean): Promise<void> {
    if (!realScanned || Platform.OS !== 'android') return;
    const found = useDeviceStore.getState().scanResults.some((r) => r.looksLikeSafeFall && r.id !== SIMULATED_DEVICE_ID);
    if (found) return;
    if (!(await Location.hasServicesEnabledAsync())) {
      useDeviceStore.getState().patch({ scanBlocker: 'location_off', scanError: BLOCKER_MESSAGES.location_off });
    }
  }

  stopScan(): void {
    if (this.scanTimer) clearTimeout(this.scanTimer);
    this.scanTimer = null;
    this.scanningTransports.forEach((t) => t.stopScan());
    this.scanningTransports = [];
    useDeviceStore.getState().patch({ scanning: false });
  }

  // ------------------------------------------------------------------ pairing

  /** Connects to a scanned watch and, on success, remembers it for automatic reconnection. */
  async pair(p: ScannedPeripheral): Promise<void> {
    this.stopScan();
    const isSimulated = p.id === SIMULATED_DEVICE_ID && this.simulator !== null;
    const manager = this.managerFor(isSimulated);
    await manager.connect(p.id, { autoReconnect: false });
    if (manager.currentStatus !== 'connected') {
      throw new Error(useDeviceStore.getState().linkError ?? 'Could not connect to the watch.');
    }
    const paired: PairedDevice = { deviceId: p.id, name: p.name ?? 'SafeFall watch', pairedAt: Date.now(), isSimulated };
    useDeviceStore.getState().setPaired(paired);
    useActivityStore.getState().log('watch_paired', paired.name, isSimulated);
    this.watchAppState();
    // From now on keep the link alive.
    manager.enableAutoReconnect();
  }

  async unpair(): Promise<void> {
    const paired = useDeviceStore.getState().paired;
    await this.manager?.disconnect();
    this.manager?.destroy();
    this.manager = null;
    this.pendingCommands = [];
    useDeviceStore.getState().setPaired(null);
    useDeviceStore.getState().resetLive();
    if (paired) {
      useActivityStore.getState().log('watch_unpaired', paired.name, paired.isSimulated);
      this.uploadCloudStatus(true, paired, 'unpaired');
    }
  }

  /** Called when an elderly user's session starts: reconnect to the remembered watch. */
  async resume(): Promise<void> {
    const paired = useDeviceStore.getState().paired;
    if (!paired) return;
    if (paired.isSimulated && !env.devToolsEnabled) {
      // A simulator pairing must never survive into a build without dev tools.
      useDeviceStore.getState().setPaired(null);
      return;
    }
    if (!paired.isSimulated && !this.ensureRealTransport()) {
      useDeviceStore.getState().patch({ linkStatus: 'error', linkError: this.realUnavailableReason });
      return;
    }
    this.watchAppState();
    const manager = this.managerFor(paired.isSimulated);
    if (manager.currentDeviceId === paired.deviceId && manager.currentStatus !== 'disconnected' && manager.currentStatus !== 'idle') return;
    await manager.connect(paired.deviceId, { autoReconnect: true });
  }

  /** Session ended (sign-out): release the radio but keep nothing connected. */
  async stop(): Promise<void> {
    this.stopScan();
    this.appStateSub?.remove();
    this.appStateSub = null;
    await this.manager?.disconnect().catch(() => undefined);
    this.manager?.destroy();
    this.manager = null;
    this.pendingCommands = [];
    useDeviceStore.getState().resetLive();
  }

  async reconnectNow(): Promise<void> {
    const paired = useDeviceStore.getState().paired;
    if (!paired) return;
    const manager = this.managerFor(paired.isSimulated);
    await manager.connect(paired.deviceId, { autoReconnect: true });
  }

  setTelemetryEnabled(enabled: boolean): void {
    this.manager?.setTelemetryEnabled(enabled);
    if (!enabled) useDeviceStore.getState().patch({ telemetry: null });
  }

  /**
   * Sends ACK / CANCEL / RESOLVE for an incident's device event. CANCEL and RESOLVE are queued and
   * replayed on reconnect if the watch is currently unreachable, so its alarm state is cleared.
   */
  async sendIncidentCommand(command: 'ack' | 'cancel' | 'resolve', deviceId: string, eventId: number): Promise<void> {
    const code = command === 'ack' ? CommandCode.AckEvent : command === 'cancel' ? CommandCode.CancelAlarm : CommandCode.Resolve;
    const m = this.manager;
    const deliverable = m && m.currentDeviceId === deviceId && m.currentStatus === 'connected';
    if (deliverable) {
      try {
        await m.sendCommand(code, eventId);
        return;
      } catch {
        // fall through to queue
      }
    }
    // ACKs are not queued: the watch keeps retransmitting and the app re-ACKs duplicates.
    if (code !== CommandCode.AckEvent) {
      this.pendingCommands = [...this.pendingCommands.filter((c) => c.eventId !== eventId), { command: code, deviceId, eventId }];
    }
  }

  // ------------------------------------------------------------------ internals

  private ensureRealTransport(): BleTransport | null {
    if (this.realTransport) return this.realTransport;
    if (this.realUnavailableReason) return null;
    try {
      // Required lazily so Expo Go / tests without the native module still load the app.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { PlxTransport } = require('../ble/plxTransport') as typeof import('../ble/plxTransport');
      this.realTransport = new PlxTransport();
    } catch (e) {
      this.realUnavailableReason = e instanceof BleUnavailableError ? e.message : `Bluetooth unavailable: ${(e as Error).message}`;
    }
    return this.realTransport;
  }

  private managerFor(simulated: boolean): ConnectionManager {
    if (this.manager && this.managerIsSimulated === simulated) return this.manager;
    this.manager?.destroy();
    const transport = simulated ? this.simulator : this.ensureRealTransport();
    if (!transport) throw new Error(this.realUnavailableReason ?? 'Bluetooth is unavailable.');
    this.manager = new ConnectionManager(transport, this.makeSink(simulated));
    this.managerIsSimulated = simulated;
    return this.manager;
  }

  private makeSink(simulated: boolean): ConnectionSink {
    const device = () => useDeviceStore.getState();
    const activity = () => useActivityStore.getState();
    const name = () => device().paired?.name ?? 'Watch';

    return {
      onLinkStatus: (status: LinkStatus, detail) => {
        const prev = device().linkStatus;
        device().patch({
          linkStatus: status,
          linkError: detail.error ?? null,
          nextRetryAt: detail.nextRetryAt ?? null,
          ...(status !== 'connected' ? { telemetry: null, isStale: false } : {}),
        });
        if (prev === 'connected' && status !== 'connected') {
          activity().log('watch_disconnected', detail.error ?? name(), simulated);
          this.uploadCloudStatus(true);
        } else if (status === 'reconnecting' && prev !== 'reconnecting') {
          activity().log('watch_reconnecting', detail.error ?? name(), simulated);
        }
      },
      onConnected: (info) => {
        device().patch({ firmwareVersion: info.firmwareRevision, hasTelemetry: info.hasTelemetry, protocolErrors: 0, lastProtocolError: null });
        activity().log('watch_connected', info.name ?? name(), simulated);
        this.flushPendingCommands(info.deviceId);
        this.uploadCloudStatus(true);
      },
      onStatus: (s) => {
        device().patch({
          deviceState: s.deviceState,
          imuOk: s.imuOk,
          charging: s.charging,
          batteryMillivolts: s.batteryMillivolts,
          ...(s.batteryPercent != null ? { batteryPercent: s.batteryPercent } : {}),
          firmwareVersion: device().firmwareVersion ?? s.firmwareVersion,
          lastPacketAt: Date.now(),
        });
        this.checkBattery(simulated);
        this.uploadCloudStatus(false);
      },
      onBatteryLevel: (pct) => {
        device().patch({ batteryPercent: pct });
        this.checkBattery(simulated);
      },
      onTelemetry: (t) => {
        const now = Date.now();
        if (now - this.lastTelemetryUi < TELEMETRY_UI_INTERVAL_MS) return;
        this.lastTelemetryUi = now;
        device().patch({ telemetry: { accel: t.accel, gyro: t.gyro, magnitudeG: accelMagnitude(t), receivedAt: now }, lastPacketAt: now });
      },
      onEvent: (e, meta) => {
        device().patch({ deviceState: e.deviceState, lastPacketAt: Date.now() });
        const auth = useAuthStore.getState();
        const deviceId = this.manager?.currentDeviceId;
        if (!deviceId || !auth.profile || auth.profile.role !== 'elderly') return; // not ACKed: watch keeps retrying
        if (meta.ageMs != null && meta.ageMs > STALE_EVENT_MS) {
          // Old event still readable on the watch (e.g. after reinstalling the app): acknowledge it
          // so the watch stops offering it, but do not raise an alarm for something hours old.
          this.manager?.sendCommand(CommandCode.AckEvent, e.eventId).catch(() => undefined);
          activity().log('incident', `Ignored ${DeviceEventType[e.eventType]} from ${Math.round(meta.ageMs / 60_000)} min ago (too old to act on)`, simulated);
          return;
        }
        const { duplicate } = useIncidentStore.getState().dispatch({
          type: 'DEVICE_EVENT',
          now: Date.now(),
          owner: { uid: auth.profile.userId, name: auth.profile.fullName },
          deviceId,
          simulated,
          event: e,
          lateByMs: meta.ageMs ?? undefined,
        });
        if (!duplicate) activity().log('incident', `Watch reported ${DeviceEventType[e.eventType]}`, simulated);
      },
      onStale: (isStale) => {
        device().patch({ isStale });
        if (isStale) activity().log('data_stale', 'No data from the watch for 15 seconds', simulated);
      },
      onProtocolError: (message) => {
        device().patch({ protocolErrors: device().protocolErrors + 1, lastProtocolError: message });
        activity().log('protocol_error', message, simulated);
      },
    };
  }

  private flushPendingCommands(deviceId: string) {
    const toSend = this.pendingCommands.filter((c) => c.deviceId === deviceId);
    this.pendingCommands = this.pendingCommands.filter((c) => c.deviceId !== deviceId);
    for (const c of toSend) {
      this.manager?.sendCommand(c.command, c.eventId).catch(() => {
        this.pendingCommands.push(c);
      });
    }
  }

  private checkBattery(simulated: boolean) {
    const pct = useDeviceStore.getState().batteryPercent;
    if (pct == null) return;
    if (pct <= LOW_BATTERY_PERCENT && !this.lowBatteryLogged) {
      this.lowBatteryLogged = true;
      useActivityStore.getState().log('battery_low', `Watch battery at ${pct}%`, simulated);
    } else if (pct > LOW_BATTERY_PERCENT + 5) {
      this.lowBatteryLogged = false;
    }
  }

  /** Mirrors watch status to Firestore so linked caregivers can see it. Never for simulators. */
  private uploadCloudStatus(force: boolean, pairedOverride?: PairedDevice, statusOverride?: string) {
    const s = useDeviceStore.getState();
    const paired = pairedOverride ?? s.paired;
    const profile = useAuthStore.getState().profile;
    if (!paired || paired.isSimulated || !profile || profile.role !== 'elderly') return;
    const linkStatus = statusOverride ?? s.linkStatus;
    const signature = `${linkStatus}|${s.batteryPercent == null ? '?' : Math.round(s.batteryPercent / 5)}|${s.firmwareVersion}`;
    const now = Date.now();
    if (!force && signature === this.lastCloudSignature && now - this.lastCloudUpload < CLOUD_STATUS_MIN_INTERVAL_MS) return;
    this.lastCloudSignature = signature;
    this.lastCloudUpload = now;
    firebaseService
      .upsertDeviceStatus(profile.userId, {
        deviceId: paired.deviceId,
        name: paired.name,
        firmwareVersion: s.firmwareVersion,
        batteryPercent: s.batteryPercent,
        linkStatus,
        lastSeenAt: s.lastPacketAt,
        updatedAt: now,
      })
      .catch(() => undefined); // Best effort; the next status change retries.
  }
}

export const bleService = new BleService();
