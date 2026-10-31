// The watch's local HTTP API. Confirmed response of GET http://192.168.4.1/data:
//
//   { "time": "18:01:32", "date": "Fri, 30 Oct 2026", "x": -0.353, "y": -0.231, "z": -0.781,
//     "epoch": 1793363492 }
//
// `epoch` is true UTC seconds, while `time` and `date` are the watch's local wall clock, so ordering
// always uses `epoch` and `time`/`date` are display-only. Nothing else is parsed or invented: no
// gyroscope, GPS, battery or fall fields exist. The x/y/z units are not confirmed, so none are shown.

export interface WatchReading {
  time: string;
  date: string;
  x: number;
  y: number;
  z: number;
  /** UTC seconds from the watch clock. */
  epoch: number;
}

export type ParseFailure =
  | 'invalid_json'
  | 'not_an_object'
  | 'missing_field'
  | 'invalid_number'
  | 'invalid_timestamp';

export type ParseResult = { ok: true; reading: WatchReading } | { ok: false; error: ParseFailure; detail: string };

/** Values beyond this cannot be sensor output in any plausible unit, so they mean corrupt data. */
const MAX_AXIS_MAGNITUDE = 100_000;

const fail = (error: ParseFailure, detail: string): ParseResult => ({ ok: false, error, detail });

export function parseWatchBody(body: string): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return fail('invalid_json', 'The watch response was not valid JSON.');
  }
  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    return fail('not_an_object', 'The watch response was not a JSON object.');
  }
  const o = json as Record<string, unknown>;

  for (const key of ['time', 'date', 'x', 'y', 'z', 'epoch']) {
    if (o[key] === undefined || o[key] === null) return fail('missing_field', `The watch response has no "${key}" field.`);
  }
  for (const key of ['x', 'y', 'z'] as const) {
    const v = o[key];
    if (typeof v !== 'number' || !Number.isFinite(v) || Math.abs(v) > MAX_AXIS_MAGNITUDE) {
      return fail('invalid_number', `The watch sent an invalid value for "${key}".`);
    }
  }
  const { epoch, time, date } = o;
  if (typeof epoch !== 'number' || !Number.isInteger(epoch) || epoch <= 0) {
    return fail('invalid_timestamp', 'The watch sent an invalid timestamp.');
  }
  if (typeof time !== 'string' || typeof date !== 'string' || !time || !date) {
    return fail('missing_field', 'The watch sent an empty time or date.');
  }
  return { ok: true, reading: { time, date, x: o.x as number, y: o.y as number, z: o.z as number, epoch } };
}

/** 2024-01-01 UTC. Anything earlier means the watch clock was never set. */
const EARLIEST_PLAUSIBLE_EPOCH = 1_704_067_200;
/** Tolerated difference between the watch and phone clocks. */
export const MAX_CLOCK_SKEW_S = 5 * 60;

export type ClockCheck = 'ok' | 'unset' | 'skewed';

export function checkWatchClock(epoch: number, phoneNowMs: number): ClockCheck {
  if (epoch < EARLIEST_PLAUSIBLE_EPOCH) return 'unset';
  return Math.abs(epoch - phoneNowMs / 1000) > MAX_CLOCK_SKEW_S ? 'skewed' : 'ok';
}

export const DEFAULT_WATCH_HOST = '192.168.4.1';

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  const [a, b] = parts;
  if (a === 10 || a === 127) return true;
  if (a === 192 && b === 168) return true;
  return a === 172 && b >= 16 && b <= 31;
}

/**
 * The watch is plain HTTP, so only private addresses are accepted: the setting can never point the
 * app at a host on the internet. An optional port supports test harnesses.
 */
export function validateWatchHost(input: string): { ok: true; host: string } | { ok: false; error: string } {
  const host = input.trim();
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?::(\d{1,5}))?$/.exec(host);
  if (!m) return { ok: false, error: 'Enter an IP address, for example 192.168.4.1' };
  const ip = m.slice(1, 5).map(Number);
  if (ip.some((n) => n > 255)) return { ok: false, error: 'That IP address is not valid.' };
  if (!isPrivateIpv4(ip.join('.'))) return { ok: false, error: 'The watch must have a private address such as 192.168.4.1' };
  if (m[5] && (Number(m[5]) < 1 || Number(m[5]) > 65535)) return { ok: false, error: 'That port is not valid.' };
  return { ok: true, host };
}

export const watchDataUrl = (host: string) => `http://${host}/data`;
