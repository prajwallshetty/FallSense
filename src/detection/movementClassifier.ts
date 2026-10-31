// Layer 2: movement pattern recognition over a rolling window. A transparent rule baseline, used
// until a temporal model can be trained on labelled data. One-second samples alias walking and
// running, so these labels are rough context for the detector, not activity tracking.

import { standardDeviation } from '../services/sensorService';
import { DetectionConfig } from './config';

export type Movement =
  | 'unknown'
  | 'still'
  | 'walking'
  | 'running'
  | 'sitting_down'
  | 'standing_up'
  | 'lying_down'
  | 'wrist_movement'
  | 'watch_removal'
  | 'unusual';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const unit = (v: Vec3): Vec3 => {
  const m = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  return m === 0 ? { x: 0, y: 0, z: 0 } : { x: v.x / m, y: v.y / m, z: v.z / m };
};

export function angleDeg(a: Vec3, b: Vec3): number {
  const dot = a.x * b.x + a.y * b.y + a.z * b.z;
  return (Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI;
}

export function meanDirection(vectors: Vec3[]): Vec3 {
  const sum = vectors.reduce((s, v) => ({ x: s.x + v.x, y: s.y + v.y, z: s.z + v.z }), { x: 0, y: 0, z: 0 });
  return unit(sum);
}

export interface WindowRow {
  magnitude: number;
  direction: Vec3;
}

const MIN_SAMPLES = 5;

/**
 * `usual` is the direction the watch normally rests in for this wearer. The wear orientation is
 * unknown in advance, so tilt is measured from what was observed rather than from a fixed axis.
 */
export function classifyMovement(rows: WindowRow[], rest: number, usual: Vec3 | null, cfg: DetectionConfig): Movement {
  if (rows.length < MIN_SAMPLES || rest <= 0) return 'unknown';

  const std = standardDeviation(rows.map((r) => r.magnitude)) / rest;
  const mean = meanDirection(rows.map((r) => r.direction));
  const range = Math.max(...rows.map((r) => angleDeg(r.direction, mean))) * 2;
  const tail = rows.slice(-3);
  const head = rows.slice(0, 3);
  const tailStd = standardDeviation(tail.map((r) => r.magnitude)) / rest;
  const tailMean = meanDirection(tail.map((r) => r.direction));
  const tailRange = Math.max(...tail.map((r) => angleDeg(r.direction, tailMean))) * 2;

  if (std < cfg.removedStdRatio && rows.length >= 10) return 'watch_removal';

  if (std < cfg.stillStdRatio && range < cfg.wristRangeDeg / 2) {
    const tilt = usual ? angleDeg(mean, usual) : 0;
    return tilt >= cfg.lyingTiltDeg ? 'lying_down' : 'still';
  }

  if (std >= cfg.runningStdRatio && range < cfg.lyingTiltDeg) return 'running';

  // A change of posture: movement that settles, ending at a different tilt from the usual pose.
  if (tailStd < cfg.stillStdRatio && tailRange < cfg.wristRangeDeg / 2 && usual) {
    const before = angleDeg(meanDirection(head.map((r) => r.direction)), usual);
    const after = angleDeg(meanDirection(tail.map((r) => r.direction)), usual);
    if (Math.abs(after - before) >= cfg.wristRangeDeg / 3) {
      if (after >= cfg.lyingTiltDeg) return 'lying_down';
      return after > before ? 'sitting_down' : 'standing_up';
    }
  }

  if (range >= cfg.wristRangeDeg) return std >= cfg.runningStdRatio ? 'unusual' : 'wrist_movement';
  if (std >= cfg.walkingStdRatio) return 'walking';
  return 'still';
}
