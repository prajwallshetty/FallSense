// SafeFall BLE Protocol v1 — shared contract between the mobile app and the watch firmware.
// Specification: docs/BLE_PROTOCOL.md. Reference firmware: firmware/safefall_watch/.
//
// All multi-byte integers are little-endian. Every SafeFall packet starts with
// [protocolVersion:u8][messageType:u8] so the app can reject packets it does not understand.
//
// This module is pure (no React Native imports) so it can be unit-tested and reused.

export const PROTOCOL_VERSION = 1;

/** Base UUID inherited from the original repository: 4FA1xxxx-C4C2-4C2E-9D19-9B92A265E923. */
const uuid = (short: string) => `4fa1${short}-c4c2-4c2e-9d19-9b92a265e923`;

export const SAFEFALL_SERVICE_UUID = uuid('0001');
export const TELEMETRY_CHAR_UUID = uuid('0002'); // notify
export const EVENT_CHAR_UUID = uuid('0003'); // notify + read (latest unacknowledged event)
export const STATUS_CHAR_UUID = uuid('0004'); // notify + read
export const COMMAND_CHAR_UUID = uuid('0005'); // write with response

// Bluetooth SIG standard services (optional on the firmware side, read when present).
export const BATTERY_SERVICE_UUID = '0000180f-0000-1000-8000-00805f9b34fb';
export const BATTERY_LEVEL_CHAR_UUID = '00002a19-0000-1000-8000-00805f9b34fb';
export const DEVICE_INFO_SERVICE_UUID = '0000180a-0000-1000-8000-00805f9b34fb';
export const FIRMWARE_REVISION_CHAR_UUID = '00002a26-0000-1000-8000-00805f9b34fb';

/** Advertised local name prefix the firmware uses (e.g. "SafeFall-1A2B"). */
export const DEVICE_NAME_PREFIX = 'SafeFall';

export enum MessageType {
  Telemetry = 0x01,
  Event = 0x02,
  Status = 0x03,
}

export enum DeviceEventType {
  PossibleFall = 0x01,
  FallConfirmed = 0x02,
  CancelledOnDevice = 0x03,
  SosButton = 0x04,
  Cleared = 0x05,
}

export enum DeviceState {
  Normal = 0,
  PossibleFall = 1,
  FallAlarm = 2,
  Cancelled = 3,
  SosAlarm = 4,
}

export enum CommandCode {
  AckEvent = 0x01,
  CancelAlarm = 0x02,
  Resolve = 0x03,
  SetTelemetry = 0x10,
  Ping = 0x20,
}

export const TELEMETRY_PACKET_LENGTH = 20;
export const EVENT_PACKET_LENGTH = 16;
export const STATUS_PACKET_LENGTH = 14;
export const COMMAND_PACKET_LENGTH = 7;

export const STATUS_FLAG_CHARGING = 0x01;
export const STATUS_FLAG_IMU_OK = 0x02;
export const STATUS_FLAG_TELEMETRY_ON = 0x04;

export const BATTERY_UNKNOWN = 0xff;

export interface TelemetryPacket {
  kind: 'telemetry';
  seq: number;
  uptimeMs: number;
  /** Acceleration in g (from milli-g on the wire). */
  accel: { x: number; y: number; z: number };
  /** Angular rate in degrees/second (from 0.1 dps on the wire). */
  gyro: { x: number; y: number; z: number };
}

export interface EventPacket {
  kind: 'event';
  /** Device-unique, never reused (firmware persists the counter in NVS). */
  eventId: number;
  eventType: DeviceEventType;
  deviceState: DeviceState;
  /** Peak acceleration magnitude in g observed for this event (0 if not applicable). */
  peakAccelG: number;
  uptimeMs: number;
}

export interface StatusPacket {
  kind: 'status';
  deviceState: DeviceState;
  /** 0-100, or null when the firmware cannot measure it. */
  batteryPercent: number | null;
  /** Battery voltage in millivolts, or null when unknown (0 on the wire). */
  batteryMillivolts: number | null;
  charging: boolean;
  imuOk: boolean;
  telemetryEnabled: boolean;
  firmwareVersion: string;
  uptimeMs: number;
}

export type ParsedPacket = TelemetryPacket | EventPacket | StatusPacket;

export class ProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProtocolError';
  }
}

// ---------- base64 (react-native-ble-plx transfers characteristic values as base64) ----------

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_LOOKUP: Record<string, number> = Object.fromEntries(B64.split('').map((c, i) => [c, i]));

