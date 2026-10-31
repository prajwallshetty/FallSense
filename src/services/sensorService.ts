// Turns raw watch readings into ordered, validated samples with derived signals.
//
// The firmware clock has one-second resolution, so two polls can legitimately share an `epoch`.
// A repeat of the same epoch with the same values is a duplicate; the same epoch with new values is
// a real new sample. Timing within a second comes from the phone's receive time.

import { WatchReading } from '../watch/protocol';

export interface Sample {
  epoch: number;
  x: number;
  y: number;
  z: number;
  /** Phone clock when this reading arrived (ms). */
  receivedAt: number;
  /** sqrt(x*x + y*y + z*z), in the watch's own unconfirmed unit. */
  magnitude: number;
  /** Moving average of the magnitude over the smoothing window. */
  smoothed: number;
  /** Absolute rate of change of magnitude, per second. 0 for the first sample. */
  jerk: number;
  /** Seconds since the previous accepted sample. 0 for the first sample. */
  dt: number;
}

export type IngestOutcome =
  | { status: 'accepted'; sample: Sample; missed: number }
  | { status: 'duplicate' }
  | { status: 'out_of_order' };

export interface SensorStats {
  accepted: number;
  duplicates: number;
  outOfOrder: number;
  /** Samples estimated lost, from gaps in the firmware timestamps. */
  missing: number;
}

export interface SensorOptions {
  /** Expected time between samples (ms). Normally the polling interval. */
  expectedIntervalMs: number;
  smoothingWindow?: number;
  historySize?: number;
}

const MIN_DT_S = 0.05;

export const magnitudeOf = (x: number, y: number, z: number) => Math.sqrt(x * x + y * y + z * z);

export function movingAverage(values: number[], window: number): number {
  const slice = values.slice(-window);
  return slice.length ? slice.reduce((a, b) => a + b, 0) / slice.length : 0;
}

export function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length);
}

export function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Indices of local maxima at least `minHeight` above the median of the series. */
export function findPeaks(values: number[], minHeight: number): number[] {
  const base = median(values);
  const peaks: number[] = [];
  for (let i = 1; i < values.length - 1; i++) {
    if (values[i] - base >= minHeight && values[i] >= values[i - 1] && values[i] > values[i + 1]) peaks.push(i);
  }
  return peaks;
}

export class SensorBuffer {
  private history: Sample[] = [];
  private last: Sample | null = null;
  readonly stats: SensorStats = { accepted: 0, duplicates: 0, outOfOrder: 0, missing: 0 };
  private expectedIntervalMs: number;
  private readonly smoothingWindow: number;
  private readonly historySize: number;

  constructor(options: SensorOptions) {
    this.expectedIntervalMs = options.expectedIntervalMs;
    this.smoothingWindow = options.smoothingWindow ?? 3;
    this.historySize = options.historySize ?? 180;
  }

  setExpectedInterval(ms: number): void {
    this.expectedIntervalMs = ms;
  }

  ingest(reading: WatchReading, receivedAt: number): IngestOutcome {
    const prev = this.last;
    if (prev) {
      if (reading.epoch < prev.epoch) {
        this.stats.outOfOrder++;
        return { status: 'out_of_order' };
      }
      if (reading.epoch === prev.epoch && reading.x === prev.x && reading.y === prev.y && reading.z === prev.z) {
        this.stats.duplicates++;
        return { status: 'duplicate' };
      }
    }

    const magnitude = magnitudeOf(reading.x, reading.y, reading.z);
    const epochDelta = prev ? reading.epoch - prev.epoch : 0;
    const dt = !prev ? 0 : epochDelta > 0 ? epochDelta : Math.max((receivedAt - prev.receivedAt) / 1000, MIN_DT_S);
    const jerk = prev ? Math.abs(magnitude - prev.magnitude) / dt : 0;

    const recent = [...this.history.slice(-(this.smoothingWindow - 1)).map((s) => s.magnitude), magnitude];
    const sample: Sample = {
      epoch: reading.epoch,
      x: reading.x,
      y: reading.y,
      z: reading.z,
      receivedAt,
      magnitude,
      smoothed: movingAverage(recent, this.smoothingWindow),
      jerk,
      dt,
    };

    let missed = 0;
    if (prev && epochDelta > 0) {
      const expectedS = this.expectedIntervalMs / 1000;
      // A one-second clock makes single-step jitter normal, so only clear gaps count as losses.
      if (epochDelta >= Math.max(2, expectedS * 2)) missed = Math.max(0, Math.round(epochDelta / Math.max(expectedS, 1)) - 1);
    }
    this.stats.accepted++;
    this.stats.missing += missed;
    this.last = sample;
    this.history.push(sample);
    if (this.history.length > this.historySize) this.history.shift();
    return { status: 'accepted', sample, missed };
  }

  get latest(): Sample | null {
    return this.last;
  }

  /** The most recent `count` samples, oldest first. */
  window(count = this.historySize): Sample[] {
    return this.history.slice(-count);
  }

  reset(): void {
    this.history = [];
    this.last = null;
    this.stats.accepted = this.stats.duplicates = this.stats.outOfOrder = this.stats.missing = 0;
  }
}
