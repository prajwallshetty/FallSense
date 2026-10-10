// Developer-only simulated SafeFall watch. Emits real protocol v1 byte packets so simulated
// data passes through exactly the same parser, dedupe and state machine as hardware data.
// It is only constructed when EXPO_PUBLIC_ENABLE_DEV_TOOLS=true, and every device it exposes
// is flagged `isSimulated` so the UI can label it and incidents are never sent to caregivers.

import {
  bytesToBase64,
  base64ToBytes,
  CommandCode,
  COMMAND_CHAR_UUID,
  DeviceEventType,
  DeviceState,
  encodeEvent,
  encodeStatus,
  encodeTelemetry,
  EVENT_CHAR_UUID,
  SAFEFALL_SERVICE_UUID,
  STATUS_CHAR_UUID,
  TELEMETRY_CHAR_UUID,
  DEVICE_INFO_SERVICE_UUID,
  FIRMWARE_REVISION_CHAR_UUID,
} from './protocol';
import { AdapterState, BleSubscription, BleTransport, GattTable, ScannedPeripheral } from './transport';

export const SIMULATED_DEVICE_ID = 'SIMULATED-WATCH';
export const SIMULATED_DEVICE_NAME = 'SafeFall Simulator';
const SIM_FIRMWARE = '0.0.0-sim';

type Listener = (error: Error | null, value: string | null) => void;

export class SimulatedTransport implements BleTransport {
  readonly isSimulated = true;

  private connected = false;
  private listeners = new Map<string, Set<Listener>>();
  private disconnectListeners = new Set<(e: Error | null) => void>();
  private timers: ReturnType<typeof setInterval>[] = [];
  private retransmit: ReturnType<typeof setInterval> | null = null;
  private state: DeviceState = DeviceState.Normal;
  private telemetryOn = false;
  private seq = 0;
  private bootAt = Date.now();
  private nextEventId = 1;
  private pendingEvent: Uint8Array | null = null;
  private currentEventId = 0;
  /** Extra latency/failure knobs for testing reconnect UI. */
  failNextConnect = false;

  async getState(): Promise<AdapterState> {
    return 'powered_on';
  }

  onStateChange(cb: (state: AdapterState) => void): BleSubscription {
    const t = setTimeout(() => cb('powered_on'), 0);
    return { remove: () => clearTimeout(t) };
  }

  startScan(onDevice: (p: ScannedPeripheral) => void): void {
    const t = setTimeout(
      () => onDevice({ id: SIMULATED_DEVICE_ID, name: SIMULATED_DEVICE_NAME, rssi: null, looksLikeSafeFall: true }),
      400,
    );
    this.timers.push(t as unknown as ReturnType<typeof setInterval>);
  }

  stopScan(): void {}

  async connect(): Promise<{ name: string | null }> {
    await new Promise((r) => setTimeout(r, 300));
    if (this.failNextConnect) {
      this.failNextConnect = false;
      throw new Error('Simulated connection failure');
    }
    this.connected = true;
    this.startStreams();
    return { name: SIMULATED_DEVICE_NAME };
  }

  async discover(): Promise<GattTable> {
    return {
      [SAFEFALL_SERVICE_UUID]: [TELEMETRY_CHAR_UUID, EVENT_CHAR_UUID, STATUS_CHAR_UUID, COMMAND_CHAR_UUID],
      [DEVICE_INFO_SERVICE_UUID]: [FIRMWARE_REVISION_CHAR_UUID],
    };
  }

  async requestMtu(): Promise<void> {}

  monitor(_id: string, _service: string, characteristic: string, cb: Listener): BleSubscription {
    const key = characteristic.toLowerCase();
    if (!this.listeners.has(key)) this.listeners.set(key, new Set());
    this.listeners.get(key)!.add(cb);
    return { remove: () => this.listeners.get(key)?.delete(cb) };
  }

  async read(_id: string, _service: string, characteristic: string): Promise<string | null> {
    switch (characteristic.toLowerCase()) {
      case STATUS_CHAR_UUID:
        return bytesToBase64(this.statusBytes());
      case EVENT_CHAR_UUID:
        return this.pendingEvent ? bytesToBase64(this.pendingEvent) : null;
      case FIRMWARE_REVISION_CHAR_UUID:
        return bytesToBase64(Uint8Array.from(SIM_FIRMWARE.split('').map((c) => c.charCodeAt(0))));
      default:
        return null;
    }
  }

