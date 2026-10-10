// On-watch fall detection: free fall -> impact -> post-impact stillness.
// Runs entirely on the ESP32-S3; needs neither the phone nor the internet.
// This is a classic threshold heuristic suitable for a prototype. Thresholds in
// board_config.h MUST be validated on recorded falls and activities of daily living.
#pragma once
#include <math.h>
#include "board_config.h"

enum class FallVerdict { None, PossibleFall, Confirmed, Cleared };

class FallDetector {
 public:
  // Feed one sample (g, dps) at IMU_SAMPLE_HZ. Returns a verdict when the state changes.
  FallVerdict update(uint32_t nowMs, const float a[3], const float g[3]) {
    const float am = sqrtf(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
    const float gm = sqrtf(g[0] * g[0] + g[1] * g[1] + g[2] * g[2]);

    switch (phase_) {
      case Phase::Idle:
        if (am < FREEFALL_G) {
          if (freeFallStart_ == 0) freeFallStart_ = nowMs;
          if (nowMs - freeFallStart_ >= FREEFALL_MIN_MS) { phase_ = Phase::FreeFall; phaseStart_ = nowMs; }
        } else {
          freeFallStart_ = 0;
          if (am > HARD_IMPACT_G) return impact(nowMs, am);
        }
        break;
      case Phase::FreeFall:
        if (am > IMPACT_G) return impact(nowMs, am);
        if (nowMs - phaseStart_ > IMPACT_WINDOW_MS) reset();
        break;
      case Phase::Settling:
        if (am > peakG_) peakG_ = am;
        if (nowMs - phaseStart_ >= SETTLE_MS) { phase_ = Phase::Observing; phaseStart_ = nowMs; samples_ = still_ = 0; }
        break;
      case Phase::Observing:
        samples_++;
        if (fabsf(am - 1.0f) < STILL_ACCEL_TOL_G && gm < STILL_GYRO_DPS) still_++;
        if (nowMs - phaseStart_ >= STILLNESS_WINDOW_MS) {
          const bool lying = samples_ > 0 && (float)still_ / samples_ >= STILL_FRACTION;
          reset();
          return lying ? FallVerdict::Confirmed : FallVerdict::Cleared;
        }
        break;
    }
    return FallVerdict::None;
  }

  float peakG() const { return peakG_; }
  void reset() { phase_ = Phase::Idle; freeFallStart_ = 0; }

 private:
  enum class Phase { Idle, FreeFall, Settling, Observing };

  FallVerdict impact(uint32_t nowMs, float am) {
    peakG_ = am;
    phase_ = Phase::Settling;
    phaseStart_ = nowMs;
    return FallVerdict::PossibleFall;
  }

  Phase phase_ = Phase::Idle;
  uint32_t freeFallStart_ = 0, phaseStart_ = 0;
  uint32_t samples_ = 0, still_ = 0;
  float peakG_ = 0;
};
