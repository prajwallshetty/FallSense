// Multi-layer fall detection. Pure and clock-free: callers feed samples, so the same engine runs live
// on the phone and in offline replay against labelled recordings.
//
//   Layer 1  sensor analysis      deviation from the learned rest level, jerk, orientation shift
//   Layer 2  movement patterns    rolling-window classification (movementClassifier.ts)
//   Layer 3  post-event analysis  stillness, sustained orientation, recovery, data quality
//   Layer 4  event validation     combines the evidence into a decision
//
// One reading never classifies a fall. At one sample per second the impact itself usually falls
// between samples, so a captured peak adds evidence but is not required: the main signal is a
// sudden lasting orientation change followed by reduced movement.
//
// The score is a heuristic sum of evidence weights, NOT a probability. It must never be shown as
// a percentage or as a confidence until it has been calibrated on independent labelled data.
//
// Failure direction: lost or poor data never clears a candidate. It asks the user.

import { Sample, standardDeviation, median } from '../services/sensorService';
import { DEFAULT_DETECTION_CONFIG, DetectionConfig } from './config';
import { angleDeg, classifyMovement, meanDirection, Movement, unit, Vec3, WindowRow } from './movementClassifier';

export type DetectionState =
  | 'NORMAL'
  | 'UNUSUAL_MOVEMENT'
  | 'POSSIBLE_FALL'
  | 'FALL_VERIFICATION'
  | 'CONFIRMED_FALL'
  | 'USER_NEEDS_ASSISTANCE'
  | 'FALSE_ALARM'
  | 'SENSOR_UNAVAILABLE';

export type SensorQuality = 'good' | 'degraded' | 'poor';

export type Trigger = 'hard_transient' | 'transient_with_orientation' | 'orientation_shift' | 'sensor_lost';

export interface Evidence {
  trigger: Trigger;
  /** Phone time the candidate started (ms). */
  startedAt: number;
  /** Firmware timestamp of the triggering sample (UTC seconds). */
  epoch: number | null;
  /** Largest |M - rest| / rest seen around the event. */
  peakDeviation: number;
  /** Largest jerk / rest seen around the event (per second). */
  peakJerk: number;
  /** Lasting change in gravity direction, degrees. Null when too few samples followed. */
  orientationChangeDeg: number | null;
  /** Fraction of post-event samples that were still. Null when too few samples followed. */
  stillFraction: number | null;
  postSamples: number;
  missedSamples: number;
  quality: SensorQuality;
  movement: Movement;
  /** Heuristic evidence sum in 0..1. Not a probability. */
  score: number;
  highRisk: boolean;
}

export type EngineEvent =
  | { type: 'state'; from: DetectionState; to: DetectionState; at: number }
  | { type: 'verification_required'; at: number; evidence: Evidence }
  | { type: 'escalate_immediately'; at: number; evidence: Evidence }
  | { type: 'dismissed'; at: number; evidence: Evidence };

export type UserResponse = 'im_ok' | 'requested_help' | 'no_response';

interface Row extends WindowRow {
  at: number;
  deviation: number;
  jerkRatio: number;
  missed: number;
}

interface Candidate {
  trigger: Trigger;
  startedAt: number;
  epoch: number;
  pre: Vec3;
  rest: number;
  rows: Row[];
  peakDeviation: number;
  peakJerk: number;
  missed: number;
}

const WEIGHTS = { hardTransient: 0.3, transient: 0.15, jerk: 0.1, orientation: 0.3, stillness: 0.3 } as const;
const REMOVAL_PENALTY = 0.25;
const HIGH_RISK_STILL_FRACTION = 0.85;
const FALSE_ALARM_HOLD_MS = 8_000;
const UNUSUAL_HOLD_MS = 5_000;
const MIN_POST_SAMPLES = 3;
const MOVEMENT_WINDOW = 10;
const ORIENTATION_LOOKBACK = 3;

