import {
  bytesToBase64,
  CommandCode,
  COMMAND_CHAR_UUID,
  DeviceEventType,
  DeviceState,
  encodeEvent,
  encodeStatus,
  EVENT_CHAR_UUID,
  SAFEFALL_SERVICE_UUID,
  STATUS_CHAR_UUID,
  TELEMETRY_CHAR_UUID,
  base64ToBytes,
} from '../ble/protocol';
import { ConnectionManager, ConnectionSink, DEFAULT_MANAGER_OPTIONS, GattMismatchError, LinkStatus, validateGatt } from '../ble/connectionManager';
import { AdapterState, BleSubscription, BleTransport, GattTable } from '../ble/transport';

class FakeTransport implements BleTransport {
  isSimulated = false;
  connectImpl: () => Promise<{ name: string | null }> = async () => ({ name: 'SafeFall-TEST' });
  gatt: GattTable = { [SAFEFALL_SERVICE_UUID]: [TELEMETRY_CHAR_UUID, EVENT_CHAR_UUID, STATUS_CHAR_UUID, COMMAND_CHAR_UUID] };
  monitors = new Map<string, (e: Error | null, v: string | null) => void>();
  disconnectCbs: ((e: Error | null) => void)[] = [];
  stateCb: ((s: AdapterState) => void) | null = null;
  writes: Uint8Array[] = [];
  reads: Record<string, string | null> = {};
  connectCalls = 0;
  disconnectCalls = 0;
  activeSubs = 0;

  async getState(): Promise<AdapterState> { return 'powered_on'; }
  onStateChange(cb: (s: AdapterState) => void): BleSubscription { this.stateCb = cb; return { remove: () => (this.stateCb = null) }; }
  startScan() {}
  stopScan() {}
  async connect() { this.connectCalls++; return this.connectImpl(); }
  async discover() { return this.gatt; }
  async requestMtu() {}
  monitor(_id: string, _s: string, c: string, cb: (e: Error | null, v: string | null) => void): BleSubscription {
    this.monitors.set(c, cb);
    this.activeSubs++;
    return { remove: () => { this.monitors.delete(c); this.activeSubs--; } };
  }
  async read(_id: string, _s: string, c: string) { return this.reads[c] ?? null; }
  async write(_id: string, _s: string, c: string, v: string) { expect(c).toBe(COMMAND_CHAR_UUID); this.writes.push(base64ToBytes(v)); }
  async disconnect() { this.disconnectCalls++; }
  onDisconnected(_id: string, cb: (e: Error | null) => void): BleSubscription {
    this.disconnectCbs.push(cb);
    this.activeSubs++;
    return { remove: () => { this.disconnectCbs = this.disconnectCbs.filter((x) => x !== cb); this.activeSubs--; } };
  }
  async readRssi() { return null; }

  emit(char: string, bytes: Uint8Array | string) {
    this.monitors.get(char)?.(null, typeof bytes === 'string' ? bytes : bytesToBase64(bytes));
  }
  dropLink() { [...this.disconnectCbs].forEach((cb) => cb(new Error('link lost'))); }
}

function makeSink() {
  const statuses: LinkStatus[] = [];
  const sink: ConnectionSink & Record<string, jest.Mock> = {
    onLinkStatus: jest.fn((s: LinkStatus) => statuses.push(s)),
    onConnected: jest.fn(),
    onStatus: jest.fn(),
    onBatteryLevel: jest.fn(),
    onTelemetry: jest.fn(),
    onEvent: jest.fn(),
    onStale: jest.fn(),
    onProtocolError: jest.fn(),
  };
  return { sink, statuses };
}

const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

const statusBytes = () => encodeStatus({ deviceState: DeviceState.Normal, batteryPercent: 64, batteryMillivolts: 3900, charging: false, imuOk: true, telemetryEnabled: false, firmwareVersion: '1.0.0', uptimeMs: 5 });

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('validateGatt', () => {
  it('rejects devices without the SafeFall service or required characteristics', () => {
    expect(() => validateGatt({})).toThrow(GattMismatchError);
    expect(() => validateGatt({ [SAFEFALL_SERVICE_UUID]: [EVENT_CHAR_UUID] })).toThrow(/missing required/);
    expect(validateGatt({ [SAFEFALL_SERVICE_UUID]: [EVENT_CHAR_UUID, STATUS_CHAR_UUID, COMMAND_CHAR_UUID] }).hasTelemetry).toBe(false);
  });
});

