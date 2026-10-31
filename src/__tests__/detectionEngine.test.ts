// Traces here are SYNTHETIC, written to exercise the engine's logic and failure paths. They are not
// recordings of people and passing them says nothing about real-world detection accuracy.

import { DEFAULT_DETECTION_CONFIG, DetectionConfig, sanitizeDetectionConfig } from '../detection/config';
import { DetectionEngine, EngineEvent } from '../detection/detectionEngine';
import { classifyMovement, unit } from '../detection/movementClassifier';
import { Sample, SensorBuffer } from '../services/sensorService';

type V = [number, number, number];

const UPRIGHT: V = [0, 0, 0.89];
const FLAT: V = [0.89, 0, 0];

class Rig {
  buffer = new SensorBuffer({ expectedIntervalMs: 1000 });
  engine: DetectionEngine;
  epoch = 1793363000;
  t = 1_000_000;
  events: EngineEvent[] = [];
  private jitter = 0;

  constructor(cfg: DetectionConfig = DEFAULT_DETECTION_CONFIG) {
    this.engine = new DetectionEngine(cfg);
  }

  /** Small noise, as a worn watch shows even at rest. */
  private noise(): number {
    this.jitter = (this.jitter * 7 + 3) % 11;
    return (this.jitter - 5) * 0.0015;
  }

  feed(v: V, count = 1, noisy = true): this {
    for (let i = 0; i < count; i++) {
      this.epoch++;
      this.t += 1000;
      const n = noisy ? this.noise() : 0;
      const out = this.buffer.ingest({ time: '', date: '', x: v[0] + n, y: v[1] - n, z: v[2] + n, epoch: this.epoch }, this.t);
      if (out.status === 'accepted') this.events.push(...this.engine.process(out.sample as Sample, out.missed));
    }
    return this;
  }

  settle(v: V = UPRIGHT): this {
    return this.feed(v, 12);
  }

  of<T extends EngineEvent['type']>(type: T) {
    return this.events.filter((e) => e.type === type) as Extract<EngineEvent, { type: T }>[];
  }

  states() {
    return this.of('state').map((e) => e.to);
  }
}

const SPIKE: V = [1.2, 1.2, 1.2];

describe('baseline', () => {
  it('reports the sensor unavailable before any data', () => {
    expect(new DetectionEngine().state).toBe('SENSOR_UNAVAILABLE');
  });

  it('learns the rest level from data and needs no unit', () => {
    const rig = new Rig().settle();
    expect(rig.engine.state).toBe('NORMAL');
    expect(rig.engine.restMagnitude).toBeGreaterThan(0.8);
    expect(rig.engine.restMagnitude).toBeLessThan(1);
    // The same motion in raw counts behaves identically, because thresholds are ratios.
    const scaled = new Rig().feed([0, 0, 4096], 12);
    expect(scaled.engine.restMagnitude).toBeGreaterThan(4000);
    scaled.feed([5000, 5000, 5000]).feed([4096, 0, 0], 12);
    expect(scaled.of('verification_required').length + scaled.of('escalate_immediately').length).toBe(1);
  });

  it('never raises a candidate while still learning', () => {
    const rig = new Rig().feed(UPRIGHT, 3).feed(SPIKE);
    expect(rig.engine.state).toBe('NORMAL');
  });
});

describe('single readings', () => {
  it('never classifies a fall from one spike', () => {
    const rig = new Rig().settle().feed(SPIKE);
    expect(rig.engine.state).toBe('POSSIBLE_FALL');
    expect(rig.of('verification_required')).toHaveLength(0);
    expect(rig.of('escalate_immediately')).toHaveLength(0);
  });

  it('dismisses a spike followed by the same orientation and normal movement', () => {
    const rig = new Rig().settle().feed(SPIKE);
    for (let i = 0; i < 12; i++) rig.feed(i % 2 ? [0.15, 0, 0.8] : [0, 0.15, 0.95]);
    expect(rig.of('verification_required')).toHaveLength(0);
    expect(rig.of('dismissed')).toHaveLength(1);
    expect(rig.engine.state).toBe('NORMAL');
  });

  it('marks a smaller disturbance as unusual, then returns to normal', () => {
    const rig = new Rig().settle().feed([0, 0, 1.2]);
    expect(rig.engine.state).toBe('UNUSUAL_MOVEMENT');
    rig.feed(UPRIGHT, 8);
    expect(rig.engine.state).toBe('NORMAL');
  });
});

