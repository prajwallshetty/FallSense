// SafeFall BLE Protocol v1 - firmware side. MUST stay in sync with src/ble/protocol.ts
// and docs/BLE_PROTOCOL.md. All multi-byte fields are little-endian.
#pragma once
#include <stdint.h>
#include <string.h>
#include <math.h>

#define SF_PROTOCOL_VERSION 1

// Base UUID 4FA1xxxx-C4C2-4C2E-9D19-9B92A265E923
#define SF_SERVICE_UUID   "4fa10001-c4c2-4c2e-9d19-9b92a265e923"
#define SF_TELEMETRY_UUID "4fa10002-c4c2-4c2e-9d19-9b92a265e923"
#define SF_EVENT_UUID     "4fa10003-c4c2-4c2e-9d19-9b92a265e923"
#define SF_STATUS_UUID    "4fa10004-c4c2-4c2e-9d19-9b92a265e923"
#define SF_COMMAND_UUID   "4fa10005-c4c2-4c2e-9d19-9b92a265e923"

enum SfMessageType : uint8_t { SF_MSG_TELEMETRY = 0x01, SF_MSG_EVENT = 0x02, SF_MSG_STATUS = 0x03 };

enum SfEventType : uint8_t {
  SF_EVT_POSSIBLE_FALL = 0x01,
  SF_EVT_FALL_CONFIRMED = 0x02,
  SF_EVT_CANCELLED_ON_DEVICE = 0x03,
  SF_EVT_SOS_BUTTON = 0x04,
  SF_EVT_CLEARED = 0x05,
};

enum SfDeviceState : uint8_t {
  SF_STATE_NORMAL = 0,
  SF_STATE_POSSIBLE_FALL = 1,
  SF_STATE_FALL_ALARM = 2,
  SF_STATE_CANCELLED = 3,
  SF_STATE_SOS_ALARM = 4,
};

enum SfCommand : uint8_t {
  SF_CMD_ACK_EVENT = 0x01,
  SF_CMD_CANCEL_ALARM = 0x02,
  SF_CMD_RESOLVE = 0x03,
  SF_CMD_SET_TELEMETRY = 0x10,
  SF_CMD_PING = 0x20,
};

#define SF_STATUS_FLAG_CHARGING 0x01
#define SF_STATUS_FLAG_IMU_OK 0x02
#define SF_STATUS_FLAG_TELEMETRY_ON 0x04
#define SF_BATTERY_UNKNOWN 0xFF

static inline void sf_put_u16(uint8_t *b, uint16_t v) { b[0] = v & 0xFF; b[1] = v >> 8; }
static inline void sf_put_i16(uint8_t *b, int16_t v) { sf_put_u16(b, (uint16_t)v); }
static inline void sf_put_u32(uint8_t *b, uint32_t v) { for (int i = 0; i < 4; i++) b[i] = (v >> (8 * i)) & 0xFF; }
static inline uint32_t sf_get_u32(const uint8_t *b) { return b[0] | (b[1] << 8) | (b[2] << 16) | ((uint32_t)b[3] << 24); }
static inline int16_t sf_clamp_i16(float v) { return v > 32767.f ? 32767 : (v < -32768.f ? -32768 : (int16_t)lroundf(v)); }

// 20 bytes: ver, type, seq u16, uptime u32, ax ay az (milli-g i16), gx gy gz (0.1 dps i16)
static inline void sf_encode_telemetry(uint8_t out[20], uint16_t seq, uint32_t uptime, const float a_g[3], const float g_dps[3]) {
  out[0] = SF_PROTOCOL_VERSION; out[1] = SF_MSG_TELEMETRY;
  sf_put_u16(out + 2, seq); sf_put_u32(out + 4, uptime);
  for (int i = 0; i < 3; i++) sf_put_i16(out + 8 + 2 * i, sf_clamp_i16(a_g[i] * 1000.f));
  for (int i = 0; i < 3; i++) sf_put_i16(out + 14 + 2 * i, sf_clamp_i16(g_dps[i] * 10.f));
}

// 16 bytes: ver, type, eventId u32, eventType, state, peak (milli-g u16), uptime u32, reserved u16
static inline void sf_encode_event(uint8_t out[16], uint32_t eventId, uint8_t type, uint8_t state, float peak_g, uint32_t uptime) {
  memset(out, 0, 16);
  out[0] = SF_PROTOCOL_VERSION; out[1] = SF_MSG_EVENT;
  sf_put_u32(out + 2, eventId); out[6] = type; out[7] = state;
  float mg = peak_g * 1000.f; sf_put_u16(out + 8, mg > 65535.f ? 65535 : (uint16_t)mg);
  sf_put_u32(out + 10, uptime);
}

// 14 bytes: ver, type, state, battery %, battery mV u16, flags, fw major/minor/patch, uptime u32
static inline void sf_encode_status(uint8_t out[14], uint8_t state, uint8_t battPct, uint16_t battMv, uint8_t flags,
                                    uint8_t fwMaj, uint8_t fwMin, uint8_t fwPat, uint32_t uptime) {
  out[0] = SF_PROTOCOL_VERSION; out[1] = SF_MSG_STATUS; out[2] = state; out[3] = battPct;
  sf_put_u16(out + 4, battMv); out[6] = flags; out[7] = fwMaj; out[8] = fwMin; out[9] = fwPat;
  sf_put_u32(out + 10, uptime);
}