export class DetectionEngine {
  private cfg: DetectionConfig;
  private rows: Row[] = [];
  private calm: { magnitude: number; direction: Vec3 }[] = [];
  private candidate: Candidate | null = null;
  private cooldownUntil = 0;
  private holdUntil = 0;
  private _state: DetectionState = 'SENSOR_UNAVAILABLE';
  private _evidence: Evidence | null = null;
  private _movement: Movement = 'unknown';

  constructor(config: DetectionConfig = DEFAULT_DETECTION_CONFIG) {
    this.cfg = config;
  }

  get state(): DetectionState {
    return this._state;
  }

  /** Evidence of the current or most recent candidate. */
  get evidence(): Evidence | null {
    return this._evidence;
  }

  get movement(): Movement {
    return this._movement;
  }

  /** Resting magnitude learned from calm samples, or null while still learning. */
  get restMagnitude(): number | null {
    return this.calm.length >= this.cfg.baselineSamples ? median(this.calm.map((c) => c.magnitude)) : null;
  }

  get baselineReady(): boolean {
    return this.restMagnitude !== null;
  }

  get isVerifying(): boolean {
    return this._state === 'FALL_VERIFICATION';
  }

  setConfig(config: DetectionConfig): void {
    this.cfg = config;
  }

  private usualDirection(): Vec3 | null {
    return this.calm.length ? meanDirection(this.calm.map((c) => c.direction)) : null;
  }

  private setState(to: DetectionState, at: number, events: EngineEvent[]): void {
    if (to === this._state) return;
    events.push({ type: 'state', from: this._state, to, at });
    this._state = to;
  }

  /** Feeds one accepted sample. `missed` is how many samples were lost just before it. */
  process(sample: Sample, missed = 0): EngineEvent[] {
    const events: EngineEvent[] = [];
    const at = sample.receivedAt;
    const direction = unit(sample);
    const rest = this.restMagnitude;
    const row: Row = {
      at,
      magnitude: sample.magnitude,
      direction,
      deviation: rest ? Math.abs(sample.magnitude - rest) / rest : 0,
      jerkRatio: rest ? sample.jerk / rest : 0,
      missed,
    };
    this.rows.push(row);
    if (this.rows.length > this.cfg.windowSamples) this.rows.shift();

    if (this._state === 'SENSOR_UNAVAILABLE') this.setState('NORMAL', at, events);

    if (rest) {
      const window = this.rows.slice(-MOVEMENT_WINDOW);
      this._movement = classifyMovement(window, rest, this.usualDirection(), this.cfg);
    }

    // The outcome is being decided outside the engine. Keep observing, change nothing.
    if (this._state === 'FALL_VERIFICATION' || this._state === 'CONFIRMED_FALL' || this._state === 'USER_NEEDS_ASSISTANCE') return events;

    if (this.candidate) {
      this.observe(row, at, events);
      return events;
    }

    if (!rest) {
      this.learnBaseline(row);
      return events;
    }

    const orientationShift = this.orientationShift(direction);
    const transient = row.deviation >= this.cfg.transientRatio;
    const hard = row.deviation >= this.cfg.hardTransientRatio;
    const sudden = row.jerkRatio >= this.cfg.jerkRatio;
    const shifted = orientationShift >= this.cfg.orientationChangeDeg;

    if (at >= this.cooldownUntil && (hard || (transient && shifted) || (sudden && shifted))) {
      const trigger: Trigger = hard ? 'hard_transient' : transient ? 'transient_with_orientation' : 'orientation_shift';
      this.startCandidate(trigger, row, sample.epoch, rest, events);
      return events;
    }

    if (transient || sudden || shifted) {
      this.holdUntil = at + UNUSUAL_HOLD_MS;
      this.setState('UNUSUAL_MOVEMENT', at, events);
    } else {
      this.learnBaseline(row);
      if (at >= this.holdUntil) this.setState('NORMAL', at, events);
    }
    return events;
  }