describe('ConnectionManager', () => {
  it('connects, subscribes and dispatches parsed packets', async () => {
    const t = new FakeTransport();
    t.reads[STATUS_CHAR_UUID] = bytesToBase64(statusBytes());
    const { sink, statuses } = makeSink();
    const m = new ConnectionManager(t, sink);
    await m.connect('dev1', { autoReconnect: true });
    expect(statuses).toEqual(['connecting', 'connected']);
    expect(sink.onConnected).toHaveBeenCalledWith(expect.objectContaining({ deviceId: 'dev1', hasTelemetry: true }));
    expect(sink.onStatus).toHaveBeenCalledWith(expect.objectContaining({ batteryPercent: 64 }));

    t.emit(EVENT_CHAR_UUID, encodeEvent({ eventId: 5, eventType: DeviceEventType.FallConfirmed, deviceState: DeviceState.FallAlarm, peakAccelG: 3, uptimeMs: 1 }));
    expect(sink.onEvent).toHaveBeenCalledWith(expect.objectContaining({ eventId: 5 }));
    m.destroy();
  });

  it('delivers an event that was raised while disconnected (read on connect)', async () => {
    const t = new FakeTransport();
    t.reads[EVENT_CHAR_UUID] = bytesToBase64(encodeEvent({ eventId: 9, eventType: DeviceEventType.SosButton, deviceState: DeviceState.SosAlarm, peakAccelG: 0, uptimeMs: 1 }));
    const { sink } = makeSink();
    const m = new ConnectionManager(t, sink);
    await m.connect('dev1', { autoReconnect: false });
    expect(sink.onEvent).toHaveBeenCalledWith(expect.objectContaining({ eventId: 9 }));
    m.destroy();
  });

  it('ignores an all-zero (empty) event characteristic on connect', async () => {
    const t = new FakeTransport();
    t.reads[EVENT_CHAR_UUID] = bytesToBase64(new Uint8Array(16));
    const { sink } = makeSink();
    const m = new ConnectionManager(t, sink);
    await m.connect('dev1', { autoReconnect: false });
    expect(sink.onEvent).not.toHaveBeenCalled();
    expect(sink.onProtocolError).not.toHaveBeenCalled();
    m.destroy();
  });

  it('reports malformed packets without crashing or dropping the link', async () => {
    const t = new FakeTransport();
    const { sink } = makeSink();
    const m = new ConnectionManager(t, sink);
    await m.connect('dev1', { autoReconnect: true });
    t.emit(EVENT_CHAR_UUID, Uint8Array.from([1, 2, 3]));
    t.emit(STATUS_CHAR_UUID, '@@not-base64@@');
    expect(sink.onProtocolError).toHaveBeenCalledTimes(2);
    expect(m.currentStatus).toBe('connected');
    m.destroy();
  });

  it('reports a non-SafeFall device as an error without retrying', async () => {
    const t = new FakeTransport();
    t.gatt = { '0000180d-0000-1000-8000-00805f9b34fb': [] };
    const { sink, statuses } = makeSink();
    const m = new ConnectionManager(t, sink);
    await m.connect('dev1', { autoReconnect: true });
    expect(statuses.at(-1)).toBe('error');
    jest.advanceTimersByTime(60_000);
    expect(t.connectCalls).toBe(1);
    m.destroy();
  });

  it('reports a failed manual connect once when auto-reconnect is off', async () => {
    const t = new FakeTransport();
    t.connectImpl = async () => { throw new Error('timeout'); };
    const { sink, statuses } = makeSink();
    const m = new ConnectionManager(t, sink);
    await m.connect('dev1', { autoReconnect: false });
    expect(statuses).toEqual(['connecting', 'error']);
    jest.advanceTimersByTime(60_000);
    expect(t.connectCalls).toBe(1);
    m.destroy();
  });

  it('reconnects with backoff after link loss and cleans up old subscriptions', async () => {
    const t = new FakeTransport();
    const { sink, statuses } = makeSink();
    const m = new ConnectionManager(t, sink);
    await m.connect('dev1', { autoReconnect: true });
    const subsWhenConnected = t.activeSubs;

    let fail = true;
    t.connectImpl = async () => { if (fail) throw new Error('out of range'); return { name: 'x' }; };
    t.dropLink();
    expect(m.currentStatus).toBe('reconnecting');
    expect(t.activeSubs).toBe(0);

    jest.advanceTimersByTime(DEFAULT_MANAGER_OPTIONS.backoffMs[0]);
    await flush();
    expect(t.connectCalls).toBe(2);
    expect(statuses.at(-1)).toBe('reconnecting');

    // Second retry uses the next (longer) backoff step.
    jest.advanceTimersByTime(DEFAULT_MANAGER_OPTIONS.backoffMs[1] - 1);
    await flush();
    expect(t.connectCalls).toBe(2);
    fail = false;
    jest.advanceTimersByTime(1);
    await flush();
    expect(t.connectCalls).toBe(3);
    expect(m.currentStatus).toBe('connected');
    expect(t.activeSubs).toBe(subsWhenConnected);
    m.destroy();
  });

  it('marks data stale, then forces a reconnect when the watch goes silent', async () => {
    let now = 1_000_000;
    const t = new FakeTransport();
    const { sink } = makeSink();
    const m = new ConnectionManager(t, sink, DEFAULT_MANAGER_OPTIONS, () => now);
    await m.connect('dev1', { autoReconnect: true });

    now += 16_000;
    jest.advanceTimersByTime(5_000);
    expect(sink.onStale).toHaveBeenLastCalledWith(true, expect.any(Number));

    t.emit(STATUS_CHAR_UUID, statusBytes());
    expect(sink.onStale).toHaveBeenLastCalledWith(false, now);

    now += 46_000;
    jest.advanceTimersByTime(5_000);
    expect(m.currentStatus).toBe('reconnecting');
    m.destroy();
  });

  it('user disconnect stops reconnection', async () => {
    const t = new FakeTransport();
    const { sink } = makeSink();
    const m = new ConnectionManager(t, sink);
    await m.connect('dev1', { autoReconnect: true });
    await m.disconnect();
    t.dropLink();
    jest.advanceTimersByTime(120_000);
    await flush();
    expect(t.connectCalls).toBe(1);
    expect(m.currentStatus).toBe('disconnected');
  });

  it('pauses on Bluetooth off and reconnects when it is turned back on', async () => {
    const t = new FakeTransport();
    const { sink } = makeSink();
    const m = new ConnectionManager(t, sink);
    t.stateCb?.('powered_on');
    await m.connect('dev1', { autoReconnect: true });
    t.stateCb?.('powered_off');
    expect(m.currentStatus).toBe('bluetooth_off');
    t.stateCb?.('powered_on');
    await flush();
    expect(t.connectCalls).toBe(2);
    expect(m.currentStatus).toBe('connected');
    m.destroy();
  });

  it('ignores late callbacks from a previous connection generation', async () => {
    const t = new FakeTransport();
    const { sink } = makeSink();
    const m = new ConnectionManager(t, sink);
    await m.connect('dev1', { autoReconnect: true });
    const staleCallback = t.monitors.get(EVENT_CHAR_UUID)!;
    t.dropLink();
    staleCallback(null, bytesToBase64(encodeEvent({ eventId: 1, eventType: DeviceEventType.FallConfirmed, deviceState: DeviceState.FallAlarm, peakAccelG: 3, uptimeMs: 1 })));
    expect(sink.onEvent).not.toHaveBeenCalled();
    m.destroy();
  });

  it('serialises commands and refuses them while disconnected', async () => {
    const t = new FakeTransport();
    const { sink } = makeSink();
    const m = new ConnectionManager(t, sink);
    await expect(m.sendCommand(CommandCode.Ping)).rejects.toThrow(/not connected/);
    await m.connect('dev1', { autoReconnect: false });
    await Promise.all([m.sendCommand(CommandCode.AckEvent, 7), m.sendCommand(CommandCode.CancelAlarm, 7)]);
    // First write is the telemetry on/off sync performed on every connect.
    expect(t.writes.map((w) => w[1])).toEqual([CommandCode.SetTelemetry, CommandCode.AckEvent, CommandCode.CancelAlarm]);
    expect(t.writes[0][6]).toBe(0);
    m.destroy();
  });
});
