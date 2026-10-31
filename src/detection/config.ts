// Detection thresholds. These are starting values for a transparent rule-based baseline. They have
// NOT been calibrated against labelled data and are not validated medical settings.
//
// The x/y/z unit is unconfirmed, so nothing here is expressed in g. Acceleration thresholds are
// ratios of the wearer's own learned resting magnitude, which keeps them valid in any unit.

export interface DetectionConfig {
  /** Samples used to learn the resting magnitude before detection can run. */
  baselineSamples: number;
  /** Rolling window (samples) for the resting magnitude and pre-event orientation. */
  windowSamples: number;

  /** |M - rest| / rest at or above this counts as a transient. */
  transientRatio: number;
  /** |M - rest| / rest at or above this counts as a hard transient. */
  hardTransientRatio: number;
  /** Jerk / rest (per second) at or above this counts as a sudden change. */
  jerkRatio: number;
  /** Shift in the gravity direction, degrees, that counts as an orientation change. */
  orientationChangeDeg: number;

  /** Seconds observed after a candidate event before deciding. */
  postEventSeconds: number;
  /** Std deviation of magnitude / rest below this means a stretch of samples is still. */
  stillStdRatio: number;
  /** Fraction of post-event samples that must be still to count as reduced movement. */
  stillFraction: number;
  /** Std deviation / rest below this looks like an unworn watch rather than a resting arm. */
  removedStdRatio: number;

  /** Score at or above this requests user verification. */
  verifyScore: number;
  /** Lower bar when the data around an event was too poor to judge. Errs toward asking the user. */
  poorQualityVerifyScore: number;
  /** Escalate at once when a hard transient, orientation change and stillness all coincide. */
  immediateEscalation: boolean;
  /** Seconds after a resolved event before a new candidate can start. */
  cooldownSeconds: number;

  /** Std deviation / rest at or above this over a window looks like walking. */
  walkingStdRatio: number;
  /** Std deviation / rest at or above this over a window looks like running. */
  runningStdRatio: number;
  /** Orientation range, degrees, within a window that looks like arm or wrist movement. */
  wristRangeDeg: number;
  /** Tilt from the usual orientation, degrees, that looks like lying down. */
  lyingTiltDeg: number;
}

export const DEFAULT_DETECTION_CONFIG: DetectionConfig = {
  baselineSamples: 8,
  windowSamples: 30,

  transientRatio: 0.25,
  hardTransientRatio: 0.8,
  jerkRatio: 0.3,
  orientationChangeDeg: 40,

  postEventSeconds: 10,
  stillStdRatio: 0.03,
  stillFraction: 0.6,
  removedStdRatio: 0.0005,

  verifyScore: 0.6,
  poorQualityVerifyScore: 0.3,
  immediateEscalation: true,
  cooldownSeconds: 30,

  walkingStdRatio: 0.05,
  runningStdRatio: 0.25,
  wristRangeDeg: 35,
  lyingTiltDeg: 55,
};

/** Range limits for the configuration screen, so a typo cannot disable detection. */
export const CONFIG_LIMITS: Record<Exclude<keyof DetectionConfig, 'immediateEscalation'>, [number, number]> = {
  baselineSamples: [3, 60],
  windowSamples: [10, 120],
  transientRatio: [0.05, 2],
  hardTransientRatio: [0.2, 5],
  jerkRatio: [0.05, 5],
  orientationChangeDeg: [10, 120],
  postEventSeconds: [3, 60],
  stillStdRatio: [0.001, 0.3],
  stillFraction: [0.1, 1],
  removedStdRatio: [0, 0.05],
  verifyScore: [0.1, 1],
  poorQualityVerifyScore: [0.1, 1],
  cooldownSeconds: [0, 600],
  walkingStdRatio: [0.01, 1],
  runningStdRatio: [0.02, 2],
  wristRangeDeg: [5, 120],
  lyingTiltDeg: [20, 120],
};

export function sanitizeDetectionConfig(input: Partial<DetectionConfig>): DetectionConfig {
  const out: DetectionConfig = { ...DEFAULT_DETECTION_CONFIG };
  for (const key of Object.keys(CONFIG_LIMITS) as (keyof typeof CONFIG_LIMITS)[]) {
    const v = input[key];
    if (typeof v === 'number' && Number.isFinite(v)) {
      const [lo, hi] = CONFIG_LIMITS[key];
      out[key] = Math.min(hi, Math.max(lo, v));
    }
  }
  if (typeof input.immediateEscalation === 'boolean') out.immediateEscalation = input.immediateEscalation;
  return out;
}