  private learnBaseline(row: Row): void {
    this.calm.push({ magnitude: row.magnitude, direction: row.direction });
    if (this.calm.length > this.cfg.windowSamples) this.calm.shift();
  }

  private orientationShift(direction: Vec3): number {
    const prior = this.rows.slice(-1 - ORIENTATION_LOOKBACK, -1);
    if (!prior.length) return 0;
    return angleDeg(direction, meanDirection(prior.map((r) => r.direction)));
  }

  private startCandidate(trigger: Trigger, row: Row, epoch: number, rest: number, events: EngineEvent[]): void {
    const prior = this.rows.slice(0, -1).slice(-MOVEMENT_WINDOW);
    this.candidate = {
      trigger,
      startedAt: row.at,
      epoch,
      pre: meanDirection((prior.length ? prior : [row]).map((r) => r.direction)),
      rest,
      rows: [],
      peakDeviation: row.deviation,
      peakJerk: row.jerkRatio,
      missed: row.missed,
    };
    this.setState('POSSIBLE_FALL', row.at, events);
    this._evidence = this.evaluate(this.candidate, false);
  }

  private observe(row: Row, at: number, events: EngineEvent[]): void {
    const c = this.candidate!;
    c.rows.push(row);
    c.peakDeviation = Math.max(c.peakDeviation, row.deviation);
    c.peakJerk = Math.max(c.peakJerk, row.jerkRatio);
    c.missed += row.missed;
    if (at - c.startedAt < this.cfg.postEventSeconds * 1000) {
      this._evidence = this.evaluate(c, false);
      return;
    }
    this.decide(c, at, events);
  }

  /** Layer 3 and the score for Layer 4. */
  private evaluate(c: Candidate, final: boolean): Evidence {
    const rows = c.rows;
    const enough = rows.length >= MIN_POST_SAMPLES;
    let orientationChangeDeg: number | null = null;
    let stillFraction: number | null = null;

    if (enough) {
      // Skip the first samples: the arm is still settling just after an event.
      const settled = rows.slice(Math.min(2, rows.length - MIN_POST_SAMPLES));
      orientationChangeDeg = angleDeg(meanDirection(settled.map((r) => r.direction)), c.pre);
      let still = 0;
      let windows = 0;
      for (let i = 0; i + 3 <= rows.length; i++) {
        windows++;
        if (standardDeviation(rows.slice(i, i + 3).map((r) => r.magnitude)) / c.rest < this.cfg.stillStdRatio) still++;
      }
      stillFraction = windows ? still / windows : null;
    }

    const expected = Math.max(1, rows.length + c.missed);
    const lossRatio = c.missed / expected;
    const quality: SensorQuality = !enough || lossRatio > 0.4 ? 'poor' : lossRatio > 0.15 ? 'degraded' : 'good';

    const hard = c.peakDeviation >= this.cfg.hardTransientRatio;
    const movement = classifyMovement(rows.slice(-MOVEMENT_WINDOW), c.rest, c.pre, this.cfg);

    let score = 0;
    if (hard) score += WEIGHTS.hardTransient;
    else if (c.peakDeviation >= this.cfg.transientRatio) score += WEIGHTS.transient;
    if (c.peakJerk >= this.cfg.jerkRatio) score += WEIGHTS.jerk;
    const oriented = orientationChangeDeg !== null && orientationChangeDeg >= this.cfg.orientationChangeDeg;
    const still = stillFraction !== null && stillFraction >= this.cfg.stillFraction;
    if (oriented) score += WEIGHTS.orientation;
    if (still) score += WEIGHTS.stillness;
    if (movement === 'watch_removal') score -= REMOVAL_PENALTY;
    score = Math.max(0, Math.min(1, Number(score.toFixed(3))));

    const highRisk = final && hard && oriented && stillFraction !== null && stillFraction >= HIGH_RISK_STILL_FRACTION && movement !== 'watch_removal';

    return {
      trigger: c.trigger,
      startedAt: c.startedAt,
      epoch: c.epoch,
      peakDeviation: Number(c.peakDeviation.toFixed(3)),
      peakJerk: Number(c.peakJerk.toFixed(3)),
      orientationChangeDeg: orientationChangeDeg === null ? null : Math.round(orientationChangeDeg),
      stillFraction: stillFraction === null ? null : Number(stillFraction.toFixed(2)),
      postSamples: rows.length,
      missedSamples: c.missed,
      quality,
      movement,
      score,
      highRisk,
    };
  }

