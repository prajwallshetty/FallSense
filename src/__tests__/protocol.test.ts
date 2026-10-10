import {
  base64ToBytes,
  bytesToBase64,
  CommandCode,
  DeviceEventType,
  DeviceState,
  encodeCommand,
  encodeEvent,
  encodeStatus,
  encodeTelemetry,
  EVENT_CHAR_UUID,
  parseBatteryLevel,
  parseCharacteristic,
  parseEvent,
  parseStatus,
  parseTelemetry,
  parseUtf8String,
  ProtocolError,
  PROTOCOL_VERSION,
  STATUS_CHAR_UUID,
  TELEMETRY_CHAR_UUID,
} from '../ble/protocol';

describe('base64', () => {
  it('round-trips arbitrary bytes of every padding length', () => {
    for (let len = 0; len < 40; len++) {
      const bytes = Uint8Array.from({ length: len }, (_, i) => (i * 37 + 11) & 0xff);
      expect(Array.from(base64ToBytes(bytesToBase64(bytes)))).toEqual(Array.from(bytes));
    }
  });

  it('matches the platform encoder', () => {
    const bytes = Uint8Array.from([1, 2, 3, 250, 251, 252, 0]);
    expect(bytesToBase64(bytes)).toBe(Buffer.from(bytes).toString('base64'));
  });

  it('rejects invalid input', () => {
    expect(() => base64ToBytes('ab$d')).toThrow(ProtocolError);
    expect(() => base64ToBytes('a')).toThrow(ProtocolError);
  });
});

describe('telemetry packets', () => {
  it('decodes units correctly (milli-g, 0.1 dps, little-endian)', () => {
    const packet = parseTelemetry(
      encodeTelemetry({ seq: 513, uptimeMs: 123456, accel: { x: -0.5, y: 1.001, z: 2.25 }, gyro: { x: -120.5, y: 0, z: 300.1 } }),
    );
    expect(packet.seq).toBe(513);
    expect(packet.uptimeMs).toBe(123456);
    expect(packet.accel).toEqual({ x: -0.5, y: 1.001, z: 2.25 });
    expect(packet.gyro.x).toBeCloseTo(-120.5);
    expect(packet.gyro.z).toBeCloseTo(300.1);
  });

  it('matches a hand-built byte layout', () => {
    // ver=1 type=1 seq=0x0102 uptime=0x00000010 ax=1000 ay=-1000 az=0 gx=10 gy=-10 gz=0
    const bytes = Uint8Array.from([1, 1, 0x02, 0x01, 0x10, 0, 0, 0, 0xe8, 0x03, 0x18, 0xfc, 0, 0, 10, 0, 0xf6, 0xff, 0, 0]);
    const p = parseTelemetry(bytes);
    expect(p.seq).toBe(0x0102);
    expect(p.accel).toEqual({ x: 1, y: -1, z: 0 });
    expect(p.gyro).toEqual({ x: 1, y: -1, z: 0 });
  });

  it('clamps out-of-range values instead of overflowing', () => {
    const p = parseTelemetry(encodeTelemetry({ seq: 0, uptimeMs: 0, accel: { x: 99, y: -99, z: 0 }, gyro: { x: 0, y: 0, z: 0 } }));
    expect(p.accel.x).toBeCloseTo(32.767);
    expect(p.accel.y).toBeCloseTo(-32.768);
  });
});

describe('malformed packets', () => {
  const goodEvent = () =>
    encodeEvent({ eventId: 7, eventType: DeviceEventType.FallConfirmed, deviceState: DeviceState.FallAlarm, peakAccelG: 3.2, uptimeMs: 99 });

  it('rejects short packets', () => {
    expect(() => parseEvent(goodEvent().slice(0, 10))).toThrow(/too short/);
    expect(() => parseTelemetry(new Uint8Array(0))).toThrow(ProtocolError);
    expect(() => parseStatus(Uint8Array.from([1, 3]))).toThrow(ProtocolError);
  });

  it('rejects wrong protocol versions', () => {
    const b = goodEvent();
    b[0] = PROTOCOL_VERSION + 1;
    expect(() => parseEvent(b)).toThrow(/Unsupported protocol version/);
  });

  it('rejects wrong message types on a characteristic', () => {
    const telemetryB64 = bytesToBase64(encodeTelemetry({ seq: 1, uptimeMs: 1, accel: { x: 0, y: 0, z: 1 }, gyro: { x: 0, y: 0, z: 0 } }));
    expect(() => parseCharacteristic(EVENT_CHAR_UUID, telemetryB64)).toThrow(/Unexpected message type/);
  });

  it('rejects unknown event types, states and the reserved id 0', () => {
    const b = goodEvent();
    b[6] = 0x99;
    expect(() => parseEvent(b)).toThrow(/Unknown event type/);
    const c = goodEvent();
    c[7] = 42;
    expect(() => parseEvent(c)).toThrow(/Unknown device state/);
    const d = encodeEvent({ eventId: 0, eventType: DeviceEventType.SosButton, deviceState: DeviceState.SosAlarm, peakAccelG: 0, uptimeMs: 0 });
    expect(() => parseEvent(d)).toThrow(/reserved/);
  });

  it('rejects unknown characteristics', () => {
    expect(() => parseCharacteristic('0000ffff-0000-1000-8000-00805f9b34fb', 'AQE=')).toThrow(/Not a SafeFall/);
  });

  it('accepts longer packets from newer minor firmware (forward compatible trailing bytes)', () => {
    const b = new Uint8Array(24);
    b.set(goodEvent());
    expect(parseEvent(b).eventId).toBe(7);
  });
});

