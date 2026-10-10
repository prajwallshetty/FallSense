// Host-side tests for the firmware's hardware-independent code (protocol encoders and fall
// detector). Build & run:  g++ -std=c++17 -I../safefall_watch host_test.cpp -o host_test && ./host_test
// With --hex it prints encoded packets so the app's TypeScript parser can cross-check them.
#include <cassert>
#include <cstdio>
#include <cstring>
#include "safefall_protocol.h"
#include "fall_detector.h"

static int failures = 0;
#define CHECK(cond) do { if (!(cond)) { printf("FAIL %s:%d %s\n", __FILE__, __LINE__, #cond); failures++; } } while (0)

static void hex(const char *name, const uint8_t *b, int n) {
  printf("%s ", name);
  for (int i = 0; i < n; i++) printf("%02x", b[i]);
  printf("\n");
}

static FallVerdict feed(FallDetector &d, uint32_t &t, float ag, int ms, float gyro = 0) {
  FallVerdict last = FallVerdict::None;
  for (int i = 0; i < ms; i += 10) {
    float a[3] = {0, 0, ag}, g[3] = {gyro, 0, 0};
    FallVerdict v = d.update(t, a, g);
    if (v != FallVerdict::None) last = v;
    t += 10;
  }
  return last;
}

int main(int argc, char **argv) {
  bool printHex = argc > 1 && strcmp(argv[1], "--hex") == 0;

  // --- encoders ---
  uint8_t tel[20];
  float a[3] = {1.0f, -1.0f, 0.0f}, g[3] = {1.0f, -1.0f, 0.0f};
  sf_encode_telemetry(tel, 0x0102, 0x10, a, g);
  const uint8_t expectTel[20] = {1, 1, 0x02, 0x01, 0x10, 0, 0, 0, 0xe8, 0x03, 0x18, 0xfc, 0, 0, 10, 0, 0xf6, 0xff, 0, 0};
  CHECK(memcmp(tel, expectTel, 20) == 0);

  uint8_t evt[16];
  sf_encode_event(evt, 0xdeadbeef, SF_EVT_POSSIBLE_FALL, SF_STATE_POSSIBLE_FALL, 2.75f, 5000);
  CHECK(evt[0] == 1 && evt[1] == SF_MSG_EVENT);
  CHECK(sf_get_u32(evt + 2) == 0xdeadbeef);
  CHECK(evt[6] == 0x01 && evt[7] == 1);
  CHECK((evt[8] | (evt[9] << 8)) == 2750);

  uint8_t st[14];
  sf_encode_status(st, SF_STATE_NORMAL, 64, 3900, SF_STATUS_FLAG_IMU_OK, 1, 0, 0, 77);
  CHECK(st[3] == 64 && (st[4] | (st[5] << 8)) == 3900 && st[6] == 0x02 && st[7] == 1);

  if (printHex) {
    hex("telemetry", tel, 20);
    hex("event", evt, 16);
    hex("status", st, 14);
  }

  // --- fall detector ---
  {
    FallDetector d; uint32_t t = 0;
    CHECK(feed(d, t, 1.0f, 2000) == FallVerdict::None);           // standing still
    CHECK(feed(d, t, 0.2f, 150) == FallVerdict::None);            // free fall
    CHECK(feed(d, t, 3.0f, 20) == FallVerdict::PossibleFall);     // impact
    CHECK(feed(d, t, 1.0f, 3500) == FallVerdict::Confirmed);      // lying still
  }
  {
    FallDetector d; uint32_t t = 0;
    feed(d, t, 0.2f, 150);
    CHECK(feed(d, t, 3.0f, 20) == FallVerdict::PossibleFall);
    // Wearer gets up: large motion during the observation window.
    FallVerdict v = FallVerdict::None;
    for (int i = 0; i < 350; i++) { FallVerdict x = feed(d, t, (i % 2) ? 1.8f : 0.4f, 10, 200); if (x != FallVerdict::None) v = x; }
    CHECK(v == FallVerdict::Cleared);
  }
  {
    FallDetector d; uint32_t t = 0;
    // Brief dip without a sustained free fall followed by a moderate bump: no alarm.
    CHECK(feed(d, t, 0.3f, 30) == FallVerdict::None);
    CHECK(feed(d, t, 2.0f, 30) == FallVerdict::None);
    CHECK(feed(d, t, 1.0f, 1000) == FallVerdict::None);
  }
  {
    FallDetector d; uint32_t t = 0;
    // Hard sideways impact without free fall still triggers.
    CHECK(feed(d, t, 4.0f, 10) == FallVerdict::PossibleFall);
  }

  if (!printHex) printf(failures ? "%d FAILURE(S)\n" : "All firmware host tests passed\n", failures);
  return failures ? 1 : 0;
}