  async write(_id: string, _service: string, characteristic: string, base64Value: string): Promise<void> {
    if (!this.connected) throw new Error('Not connected');
    if (characteristic.toLowerCase() !== COMMAND_CHAR_UUID) throw new Error('Characteristic not writable');
    const b = base64ToBytes(base64Value);
    const cmd = b[1] as CommandCode;
    const eventId = new DataView(b.buffer, b.byteOffset).getUint32(2, true);
    switch (cmd) {
      case CommandCode.AckEvent:
        if (eventId === this.currentEventId) this.stopRetransmit();
        break;
      case CommandCode.CancelAlarm:
      case CommandCode.Resolve:
        this.stopRetransmit();
        this.state = DeviceState.Normal;
        this.notify(STATUS_CHAR_UUID, this.statusBytes());
        break;
      case CommandCode.SetTelemetry:
        this.telemetryOn = b[6] === 1;
        break;
      case CommandCode.Ping:
        break;
    }
  }

  async disconnect(): Promise<void> {
    this.dropLink(null);
  }

  onDisconnected(_id: string, cb: (error: Error | null) => void): BleSubscription {
    this.disconnectListeners.add(cb);
    return { remove: () => this.disconnectListeners.delete(cb) };
  }

  async readRssi(): Promise<number | null> {
    return null;
  }

  // ---- developer controls ----

  /** Simulates the firmware's free-fall + impact detection followed by confirmation. */
  simulateFall(): void {
    if (!this.connected) return;
    const eventId = this.nextEventId++;
    this.state = DeviceState.PossibleFall;
    this.sendEvent(eventId, DeviceEventType.PossibleFall, 3.4);
    setTimeout(() => {
      if (this.state !== DeviceState.PossibleFall || !this.connected) return;
      this.state = DeviceState.FallAlarm;
      this.sendEvent(eventId, DeviceEventType.FallConfirmed, 3.4);
    }, 2000);
  }

  simulateWatchCancel(): void {
    if (!this.connected || this.currentEventId === 0) return;
    this.state = DeviceState.Cancelled;
    this.sendEvent(this.currentEventId, DeviceEventType.CancelledOnDevice, 0);
    this.state = DeviceState.Normal;
  }

  simulateSosButton(): void {
    if (!this.connected) return;
    this.state = DeviceState.SosAlarm;
    this.sendEvent(this.nextEventId++, DeviceEventType.SosButton, 0);
  }

  /** Simulates the watch walking out of range. */
  simulateLinkLoss(): void {
    this.dropLink(new Error('Simulated link loss'));
  }

  // ---- internals ----

  private statusBytes() {
    return encodeStatus({
      deviceState: this.state,
      batteryPercent: null,
      batteryMillivolts: null,
      charging: false,
      imuOk: true,
      telemetryEnabled: this.telemetryOn,
      firmwareVersion: '0.0.0',
      uptimeMs: Date.now() - this.bootAt,
    });
  }

  private sendEvent(eventId: number, type: DeviceEventType, peak: number) {
    this.currentEventId = eventId;
    this.pendingEvent = encodeEvent({
      eventId,
      eventType: type,
      deviceState: this.state,
      peakAccelG: peak,
      uptimeMs: Date.now() - this.bootAt,
    });
    const packet = this.pendingEvent;
    this.notify(EVENT_CHAR_UUID, packet);
    // Like the real firmware: retransmit every 2 s until acknowledged.
    if (this.retransmit) clearInterval(this.retransmit);
    this.retransmit = setInterval(() => this.notify(EVENT_CHAR_UUID, packet), 2000);
  }

  private stopRetransmit() {
    if (this.retransmit) clearInterval(this.retransmit);
    this.retransmit = null;
    this.pendingEvent = null;
  }

  private notify(char: string, bytes: Uint8Array) {
    if (!this.connected) return;
    const b64 = bytesToBase64(bytes);
    this.listeners.get(char)?.forEach((cb) => cb(null, b64));
  }

  private startStreams() {
    this.stopStreams();
    this.timers.push(setInterval(() => this.notify(STATUS_CHAR_UUID, this.statusBytes()), 5000));
    this.timers.push(
      setInterval(() => {
        if (!this.telemetryOn) return;
        const n = () => (Math.random() - 0.5) * 0.04;
        this.notify(
          TELEMETRY_CHAR_UUID,
          encodeTelemetry({
            seq: this.seq++,
            uptimeMs: Date.now() - this.bootAt,
            accel: { x: n(), y: n(), z: 1 + n() },
            gyro: { x: n() * 50, y: n() * 50, z: n() * 50 },
          }),
        );
      }, 200),
    );
  }

  private stopStreams() {
    this.timers.forEach((t) => clearInterval(t));
    this.timers = [];
  }

  private dropLink(error: Error | null) {
    if (!this.connected) return;
    this.connected = false;
    this.stopStreams();
    if (this.retransmit) clearInterval(this.retransmit);
    this.retransmit = null;
    this.listeners.clear();
    this.disconnectListeners.forEach((cb) => cb(error));
  }
}
