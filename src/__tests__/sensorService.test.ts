import { findPeaks, magnitudeOf, median, movingAverage, SensorBuffer, standardDeviation } from '../services/sensorService';
import { WatchReading } from '../watch/protocol';

const r = (epoch: number, x = 0.1, y = 0.2, z = 0.9): WatchReading => ({ time: 't', date: 'd', x, y, z, epoch });
const buffer = () => new SensorBuffer({ expectedIntervalMs: 1000 });

describe('derived signals', () => {
  it('computes magnitude from the spec formula', () => {
    expect(magnitudeOf(-0.353, -0.231, -0.781)).toBeCloseTo(0.8877, 3);
    expect(magnitudeOf(3, 4, 0)).toBe(5);
  });
  it('computes moving average, std deviation and median', () => {
    expect(movingAverage([1, 2, 3, 4], 2)).toBe(3.5);
    expect(standardDeviation([2, 4, 4, 4, 5, 5, 7, 9])).toBe(2);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
  it('finds peaks above the series median', () => {
    expect(findPeaks([1, 1, 5, 1, 1, 1, 6, 1], 3)).toEqual([2, 6]);
    expect(findPeaks([1, 1, 1.2, 1, 1], 3)).toEqual([]);
  });
});

describe('SensorBuffer', () => {
  it('computes jerk over elapsed firmware time', () => {
    const b = buffer();
    b.ingest(r(100, 0, 0, 1), 1000);
    const out = b.ingest(r(102, 0, 0, 2), 3000);
    expect(out).toMatchObject({ status: 'accepted', sample: { dt: 2, jerk: 0.5 } });
  });

  it('drops an exact repeat as a duplicate', () => {
    const b = buffer();
    b.ingest(r(100), 1000);
    expect(b.ingest(r(100), 2000)).toEqual({ status: 'duplicate' });
    expect(b.stats.duplicates).toBe(1);
    expect(b.stats.accepted).toBe(1);
  });

  it('keeps a new reading that shares a second, timing it by receive time', () => {
    const b = buffer();
    b.ingest(r(100, 0, 0, 1), 1000);
    const out = b.ingest(r(100, 0, 0, 1.5), 1500);
    expect(out).toMatchObject({ status: 'accepted', sample: { dt: 0.5, jerk: 1 } });
  });

  it('never divides by zero when two arrive at once', () => {
    const b = buffer();
    b.ingest(r(100, 0, 0, 1), 1000);
    const out = b.ingest(r(100, 0, 0, 2), 1000);
    expect(out.status === 'accepted' && Number.isFinite(out.sample.jerk)).toBe(true);
  });

  it('rejects out-of-order samples by firmware time, even if received later', () => {
    const b = buffer();
    b.ingest(r(100), 1000);
    expect(b.ingest(r(99, 1, 1, 1), 2000)).toEqual({ status: 'out_of_order' });
    expect(b.latest?.epoch).toBe(100);
    expect(b.stats.outOfOrder).toBe(1);
  });

  it('counts samples lost in a clear gap', () => {
    const b = buffer();
    b.ingest(r(100), 1000);
    expect(b.ingest(r(106), 7000)).toMatchObject({ status: 'accepted', missed: 5 });
    expect(b.stats.missing).toBe(5);
  });

  it('does not treat normal one-second steps as loss', () => {
    const b = buffer();
    b.ingest(r(100), 1000);
    b.ingest(r(101, 0.2), 2000);
    expect(b.stats.missing).toBe(0);
  });

  it('uses the configured polling interval for gap detection', () => {
    const b = new SensorBuffer({ expectedIntervalMs: 5000 });
    b.ingest(r(100), 0);
    expect(b.ingest(r(105, 0.2), 5000)).toMatchObject({ missed: 0 });
    expect(b.ingest(r(120, 0.3), 20000)).toMatchObject({ missed: 2 });
  });

  it('smooths over the rolling window', () => {
    const b = new SensorBuffer({ expectedIntervalMs: 1000, smoothingWindow: 2 });
    b.ingest(r(100, 0, 0, 1), 0);
    expect(b.ingest(r(101, 0, 0, 3), 1000)).toMatchObject({ sample: { smoothed: 2 } });
  });

  it('caps history and returns the newest samples oldest-first', () => {
    const b = new SensorBuffer({ expectedIntervalMs: 1000, historySize: 3 });
    for (let i = 0; i < 5; i++) b.ingest(r(100 + i, i), i * 1000);
    expect(b.window().map((s) => s.epoch)).toEqual([102, 103, 104]);
    expect(b.window(2).map((s) => s.epoch)).toEqual([103, 104]);
  });

  it('reset clears state so the next watch session starts clean', () => {
    const b = buffer();
    b.ingest(r(100), 0);
    b.reset();
    expect(b.latest).toBeNull();
    expect(b.stats.accepted).toBe(0);
    expect(b.ingest(r(50), 0).status).toBe('accepted');
  });
});