  /** Layer 4. */
  private decide(c: Candidate, at: number, events: EngineEvent[]): void {
    const evidence = this.evaluate(c, true);
    this._evidence = evidence;
    this.candidate = null;

    if (evidence.highRisk && this.cfg.immediateEscalation) {
      this.setState('CONFIRMED_FALL', at, events);
      events.push({ type: 'escalate_immediately', at, evidence });
      return;
    }
    const bar = evidence.quality === 'poor' ? this.cfg.poorQualityVerifyScore : this.cfg.verifyScore;
    if (evidence.score >= bar) {
      this.setState('FALL_VERIFICATION', at, events);
      events.push({ type: 'verification_required', at, evidence });
      return;
    }
    events.push({ type: 'dismissed', at, evidence });
    this.cooldownUntil = at + this.cfg.cooldownSeconds * 1000 * 0.25;
    this.setState('NORMAL', at, events);
  }

  /** Readings stopped. Never clears a candidate: a fall can be what broke the link. */
  onSensorLost(at: number): EngineEvent[] {
    const events: EngineEvent[] = [];
    const c = this.candidate;
    if (c) {
      const evidence = { ...this.evaluate(c, false), trigger: c.trigger, quality: 'poor' as const };
      this._evidence = evidence;
      this.candidate = null;
      if (evidence.score >= this.cfg.poorQualityVerifyScore) {
        this.setState('FALL_VERIFICATION', at, events);
        events.push({ type: 'verification_required', at, evidence });
        return events;
      }
      events.push({ type: 'dismissed', at, evidence });
    }
    if (this._state === 'FALL_VERIFICATION' || this._state === 'CONFIRMED_FALL' || this._state === 'USER_NEEDS_ASSISTANCE') return events;
    this.setState('SENSOR_UNAVAILABLE', at, events);
    // After a gap the old window no longer describes the wearer.
    this.rows = [];
    return events;
  }

  /** Records how verification ended. The evidence is kept, whatever the answer. */
  resolveVerification(response: UserResponse, at: number): EngineEvent[] {
    const events: EngineEvent[] = [];
    const to: DetectionState = response === 'im_ok' ? 'FALSE_ALARM' : response === 'requested_help' ? 'USER_NEEDS_ASSISTANCE' : 'CONFIRMED_FALL';
    this.setState(to, at, events);
    this.cooldownUntil = at + this.cfg.cooldownSeconds * 1000;
    if (to === 'FALSE_ALARM') this.holdUntil = at + FALSE_ALARM_HOLD_MS;
    return events;
  }

  /** The incident is closed, so detection can resume watching for the next event. */
  finishIncident(at: number): EngineEvent[] {
    const events: EngineEvent[] = [];
    if (this._state === 'FALSE_ALARM' && at < this.holdUntil) return events;
    this.cooldownUntil = Math.max(this.cooldownUntil, at + this.cfg.cooldownSeconds * 1000);
    this.setState('NORMAL', at, events);
    return events;
  }

  /** Clears everything, for example on sign-out. */
  reset(): void {
    this.rows = [];
    this.calm = [];
    this.candidate = null;
    this.cooldownUntil = 0;
    this.holdUntil = 0;
    this._state = 'SENSOR_UNAVAILABLE';
    this._evidence = null;
    this._movement = 'unknown';
  }
}
