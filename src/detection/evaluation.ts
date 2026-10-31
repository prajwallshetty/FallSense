// Calibration and accuracy evaluation on labelled recordings. Replays recordings through the real
// sensor and detection code. Results describe the recordings supplied and nothing else: a number
// from here is only a claim about accuracy if the recordings are independent and the test set was
// held out by participant.

import { SensorBuffer } from '../services/sensorService';
import { WatchReading } from '../watch/protocol';
import { DetectionConfig } from './config';
import { DetectionEngine } from './detectionEngine';

export const ACTIVITIES = [
  'walking',
  'running',
  'sitting',
  'standing',
  'lying_down',
  'wrist_movement',
  'watch_removal',
  'simulated_fall',
] as const;

export type Activity = (typeof ACTIVITIES)[number];

export interface RecordedSample {
  /** Phone receive time (ms). */
  t: number;
  epoch: number;
  x: number;
  y: number;
  z: number;
}

export interface Recording {
  id: string;
  participant: string;
  activity: Activity;
  /** Free text such as "left wrist, face up". */
  orientation: string;
  /** Phone time the labelled fall happened (ms). Required for simulated_fall. */
  fallAt?: number;
  samples: RecordedSample[];
}

export interface ReplayResult {
  detected: boolean;
  /** Candidate events that reached verification or escalation. */
  alarms: number;
  /** Time from the labelled fall to the first alarm (ms). */
  latencyMs: number | null;
}

export function replay(recording: Recording, config: DetectionConfig): ReplayResult {
  const buffer = new SensorBuffer({ expectedIntervalMs: 1000 });
  const engine = new DetectionEngine(config);
  let alarms = 0;
  let firstAlarmAt: number | null = null;

  for (const s of recording.samples) {
    const reading: WatchReading = { time: '', date: '', x: s.x, y: s.y, z: s.z, epoch: s.epoch };
    const outcome = buffer.ingest(reading, s.t);
    if (outcome.status !== 'accepted') continue;
    for (const e of engine.process(outcome.sample, outcome.missed)) {
      if (e.type === 'verification_required' || e.type === 'escalate_immediately') {
        alarms++;
        firstAlarmAt ??= e.at;
        // Stand in for the user answering, so the rest of the recording is still evaluated.
        engine.resolveVerification('im_ok', e.at);
        engine.finishIncident(e.at + 60_000);
      }
    }
  }
  const latencyMs = firstAlarmAt !== null && recording.fallAt !== undefined ? firstAlarmAt - recording.fallAt : null;
  return { detected: alarms > 0, alarms, latencyMs };
}

const durationHours = (r: Recording) =>
  r.samples.length < 2 ? 0 : (r.samples[r.samples.length - 1].t - r.samples[0].t) / 3_600_000;

export interface Metrics {
  recordings: number;
  falls: number;
  nonFalls: number;
  truePositives: number;
  falseNegatives: number;
  trueNegatives: number;
  falsePositives: number;
  /** null whenever the denominator is zero: no data is not 0% and not 100%. */
  sensitivity: number | null;
  specificity: number | null;
  precision: number | null;
  missedFallRate: number | null;
  falseAlarmsPerHour: number | null;
  meanLatencyMs: number | null;
}

const ratio = (a: number, b: number) => (b > 0 ? a / b : null);

export function computeMetrics(recordings: Recording[], config: DetectionConfig): Metrics {
  let tp = 0, fn = 0, tn = 0, fp = 0, falseAlarms = 0, hours = 0;
  const latencies: number[] = [];

  for (const r of recordings) {
    const result = replay(r, config);
    if (r.activity === 'simulated_fall') {
      if (result.detected) tp++;
      else fn++;
      if (result.latencyMs !== null) latencies.push(result.latencyMs);
    } else {
      hours += durationHours(r);
      falseAlarms += result.alarms;
      if (result.detected) fp++;
      else tn++;
    }
  }

  return {
    recordings: recordings.length,
    falls: tp + fn,
    nonFalls: tn + fp,
    truePositives: tp,
    falseNegatives: fn,
    trueNegatives: tn,
    falsePositives: fp,
    sensitivity: ratio(tp, tp + fn),
    specificity: ratio(tn, tn + fp),
    precision: ratio(tp, tp + fp),
    missedFallRate: ratio(fn, tp + fn),
    falseAlarmsPerHour: ratio(falseAlarms, hours),
    meanLatencyMs: latencies.length ? latencies.reduce((a, b) => a + b, 0) / latencies.length : null,
  };
}