describe('event and status packets', () => {
  it('round-trips events through base64 like the BLE stack delivers them', () => {
    const b64 = bytesToBase64(goodEventBytes());
    const p = parseCharacteristic(EVENT_CHAR_UUID.toUpperCase(), b64);
    expect(p).toEqual({ kind: 'event', eventId: 0xdeadbeef, eventType: DeviceEventType.PossibleFall, deviceState: DeviceState.PossibleFall, peakAccelG: 2.75, uptimeMs: 5000 });
  });

  it('decodes status flags, unknown battery and firmware version', () => {
    const p = parseCharacteristic(
      STATUS_CHAR_UUID,
      bytesToBase64(encodeStatus({ deviceState: DeviceState.Normal, batteryPercent: null, batteryMillivolts: null, charging: true, imuOk: false, telemetryEnabled: true, firmwareVersion: '1.4.2', uptimeMs: 77 })),
    );
    expect(p).toMatchObject({ kind: 'status', batteryPercent: null, batteryMillivolts: null, charging: true, imuOk: false, telemetryEnabled: true, firmwareVersion: '1.4.2' });
  });

  it('treats battery values above 100 as unknown', () => {
    const b = encodeStatus({ deviceState: DeviceState.Normal, batteryPercent: 50, batteryMillivolts: 3900, charging: false, imuOk: true, telemetryEnabled: false, firmwareVersion: '1.0.0', uptimeMs: 0 });
    b[3] = 180;
    expect(parseStatus(b).batteryPercent).toBeNull();
  });

  it('parses telemetry via characteristic dispatch', () => {
    const b64 = bytesToBase64(encodeTelemetry({ seq: 9, uptimeMs: 1, accel: { x: 0, y: 0, z: 1 }, gyro: { x: 0, y: 0, z: 0 } }));
    expect(parseCharacteristic(TELEMETRY_CHAR_UUID, b64).kind).toBe('telemetry');
  });
});

function goodEventBytes() {
  return encodeEvent({ eventId: 0xdeadbeef, eventType: DeviceEventType.PossibleFall, deviceState: DeviceState.PossibleFall, peakAccelG: 2.75, uptimeMs: 5000 });
}

describe('commands', () => {
  it('encodes the 7-byte command layout', () => {
    expect(Array.from(encodeCommand(CommandCode.AckEvent, 0x01020304))).toEqual([1, 0x01, 4, 3, 2, 1, 0]);
    expect(Array.from(encodeCommand(CommandCode.SetTelemetry, 0, 1))).toEqual([1, 0x10, 0, 0, 0, 0, 1]);
  });

  it('rejects invalid commands and ids', () => {
    expect(() => encodeCommand(0x77 as CommandCode)).toThrow(ProtocolError);
    expect(() => encodeCommand(CommandCode.AckEvent, -1)).toThrow(ProtocolError);
    expect(() => encodeCommand(CommandCode.AckEvent, 2 ** 32)).toThrow(ProtocolError);
  });
});

describe('standard characteristics', () => {
  it('parses battery level and firmware strings', () => {
    expect(parseBatteryLevel(bytesToBase64(Uint8Array.from([87])))).toBe(87);
    expect(parseBatteryLevel(bytesToBase64(Uint8Array.from([255])))).toBeNull();
    expect(parseBatteryLevel('')).toBeNull();
    expect(parseUtf8String(bytesToBase64(Uint8Array.from([0x31, 0x2e, 0x30, 0x2e, 0x30, 0])))).toBe('1.0.0');
  });
});

describe('cross-check with firmware encoder (firmware/test/host_test.cpp --hex)', () => {
  // Golden vectors produced by the firmware's C++ sf_encode_* functions.
  const hex = (h: string) => Uint8Array.from(h.match(/../g)!.map((b) => parseInt(b, 16)));

  it('parses firmware telemetry bytes', () => {
    expect(parseTelemetry(hex('0101020110000000e80318fc00000a00f6ff0000'))).toEqual({
      kind: 'telemetry', seq: 0x0102, uptimeMs: 0x10, accel: { x: 1, y: -1, z: 0 }, gyro: { x: 1, y: -1, z: 0 },
    });
  });

  it('parses firmware event bytes', () => {
    expect(parseEvent(hex('0102efbeadde0101be0a881300000000'))).toEqual({
      kind: 'event', eventId: 0xdeadbeef, eventType: DeviceEventType.PossibleFall, deviceState: DeviceState.PossibleFall, peakAccelG: 2.75, uptimeMs: 5000,
    });
  });

  it('parses firmware status bytes', () => {
    expect(parseStatus(hex('010300403c0f020100004d000000'))).toMatchObject({
      deviceState: DeviceState.Normal, batteryPercent: 64, batteryMillivolts: 3900, imuOk: true, charging: false, telemetryEnabled: false, firmwareVersion: '1.0.0', uptimeMs: 77,
    });
  });

  it('TypeScript encoders produce identical bytes', () => {
    expect(bytesToBase64(encodeEvent({ eventId: 0xdeadbeef, eventType: DeviceEventType.PossibleFall, deviceState: DeviceState.PossibleFall, peakAccelG: 2.75, uptimeMs: 5000 }))).toBe(
      bytesToBase64(hex('0102efbeadde0101be0a881300000000')),
    );
  });
});