describe('fall patterns', () => {
  it('asks the user when orientation changes and movement stops, with no peak captured', () => {
    // The realistic 1 Hz case: the impact falls between samples.
    const rig = new Rig().settle().feed([0.5, 0, 0.3]).feed(FLAT, 12);
    expect(rig.of('verification_required')).toHaveLength(1);
    expect(rig.engine.state).toBe('FALL_VERIFICATION');
    const { evidence } = rig.of('verification_required')[0];
    expect(evidence.orientationChangeDeg).toBeGreaterThanOrEqual(40);
    expect(evidence.stillFraction).toBeGreaterThanOrEqual(0.6);
    expect(evidence.highRisk).toBe(false);
  });

  it('escalates at once when a hard peak, orientation change and stillness coincide', () => {
    const rig = new Rig().settle().feed(SPIKE).feed(FLAT, 12);
    expect(rig.of('escalate_immediately')).toHaveLength(1);
    expect(rig.of('escalate_immediately')[0].evidence.highRisk).toBe(true);
    expect(rig.engine.state).toBe('CONFIRMED_FALL');
  });

  it('does not escalate immediately when the policy is off, and verifies instead', () => {
    const rig = new Rig({ ...DEFAULT_DETECTION_CONFIG, immediateEscalation: false }).settle().feed(SPIKE).feed(FLAT, 12);
    expect(rig.of('escalate_immediately')).toHaveLength(0);
    expect(rig.of('verification_required')).toHaveLength(1);
  });

  it('dismisses a posture change where the wearer keeps moving', () => {
    const rig = new Rig().settle().feed([0.5, 0, 0.3]);
    for (let i = 0; i < 12; i++) rig.feed(i % 2 ? [0.95, 0.2, 0.1] : [0.6, 0.1, 0.1]);
    expect(rig.of('verification_required')).toHaveLength(0);
    expect(rig.engine.state).not.toBe('FALL_VERIFICATION');
  });

  it('is not triggered by inactivity alone', () => {
    const rig = new Rig().settle().feed(UPRIGHT, 300);
    expect(rig.engine.state).toBe('NORMAL');
    expect(rig.of('verification_required')).toHaveLength(0);
  });

  it('lowers the score for a watch set down on a table, but does not silently ignore it', () => {
    const worn = new Rig().settle().feed(SPIKE).feed(FLAT, 12);
    const table = new Rig().settle().feed(SPIKE).feed(FLAT, 12, false);
    const scoreOf = (r: Rig) => [...r.of('verification_required'), ...r.of('escalate_immediately')][0].evidence;
    expect(scoreOf(table).score).toBeLessThan(scoreOf(worn).score);
    expect(scoreOf(table).highRisk).toBe(false);
    expect(table.of('verification_required')).toHaveLength(1);
  });

  it('reports a score in 0..1 that is a sum of evidence, not a probability', () => {
    const rig = new Rig().settle().feed(SPIKE).feed(FLAT, 12);
    const { score } = rig.of('escalate_immediately')[0].evidence;
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('records the firmware timestamp of the triggering sample', () => {
    const rig = new Rig().settle();
    const at = rig.epoch + 1;
    rig.feed(SPIKE).feed(FLAT, 12);
    expect(rig.of('escalate_immediately')[0].evidence.epoch).toBe(at);
  });

  it('moves through the documented states in order', () => {
    const rig = new Rig().settle().feed(SPIKE).feed(FLAT, 12);
    expect(rig.states()).toEqual(['NORMAL', 'POSSIBLE_FALL', 'CONFIRMED_FALL']);
  });
});

describe('losing the sensor', () => {
  it('reports SENSOR_UNAVAILABLE when data stops during normal monitoring', () => {
    const rig = new Rig().settle();
    rig.events.push(...rig.engine.onSensorLost(rig.t));
    expect(rig.engine.state).toBe('SENSOR_UNAVAILABLE');
  });

  it('asks the user, rather than clearing, when data stops just after a candidate', () => {
    const rig = new Rig().settle().feed(SPIKE).feed(FLAT, 3);
    rig.events.push(...rig.engine.onSensorLost(rig.t));
    const v = rig.of('verification_required');
    expect(v).toHaveLength(1);
    expect(v[0].evidence.quality).toBe('poor');
    expect(rig.engine.state).toBe('FALL_VERIFICATION');
  });

  it('does not lose an active verification when the sensor drops', () => {
    const rig = new Rig().settle().feed([0.5, 0, 0.3]).feed(FLAT, 12);
    rig.events.push(...rig.engine.onSensorLost(rig.t));
    expect(rig.engine.state).toBe('FALL_VERIFICATION');
  });

  it('resumes when samples return', () => {
    const rig = new Rig().settle();
    rig.engine.onSensorLost(rig.t);
    rig.feed(UPRIGHT);
    expect(rig.engine.state).toBe('NORMAL');
  });

  it('downgrades quality when samples are missing around an event', () => {
    const rig = new Rig().settle().feed(SPIKE);
    for (let i = 0; i < 5; i++) {
      rig.epoch += 3;
      rig.t += 3000;
      rig.feed(FLAT);
    }
    const all = [...rig.of('verification_required'), ...rig.of('escalate_immediately')];
    expect(all[0].evidence.missedSamples).toBeGreaterThan(0);
    expect(all[0].evidence.quality).not.toBe('good');
  });
});

describe('user response', () => {
  const verifying = () => new Rig().settle().feed([0.5, 0, 0.3]).feed(FLAT, 12);

  it('becomes FALSE_ALARM on I am OK, and keeps the evidence', () => {
    const rig = verifying();
    const before = rig.engine.evidence;
    rig.engine.resolveVerification('im_ok', rig.t);
    expect(rig.engine.state).toBe('FALSE_ALARM');
    expect(rig.engine.evidence).toBe(before);
  });

  it('becomes USER_NEEDS_ASSISTANCE on a help request', () => {
    const rig = verifying();
    rig.engine.resolveVerification('requested_help', rig.t);
    expect(rig.engine.state).toBe('USER_NEEDS_ASSISTANCE');
  });

  it('becomes CONFIRMED_FALL when nobody responds', () => {
    const rig = verifying();
    rig.engine.resolveVerification('no_response', rig.t);
    expect(rig.engine.state).toBe('CONFIRMED_FALL');
  });

  it('holds its state until the incident closes, whatever the sensor does', () => {
    const rig = verifying();
    rig.engine.resolveVerification('no_response', rig.t);
    rig.feed(UPRIGHT, 30);
    expect(rig.engine.state).toBe('CONFIRMED_FALL');
    rig.engine.finishIncident(rig.t);
    expect(rig.engine.state).toBe('NORMAL');
  });

  it('applies a cooldown, then detects the next event', () => {
    const rig = verifying();
    rig.engine.resolveVerification('im_ok', rig.t);
    rig.engine.finishIncident(rig.t + 10_000);
    rig.feed(FLAT, 45);
    const first = rig.of('verification_required').length;
    rig.feed(SPIKE).feed(UPRIGHT, 12);
    expect(rig.of('verification_required').length + rig.of('escalate_immediately').length).toBe(first + 1);
  });
});

describe('configuration', () => {
  it('clamps values so a typo cannot disable detection', () => {
    const c = sanitizeDetectionConfig({ hardTransientRatio: 9999, verifyScore: -1, postEventSeconds: NaN });
    expect(c.hardTransientRatio).toBe(5);
    expect(c.verifyScore).toBe(0.1);
    expect(c.postEventSeconds).toBe(DEFAULT_DETECTION_CONFIG.postEventSeconds);
  });

  it('applies a changed threshold', () => {
    const strict = new Rig({ ...DEFAULT_DETECTION_CONFIG, verifyScore: 1 }).settle().feed([0.5, 0, 0.3]).feed(FLAT, 12);
    expect(strict.of('verification_required')).toHaveLength(0);
  });
});

describe('movement classifier', () => {
  const rows = (vs: V[]) => vs.map((v) => ({ magnitude: Math.hypot(...v), direction: unit({ x: v[0], y: v[1], z: v[2] }) }));
  const cfg = DEFAULT_DETECTION_CONFIG;
  const usual = unit({ x: 0, y: 0, z: 1 });
  const repeat = (fn: (i: number) => V, n = 10) => Array.from({ length: n }, (_, i) => fn(i));

  it('needs enough samples', () => {
    expect(classifyMovement(rows([UPRIGHT]), 0.89, usual, cfg)).toBe('unknown');
  });
  it('sees stillness', () => {
    expect(classifyMovement(rows(repeat((i) => [0, 0, 0.89 + (i % 2) * 0.005])), 0.89, usual, cfg)).toBe('still');
  });
  it('sees an unworn watch as noise-free', () => {
    expect(classifyMovement(rows(repeat(() => UPRIGHT)), 0.89, usual, cfg)).toBe('watch_removal');
  });
  it('sees lying down as still at a large tilt', () => {
    expect(classifyMovement(rows(repeat((i) => [0.89 + (i % 2) * 0.005, 0, 0])), 0.89, usual, cfg)).toBe('lying_down');
  });
  it('sees walking', () => {
    expect(classifyMovement(rows(repeat((i) => [0, 0, i % 2 ? 0.8 : 1.0])), 0.89, usual, cfg)).toBe('walking');
  });
  it('sees running', () => {
    expect(classifyMovement(rows(repeat((i) => [0, 0, i % 2 ? 0.5 : 1.4])), 0.89, usual, cfg)).toBe('running');
  });
  it('sees wrist movement as orientation swings without much force', () => {
    expect(classifyMovement(rows(repeat((i) => (i % 2 ? [0.6, 0, 0.65] : [0, 0.05, 0.89]))), 0.89, usual, cfg)).toBe('wrist_movement');
  });
  it('sees sitting down as settling at a greater tilt', () => {
    const vs: V[] = [[0, 0, 0.89], [0, 0, 0.89], [0, 0, 0.89], [0.2, 0, 0.95], [0.4, 0, 0.6], [0.45, 0, 0.77], [0.45, 0, 0.77], [0.45, 0, 0.77]];
    expect(classifyMovement(rows(vs), 0.89, usual, cfg)).toBe('sitting_down');
  });
  it('sees standing up as settling back toward the usual tilt', () => {
    const vs: V[] = [[0.45, 0, 0.77], [0.45, 0, 0.77], [0.45, 0, 0.77], [0.3, 0, 1.0], [0.1, 0, 0.7], [0, 0, 0.89], [0, 0, 0.89], [0, 0, 0.89]];
    expect(classifyMovement(rows(vs), 0.89, usual, cfg)).toBe('standing_up');
  });
});
