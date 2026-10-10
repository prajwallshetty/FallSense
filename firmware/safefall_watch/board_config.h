// Waveshare ESP32-S3-Touch-LCD-1.28 pin map and tuning constants.
// VERIFY these pins against the schematic for your exact board revision before flashing:
// https://www.waveshare.com/wiki/ESP32-S3-Touch-LCD-1.28
#pragma once

#define FW_VERSION_MAJOR 1
#define FW_VERSION_MINOR 0
#define FW_VERSION_PATCH 0
#define FW_VERSION_STRING "1.0.0"

// I2C bus shared by the QMI8658 IMU and the CST816S touch controller.
#define PIN_I2C_SDA 6
#define PIN_I2C_SCL 7
#define QMI8658_I2C_ADDR 0x6B

// Battery voltage through an on-board divider into an ADC pin.
#define PIN_BAT_ADC 1
#define BAT_DIVIDER_RATIO 3.0f   // VERIFY: measured_mV * ratio = battery mV
#define BAT_EMPTY_MV 3300
#define BAT_FULL_MV 4150

// BOOT button (active low). Short press = cancel alarm, long press = SOS.
#define PIN_BUTTON 0
#define BUTTON_LONG_PRESS_MS 2000

// ---- Fall detection (MUST be tuned and validated with real fall/ADL recordings) ----
#define IMU_SAMPLE_HZ 100
#define FREEFALL_G 0.45f          // |a| below this = free fall
#define FREEFALL_MIN_MS 60        // sustained free fall needed to arm impact detection
#define IMPACT_WINDOW_MS 1000     // impact must follow free fall within this window
#define IMPACT_G 2.5f             // impact after free fall
#define HARD_IMPACT_G 3.5f        // impact without detected free fall (e.g. sideways falls)
#define SETTLE_MS 500             // ignore bounce right after impact
#define STILLNESS_WINDOW_MS 2500  // observe the wearer after impact
#define STILL_ACCEL_TOL_G 0.30f   // | |a| - 1g | below this counts as still
#define STILL_GYRO_DPS 60.0f
#define STILL_FRACTION 0.70f      // fraction of still samples needed to confirm a fall

// ---- Protocol timing ----
#define STATUS_HEARTBEAT_MS 5000       // app marks data stale after 15 s without packets
#define EVENT_RETRANSMIT_MS 2000       // re-notify unacknowledged events
#define EVENT_RETRANSMIT_MAX_MS 600000 // keep the latest event readable/retransmitted up to 10 min
#define TELEMETRY_INTERVAL_MS 100      // 10 Hz when telemetry is enabled by the app

// Require an encrypted, bonded link for all SafeFall characteristics. Stops nearby devices
// from reading data or writing CANCEL/RESOLVE commands. See docs/BLE_PROTOCOL.md#security.
#define SAFEFALL_REQUIRE_BONDING 1
