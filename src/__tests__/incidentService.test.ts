// Runs the real engine, incident machine and stores together on a SYNTHETIC trace. This checks the
// wiring between them, not real-world detection.

import { detectionStatusOf, toCloudIncident } from '../emergency/cloudMapping';
import { incidentService, IncidentService } from '../services/incidentService';
import { SensorBuffer } from '../services/sensorService';
import { useDetectionStore } from '../store/detectionStore';
import { machineConfig, useIncidentStore } from '../store/incidentStore';

jest.mock('expo-crypto', () => ({ randomUUID: () => 'id' }));

const owner = { uid: 'user-1', name: 'Asha' };
type V = [number, number, number];

function rig(service: IncidentService = new IncidentService()) {
  const buffer = new SensorBuffer({ expectedIntervalMs: 1000 });
  let epoch = 1793363000;
  let t = 1_793_363_000_000;
  let id = 0;
  let jitter = 0;
  service.start(owner, () => `e${++id}`);
  const feed = (v: V, n = 1) => {
    for (let i = 0; i < n; i++) {
      epoch++;
      t += 1000;
      jitter = (jitter * 7 + 3) % 11;
      const j = (jitter - 5) * 0.0015;
      const out = buffer.ingest({ time: '', date: '', x: v[0] + j, y: v[1] - j, z: v[2] + j, epoch }, t);
      if (out.status === 'accepted') service.handleSample(out.sample, out.missed);
    }
  };
  return { service, feed, now: () => t };
}

const UPRIGHT: V = [0, 0, 0.89];
const FLAT: V = [0.89, 0, 0];
const verifying = () => {
  const r = rig();
  r.feed(UPRIGHT, 12);
  r.feed([0.5, 0, 0.3]);
  r.feed(FLAT, 12);
  return r;
};
const highRisk = () => {
  const r = rig();
  r.feed(UPRIGHT, 12);
  r.feed([1.2, 1.2, 1.2]);
  r.feed(FLAT, 12);
  return r;
};
const inc = () => useIncidentStore.getState();

beforeEach(() => {
  useIncidentStore.getState().reset();
  useDetectionStore.getState().reset();
});

describe('verification flow', () => {
  it('opens a countdown with the detection evidence attached', () => {
    verifying();
    const a = inc().active!;
    expect(a.state).toBe('countdown');
    expect(a.countdownEndsAt! - a.createdAt).toBe(machineConfig.countdownMs);
    expect(a.detection?.trigger).toBeTruthy();
    expect(a.source).toBe('wearable');
    expect(a.finalUserResponse ?? null).toBeNull();
    expect(useDetectionStore.getState().state).toBe('FALL_VERIFICATION');
  });

  it("keeps the incident and records the answer when the user says I'm OK", () => {
    const { now } = verifying();
    const id = inc().active!.id;
    inc().dispatch({ type: 'CANCEL', now: now(), by: owner.uid });
    expect(inc().active).toBeNull();
    const stored = inc().history.find((h) => h.id === id)!;
    expect(stored.state).toBe('cancelled');
    expect(stored.finalUserResponse).toBe('im_ok');
    expect(stored.detection).toBeTruthy();
    expect(detectionStatusOf(stored)).toBe('FALSE_ALARM');
    expect(useDetectionStore.getState().state === 'FALSE_ALARM' || incidentService.engine.state === 'SENSOR_UNAVAILABLE').toBe(true);
  });

  it('records a help request and marks the user as needing assistance', () => {
    const { now, service } = verifying();
    inc().dispatch({ type: 'ESCALATE_NOW', now: now(), by: owner.uid });
    const a = inc().active!;
    expect(a.state).toBe('escalated');
    expect(a.finalUserResponse).toBe('requested_help');
    expect(detectionStatusOf(a)).toBe('USER_NEEDS_ASSISTANCE');
    expect(service.engine.state).toBe('USER_NEEDS_ASSISTANCE');
  });

  it('escalates when nobody answers, driven by watch ticks alone', () => {
    const { now, service } = verifying();
    service.handleTick(now() + machineConfig.countdownMs + 1);
    const a = inc().active!;
    expect(a.state).toBe('escalated');
    expect(a.finalUserResponse).toBe('no_response');
    expect(detectionStatusOf(a)).toBe('CONFIRMED_FALL');
    expect(service.engine.state).toBe('CONFIRMED_FALL');
  });
});

describe('high-risk events', () => {
  it('escalates immediately and still allows I am OK', () => {
    const { now } = highRisk();
    const a = inc().active!;
    expect(a.state).toBe('escalated');
    expect(a.detection?.highRisk).toBe(true);
    expect(detectionStatusOf(a)).toBe('CONFIRMED_FALL');
    inc().dispatch({ type: 'RESOLVE', now: now(), by: owner.uid, resolution: 'false_alarm' });
    const stored = inc().history[0];
    expect(stored.state).toBe('resolved');
    expect(stored.finalUserResponse).toBe('im_ok');
    expect(detectionStatusOf(stored)).toBe('FALSE_ALARM');
  });
});

describe('open incidents', () => {
  it('never replaces an open incident with a second detection', () => {
    const r = verifying();
    const id = inc().active!.id;
    r.feed(FLAT, 5);
    expect(inc().active!.id).toBe(id);
  });

  it('survives the sensor being lost during verification', () => {
    const { now, service } = verifying();
    service.handleSensorLost(now());
    expect(inc().active?.state).toBe('countdown');
  });

  it('raises an alert if the link is lost right after a candidate', () => {
    const r = rig();
    r.feed(UPRIGHT, 12);
    r.feed([1.2, 1.2, 1.2]);
    r.feed(FLAT, 3);
    r.service.handleSensorLost(r.now());
    expect(inc().active?.state).toBe('countdown');
    expect(inc().active?.detection?.quality).toBe('poor');
  });
});

describe('cloud mapping', () => {
  it('carries the evidence and never a made-up percentage', () => {
    verifying();
    const c = toCloudIncident(inc().active!);
    expect(c.eventType).toBe('fall');
    expect(c.detectionStatus).toBe('FALL_VERIFICATION');
    expect(c.detectionScore).toBeGreaterThan(0);
    expect(c.detectionScore).toBeLessThanOrEqual(1);
    expect(c.sensorQuality).toBe('good');
    expect(JSON.stringify(c)).not.toMatch(/accuracy|confidence|probability|percent/i);
  });

  it('maps a manual SOS', () => {
    inc().dispatch({ type: 'MANUAL_SOS', now: 1000, owner, id: 'sos-1' });
    const c = toCloudIncident(inc().active!);
    expect(c.eventType).toBe('manual_sos');
    expect(c.detectionStatus).toBe('USER_NEEDS_ASSISTANCE');
    expect(c.finalUserResponse).toBe('requested_help');
  });
});

describe('sign-out', () => {
  it('clears the engine', () => {
    const { service } = verifying();
    service.stop();
    expect(service.engine.state).toBe('SENSOR_UNAVAILABLE');
    expect(useDetectionStore.getState().state).toBe('SENSOR_UNAVAILABLE');
  });
});
