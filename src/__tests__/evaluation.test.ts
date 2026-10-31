// Checks the arithmetic of the evaluation tooling on SYNTHETIC traces. These are not measurements of
// detection accuracy and no accuracy figure may be derived from them.

import { DEFAULT_DETECTION_CONFIG as cfg } from '../detection/config';
import { Activity, computeMetrics, evaluate, metricsBy, RecordedSample, Recording, replay, splitByParticipant } from '../detection/evaluation';

function rec(id: string, participant: string, activity: Activity, orientation = 'left wrist'): Recording {
  const samples: RecordedSample[] = [];
  let t = 0;
  let epoch = 1793363000;
  const push = (x: number, y: number, z: number) => samples.push({ t: (t += 1000), epoch: ++epoch, x, y, z });
  const j = (i: number) => (i % 3) * 0.004;
  for (let i = 0; i < 15; i++) push(j(i), 0, 0.89 + j(i));
  let fallAt: number | undefined;
  if (activity === 'simulated_fall') {
    fallAt = t + 1000;
    push(1.2, 1.2, 1.2);
    for (let i = 0; i < 15; i++) push(0.89 + j(i), j(i), 0);
  } else {
    for (let i = 0; i < 40; i++) push(j(i), 0, 0.89 + j(i));
  }
  return { id, participant, activity, orientation, fallAt, samples };
}

describe('replay', () => {
  it('detects a labelled fall and measures latency from the label', () => {
    const r = replay(rec('a', 'p1', 'simulated_fall'), cfg);
    expect(r.detected).toBe(true);
    expect(r.latencyMs).toBeGreaterThanOrEqual(10_000);
  });
  it('stays quiet on a calm recording', () => {
    expect(replay(rec('b', 'p1', 'sitting'), cfg)).toEqual({ detected: false, alarms: 0, latencyMs: null });
  });
});

describe('computeMetrics', () => {
  it('counts outcomes and derives rates', () => {
    const m = computeMetrics([rec('a', 'p1', 'simulated_fall'), rec('b', 'p1', 'walking'), rec('c', 'p2', 'sitting')], cfg);
    expect(m).toMatchObject({ truePositives: 1, falseNegatives: 0, trueNegatives: 2, falsePositives: 0, sensitivity: 1, specificity: 1, precision: 1, missedFallRate: 0 });
    expect(m.falseAlarmsPerHour).toBe(0);
  });

  it('reports null, not zero or 100%, when there is no data', () => {
    expect(computeMetrics([], cfg)).toMatchObject({ sensitivity: null, specificity: null, precision: null, missedFallRate: null, falseAlarmsPerHour: null, meanLatencyMs: null });
    expect(computeMetrics([rec('b', 'p1', 'sitting')], cfg).sensitivity).toBeNull();
  });
});

describe('splitByParticipant', () => {
  const data = ['p1', 'p2', 'p3', 'p4', 'p5'].flatMap((p) => [rec(`${p}-a`, p, 'simulated_fall'), rec(`${p}-b`, p, 'walking')]);

  it('never puts one participant on both sides', () => {
    const { train, test } = splitByParticipant(data, 0.4);
    const trainPeople = new Set(train.map((r) => r.participant));
    expect(test.length).toBeGreaterThan(0);
    expect(train.length).toBeGreaterThan(0);
    expect(test.every((r) => !trainPeople.has(r.participant))).toBe(true);
  });

  it('is reproducible from its seed', () => {
    expect(splitByParticipant(data, 0.4, 's').testParticipants).toEqual(splitByParticipant(data, 0.4, 's').testParticipants);
  });

  it('always leaves someone to train on', () => {
    expect(splitByParticipant(data, 1).train.length).toBeGreaterThan(0);
  });

  it('refuses a single participant', () => {
    expect(() => splitByParticipant([rec('a', 'p1', 'walking')], 0.3)).toThrow(/two participants/);
  });
});

describe('evaluate', () => {
  it('warns loudly when the dataset is too small to claim anything', () => {
    const report = evaluate([rec('a', 'p1', 'simulated_fall')], cfg);
    expect(report.heldOut).toBeNull();
    expect(report.warnings.join(' ')).toMatch(/not independent/);
    expect(report.warnings.join(' ')).toMatch(/at least 30/);
  });

  it('breaks results down per participant and orientation', () => {
    const data = [rec('a', 'p1', 'simulated_fall', 'left wrist'), rec('b', 'p2', 'walking', 'right wrist')];
    expect(Object.keys(metricsBy(data, 'participant', cfg))).toEqual(['p1', 'p2']);
    expect(Object.keys(evaluate(data, cfg).byOrientation)).toEqual(['left wrist', 'right wrist']);
  });
});