/** Deterministic string hash, so a split can be reproduced from its seed. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * Splits by participant, never by sample or recording, so nobody appears on both sides. Random
 * sample splits leak a person's movement style into the test set and inflate results.
 */
export function splitByParticipant(recordings: Recording[], testFraction: number, seed = 'safefall'): { train: Recording[]; test: Recording[]; testParticipants: string[] } {
  const participants = [...new Set(recordings.map((r) => r.participant))].sort();
  if (participants.length < 2) throw new Error('At least two participants are needed for a participant-level split.');
  const ordered = participants.sort((a, b) => hash(seed + a) - hash(seed + b));
  const count = Math.min(participants.length - 1, Math.max(1, Math.round(participants.length * testFraction)));
  const testParticipants = ordered.slice(0, count);
  const held = new Set(testParticipants);
  return {
    train: recordings.filter((r) => !held.has(r.participant)),
    test: recordings.filter((r) => held.has(r.participant)),
    testParticipants,
  };
}

export function metricsBy(recordings: Recording[], key: 'participant' | 'orientation', config: DetectionConfig): Record<string, Metrics> {
  const groups = new Map<string, Recording[]>();
  for (const r of recordings) groups.set(r[key], [...(groups.get(r[key]) ?? []), r]);
  return Object.fromEntries([...groups].map(([name, list]) => [name, computeMetrics(list, config)]));
}

export interface EvaluationReport {
  thresholds: DetectionConfig;
  overall: Metrics;
  heldOut: { testParticipants: string[]; metrics: Metrics } | null;
  byParticipant: Record<string, Metrics>;
  byOrientation: Record<string, Metrics>;
  warnings: string[];
}

/** Minimums below which a result says little. Reported as warnings and never hidden. */
const MIN_PARTICIPANTS = 5;
const MIN_FALLS = 30;
const MIN_ADL_HOURS = 10;

export function evaluate(recordings: Recording[], config: DetectionConfig, testFraction = 0.3): EvaluationReport {
  const warnings: string[] = [];
  const participants = new Set(recordings.map((r) => r.participant)).size;
  const falls = recordings.filter((r) => r.activity === 'simulated_fall').length;
  const adlHours = recordings.filter((r) => r.activity !== 'simulated_fall').reduce((h, r) => h + durationHours(r), 0);

  if (participants < MIN_PARTICIPANTS) warnings.push(`Only ${participants} participant(s). Use at least ${MIN_PARTICIPANTS} before reporting results.`);
  if (falls < MIN_FALLS) warnings.push(`Only ${falls} labelled fall(s). Use at least ${MIN_FALLS} before reporting sensitivity.`);
  if (adlHours < MIN_ADL_HOURS) warnings.push(`Only ${adlHours.toFixed(2)} hours of daily activity. Use at least ${MIN_ADL_HOURS} before reporting false alarms per hour.`);

  let heldOut: EvaluationReport['heldOut'] = null;
  if (participants >= 2) {
    const split = splitByParticipant(recordings, testFraction);
    heldOut = { testParticipants: split.testParticipants, metrics: computeMetrics(split.test, config) };
  } else {
    warnings.push('A held-out test set is impossible with one participant, so these results are not independent.');
  }

  return {
    thresholds: config,
    overall: computeMetrics(recordings, config),
    heldOut,
    byParticipant: metricsBy(recordings, 'participant', config),
    byOrientation: metricsBy(recordings, 'orientation', config),
    warnings,
  };
}