export function base64ToBytes(input: string): Uint8Array {
  const clean = input.replace(/[\s=]/g, '');
  if (clean.length % 4 === 1 || /[^A-Za-z0-9+/]/.test(clean)) {
    throw new ProtocolError('Invalid base64 payload');
  }
  const out: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const ch of clean) {
    buffer = (buffer << 6) | B64_LOOKUP[ch];
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >> bits) & 0xff);
    }
  }
  return Uint8Array.from(out);
}

export function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const triple = (b0 << 16) | (b1 << 8) | b2;
    out += B64[(triple >> 18) & 63] + B64[(triple >> 12) & 63];
    out += i + 1 < bytes.length ? B64[(triple >> 6) & 63] : '=';
    out += i + 2 < bytes.length ? B64[triple & 63] : '=';
  }
  return out;
}

// ---------- parsing ----------

const isValidEnum = (e: object, v: number) => Object.values(e).includes(v);

function view(bytes: Uint8Array) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function checkHeader(bytes: Uint8Array, expectedType: MessageType, minLength: number) {
  if (bytes.length < minLength) {
    throw new ProtocolError(`Packet too short: ${bytes.length} < ${minLength} bytes`);
  }
  if (bytes[0] !== PROTOCOL_VERSION) {
    throw new ProtocolError(`Unsupported protocol version ${bytes[0]} (app supports ${PROTOCOL_VERSION})`);
  }
  if (bytes[1] !== expectedType) {
    throw new ProtocolError(`Unexpected message type 0x${bytes[1].toString(16)}`);
  }
}

export function parseTelemetry(bytes: Uint8Array): TelemetryPacket {
  checkHeader(bytes, MessageType.Telemetry, TELEMETRY_PACKET_LENGTH);
  const v = view(bytes);
  return {
    kind: 'telemetry',
    seq: v.getUint16(2, true),
    uptimeMs: v.getUint32(4, true),
    accel: {
      x: v.getInt16(8, true) / 1000,
      y: v.getInt16(10, true) / 1000,
      z: v.getInt16(12, true) / 1000,
    },
    gyro: {
      x: v.getInt16(14, true) / 10,
      y: v.getInt16(16, true) / 10,
      z: v.getInt16(18, true) / 10,
    },
  };
}

export function parseEvent(bytes: Uint8Array): EventPacket {
  checkHeader(bytes, MessageType.Event, EVENT_PACKET_LENGTH);
  const v = view(bytes);
  const eventId = v.getUint32(2, true);
  const eventType = bytes[6];
  const deviceState = bytes[7];
  if (eventId === 0) throw new ProtocolError('Event id 0 is reserved');
  if (!isValidEnum(DeviceEventType, eventType)) throw new ProtocolError(`Unknown event type ${eventType}`);
  if (!isValidEnum(DeviceState, deviceState)) throw new ProtocolError(`Unknown device state ${deviceState}`);
  return {
    kind: 'event',
    eventId,
    eventType,
    deviceState,
    peakAccelG: v.getUint16(8, true) / 1000,
    uptimeMs: v.getUint32(10, true),
  };
}

export function parseStatus(bytes: Uint8Array): StatusPacket {
  checkHeader(bytes, MessageType.Status, STATUS_PACKET_LENGTH);
  const v = view(bytes);
  const deviceState = bytes[2];
  if (!isValidEnum(DeviceState, deviceState)) throw new ProtocolError(`Unknown device state ${deviceState}`);
  const rawBattery = bytes[3];
  const mv = v.getUint16(4, true);
  const flags = bytes[6];
  return {
    kind: 'status',
    deviceState,
    batteryPercent: rawBattery === BATTERY_UNKNOWN || rawBattery > 100 ? null : rawBattery,
    batteryMillivolts: mv === 0 ? null : mv,
    charging: (flags & STATUS_FLAG_CHARGING) !== 0,
    imuOk: (flags & STATUS_FLAG_IMU_OK) !== 0,
    telemetryEnabled: (flags & STATUS_FLAG_TELEMETRY_ON) !== 0,
    firmwareVersion: `${bytes[7]}.${bytes[8]}.${bytes[9]}`,
    uptimeMs: v.getUint32(10, true),
  };
}

/** Decodes a base64 characteristic value received from a specific characteristic. */
export function parseCharacteristic(charUuid: string, base64Value: string): ParsedPacket {
  const bytes = base64ToBytes(base64Value);
  switch (charUuid.toLowerCase()) {
    case TELEMETRY_CHAR_UUID:
      return parseTelemetry(bytes);
    case EVENT_CHAR_UUID:
      return parseEvent(bytes);
    case STATUS_CHAR_UUID:
      return parseStatus(bytes);
    default:
      throw new ProtocolError(`Not a SafeFall characteristic: ${charUuid}`);
  }
}

/** Standard Battery Level characteristic (0x2A19): one byte, 0-100. */
export function parseBatteryLevel(base64Value: string): number | null {
  const bytes = base64ToBytes(base64Value);
  if (bytes.length < 1 || bytes[0] > 100) return null;
  return bytes[0];
}

/** Standard Firmware Revision String (0x2A26): UTF-8/ASCII text. */
export function parseUtf8String(base64Value: string): string {
  const bytes = base64ToBytes(base64Value);
  let s = '';
  for (const b of bytes) {
    if (b === 0) break;
    s += String.fromCharCode(b);
  }
  return s.trim();
}

// ---------- encoding ----------

export function encodeCommand(command: CommandCode, eventId = 0, arg = 0): Uint8Array {
  if (!isValidEnum(CommandCode, command)) throw new ProtocolError(`Unknown command ${command}`);
  if (!Number.isInteger(eventId) || eventId < 0 || eventId > 0xffffffff) {
    throw new ProtocolError('eventId must be a uint32');
  }
  const bytes = new Uint8Array(COMMAND_PACKET_LENGTH);
  const v = view(bytes);
  bytes[0] = PROTOCOL_VERSION;
  bytes[1] = command;
  v.setUint32(2, eventId, true);
  bytes[6] = arg & 0xff;
  return bytes;
}

export const encodeCommandBase64 = (command: CommandCode, eventId = 0, arg = 0) =>
  bytesToBase64(encodeCommand(command, eventId, arg));

// Encoders for packets the firmware sends. Used by the simulator and tests so that simulated
// data always passes through the exact same parser as real hardware data.

export function encodeTelemetry(p: Omit<TelemetryPacket, 'kind'>): Uint8Array {
  const bytes = new Uint8Array(TELEMETRY_PACKET_LENGTH);
  const v = view(bytes);
  const i16 = (n: number) => Math.max(-32768, Math.min(32767, Math.round(n)));
  bytes[0] = PROTOCOL_VERSION;
  bytes[1] = MessageType.Telemetry;
  v.setUint16(2, p.seq & 0xffff, true);
  v.setUint32(4, p.uptimeMs >>> 0, true);
  v.setInt16(8, i16(p.accel.x * 1000), true);
  v.setInt16(10, i16(p.accel.y * 1000), true);
  v.setInt16(12, i16(p.accel.z * 1000), true);
  v.setInt16(14, i16(p.gyro.x * 10), true);
  v.setInt16(16, i16(p.gyro.y * 10), true);
  v.setInt16(18, i16(p.gyro.z * 10), true);
  return bytes;
}

export function encodeEvent(p: Omit<EventPacket, 'kind'>): Uint8Array {
  const bytes = new Uint8Array(EVENT_PACKET_LENGTH);
  const v = view(bytes);
  bytes[0] = PROTOCOL_VERSION;
  bytes[1] = MessageType.Event;
  v.setUint32(2, p.eventId >>> 0, true);
  bytes[6] = p.eventType;
  bytes[7] = p.deviceState;
  v.setUint16(8, Math.min(0xffff, Math.round(p.peakAccelG * 1000)), true);
  v.setUint32(10, p.uptimeMs >>> 0, true);
  return bytes;
}

export function encodeStatus(p: Omit<StatusPacket, 'kind'>): Uint8Array {
  const bytes = new Uint8Array(STATUS_PACKET_LENGTH);
  const v = view(bytes);
  const [maj, min, pat] = p.firmwareVersion.split('.').map((n) => Number.parseInt(n, 10) || 0);
  bytes[0] = PROTOCOL_VERSION;
  bytes[1] = MessageType.Status;
  bytes[2] = p.deviceState;
  bytes[3] = p.batteryPercent == null ? BATTERY_UNKNOWN : p.batteryPercent;
  v.setUint16(4, p.batteryMillivolts ?? 0, true);
  bytes[6] =
    (p.charging ? STATUS_FLAG_CHARGING : 0) |
    (p.imuOk ? STATUS_FLAG_IMU_OK : 0) |
    (p.telemetryEnabled ? STATUS_FLAG_TELEMETRY_ON : 0);
  bytes[7] = maj ?? 0;
  bytes[8] = min ?? 0;
  bytes[9] = pat ?? 0;
  v.setUint32(10, p.uptimeMs >>> 0, true);
  return bytes;
}

export function accelMagnitude(t: TelemetryPacket): number {
  return Math.sqrt(t.accel.x ** 2 + t.accel.y ** 2 + t.accel.z ** 2);
}
