// SafeFall watch reference firmware - Waveshare ESP32-S3-Touch-LCD-1.28
// (ESP32-S3, QMI8658 6-axis IMU, GC9A01 240x240 round LCD, CST816S touch).
//
// Implements SafeFall BLE Protocol v1 (docs/BLE_PROTOCOL.md). Fall detection runs locally on
// the watch; the phone only presents alerts, captures location and notifies caregivers.
//
// Toolchain: Arduino IDE 2.x + "esp32 by Espressif Systems" core 3.x, board "ESP32S3 Dev Module"
// (USB CDC On Boot: Enabled). Uses only the core's bundled BLE, Wire and Preferences libraries.
//
// STATUS: reference implementation. It has NOT been compiled or flashed as part of this
// repository's CI. Verify pins (board_config.h), IMU registers (qmi8658.h) and tune fall
// thresholds on real hardware before relying on it.
//
// NOT IMPLEMENTED HERE (firmware TODO):
//   * GC9A01 display UI (alarm screen + countdown) and CST816S touch cancel. Hooks: ui_*().
//   * Passkey-on-display BLE pairing (currently "Just Works" bonding; see docs).
//   * Vibration/buzzer feedback (the board has no buzzer; add one on a free GPIO if needed).

#include <Arduino.h>
#include <Wire.h>
#include <Preferences.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <BLESecurity.h>

#include "board_config.h"
#include "safefall_protocol.h"
#include "qmi8658.h"
#include "fall_detector.h"

static Qmi8658 imu;
static FallDetector detector;
static Preferences prefs;

static BLEServer *server = nullptr;
static BLECharacteristic *chTelemetry = nullptr, *chEvent = nullptr, *chStatus = nullptr, *chCommand = nullptr;
static BLECharacteristic *chBattery = nullptr;

static volatile bool clientConnected = false;
static bool telemetryEnabled = false;
static uint16_t telemetrySeq = 0;

static SfDeviceState deviceState = SF_STATE_NORMAL;

// Latest event awaiting acknowledgement from the app.
static uint8_t pendingEvent[16];
static bool eventPending = false;
static uint32_t pendingEventId = 0;
static uint32_t pendingSince = 0, lastRetransmit = 0;
static uint32_t currentFallEventId = 0;  // event id shared by POSSIBLE -> CONFIRMED/CLEARED/CANCELLED

static uint32_t lastSample = 0, lastStatus = 0, lastTelemetry = 0;
static float lastA[3] = {0, 0, 1}, lastG[3] = {0, 0, 0};

// Pending command from the BLE task, processed on the main loop to avoid races.
static volatile bool cmdAvailable = false;
static uint8_t cmdBuf[7];

// ------------------------------------------------------------------------------------------
// UI hooks (display not implemented in this reference firmware)
static void ui_show_state(SfDeviceState s) { Serial.printf("[ui] state=%d\n", (int)s); }
static void ui_show_message(const char *msg) { Serial.printf("[ui] %s\n", msg); }

// ------------------------------------------------------------------------------------------
static uint32_t nextEventId() {
  // Persisted so ids are never reused across reboots (the app dedupes on device+eventId).
  uint32_t id = prefs.getUInt("evt", 0) + 1;
  if (id == 0) id = 1;
  prefs.putUInt("evt", id);
  return id;
}

static uint16_t readBatteryMv() {
  uint32_t mv = analogReadMilliVolts(PIN_BAT_ADC);
  return (uint16_t)(mv * BAT_DIVIDER_RATIO);
}

static uint8_t batteryPercent(uint16_t mv) {
  if (mv < 2500) return SF_BATTERY_UNKNOWN;  // no battery / USB only
  if (mv <= BAT_EMPTY_MV) return 0;
  if (mv >= BAT_FULL_MV) return 100;
  return (uint8_t)((mv - BAT_EMPTY_MV) * 100 / (BAT_FULL_MV - BAT_EMPTY_MV));  // linear estimate
}

static void sendStatus() {
  uint16_t mv = readBatteryMv();
  uint8_t pct = batteryPercent(mv);
  uint8_t flags = (imu.ok() ? SF_STATUS_FLAG_IMU_OK : 0) | (telemetryEnabled ? SF_STATUS_FLAG_TELEMETRY_ON : 0);
  // Charging detection is not wired on this board revision; flag left clear.
  uint8_t buf[14];
  sf_encode_status(buf, deviceState, pct, pct == SF_BATTERY_UNKNOWN ? 0 : mv, flags, FW_VERSION_MAJOR, FW_VERSION_MINOR,
                   FW_VERSION_PATCH, millis());
  chStatus->setValue(buf, sizeof(buf));
  if (clientConnected) chStatus->notify();
  if (pct != SF_BATTERY_UNKNOWN) {
    chBattery->setValue(&pct, 1);
    if (clientConnected) chBattery->notify();
  }
}

static void setState(SfDeviceState s) {
  if (deviceState == s) return;
  deviceState = s;
  ui_show_state(s);
  sendStatus();
}

static void raiseEvent(uint32_t eventId, SfEventType type, float peak) {
  sf_encode_event(pendingEvent, eventId, type, deviceState, peak, millis());
  pendingEventId = eventId;
  eventPending = true;
  pendingSince = lastRetransmit = millis();
  chEvent->setValue(pendingEvent, sizeof(pendingEvent));
  if (clientConnected) chEvent->notify();
  Serial.printf("[evt] id=%lu type=%d state=%d peak=%.2fg\n", (unsigned long)eventId, (int)type, (int)deviceState, peak);
}

static void clearPendingEvent() {
  eventPending = false;
  uint8_t zeros[16] = {0};
  chEvent->setValue(zeros, sizeof(zeros));  // all-zero = "no pending event"
}

static void handleCommand(const uint8_t *b) {
  if (b[0] != SF_PROTOCOL_VERSION) return;
  uint32_t eventId = sf_get_u32(b + 2);
  switch (b[1]) {
    case SF_CMD_ACK_EVENT:
      if (eventPending && eventId == pendingEventId) {
        // Stop retransmitting; the value stays readable until superseded.
        eventPending = false;
      }
      break;
    case SF_CMD_CANCEL_ALARM:
      if (deviceState == SF_STATE_POSSIBLE_FALL || deviceState == SF_STATE_FALL_ALARM) {
        detector.reset();
        clearPendingEvent();
        setState(SF_STATE_NORMAL);
        ui_show_message("Cancelled from phone");
      }
      break;
    case SF_CMD_RESOLVE:
      detector.reset();
      clearPendingEvent();
      setState(SF_STATE_NORMAL);
      ui_show_message("Resolved");
      break;
    case SF_CMD_SET_TELEMETRY:
      telemetryEnabled = b[6] == 1;
      sendStatus();
      break;
    case SF_CMD_PING:
    default:
      break;
  }
}

// ------------------------------------------------------------------------------------------
class ServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer *) override { clientConnected = true; }
  void onDisconnect(BLEServer *) override {
    clientConnected = false;
    telemetryEnabled = false;  // the app re-enables telemetry when it needs it
    BLEDevice::startAdvertising();
  }
};

class CommandCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *c) override {
    if (c->getLength() < 7 || cmdAvailable) return;  // malformed or busy: ignore
    memcpy(cmdBuf, c->getData(), 7);
    cmdAvailable = true;
  }
};

static BLECharacteristic *makeChar(BLEService *svc, const char *uuid, uint32_t props) {
  BLECharacteristic *c = svc->createCharacteristic(uuid, props);
#if SAFEFALL_REQUIRE_BONDING
  c->setAccessPermissions(ESP_GATT_PERM_READ_ENCRYPTED | ESP_GATT_PERM_WRITE_ENCRYPTED);
#endif
  if (props & (BLECharacteristic::PROPERTY_NOTIFY)) c->addDescriptor(new BLE2902());
  return c;
}

static void setupBle() {
  uint8_t mac[6];
  esp_read_mac(mac, ESP_MAC_BT);
  char name[20];
  snprintf(name, sizeof(name), "SafeFall-%02X%02X", mac[4], mac[5]);

  BLEDevice::init(name);
#if SAFEFALL_REQUIRE_BONDING
  BLEDevice::setEncryptionLevel(ESP_BLE_SEC_ENCRYPT);
  BLESecurity *security = new BLESecurity();
  security->setAuthenticationMode(ESP_LE_AUTH_REQ_SC_BOND);  // LE Secure Connections + bonding
  security->setCapability(ESP_IO_CAP_NONE);                   // TODO: ESP_IO_CAP_OUT with passkey on LCD
  security->setInitEncryptionKey(ESP_BLE_ENC_KEY_MASK | ESP_BLE_ID_KEY_MASK);
#endif

  server = BLEDevice::createServer();
  server->setCallbacks(new ServerCallbacks());

  BLEService *svc = server->createService(BLEUUID(SF_SERVICE_UUID), 20);
  chTelemetry = makeChar(svc, SF_TELEMETRY_UUID, BLECharacteristic::PROPERTY_NOTIFY);
  chEvent = makeChar(svc, SF_EVENT_UUID, BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY);
  chStatus = makeChar(svc, SF_STATUS_UUID, BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY);
  chCommand = makeChar(svc, SF_COMMAND_UUID, BLECharacteristic::PROPERTY_WRITE);
  chCommand->setCallbacks(new CommandCallbacks());
  svc->start();

  // Standard Battery Service (0x180F / 0x2A19) and Device Information firmware revision.
  BLEService *bat = server->createService(BLEUUID((uint16_t)0x180F));
  chBattery = bat->createCharacteristic(BLEUUID((uint16_t)0x2A19), BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY);
  chBattery->addDescriptor(new BLE2902());
  bat->start();
  BLEService *dis = server->createService(BLEUUID((uint16_t)0x180A));
  BLECharacteristic *fw = dis->createCharacteristic(BLEUUID((uint16_t)0x2A26), BLECharacteristic::PROPERTY_READ);
  fw->setValue(FW_VERSION_STRING);
  dis->start();

  uint8_t zeros[16] = {0};
  chEvent->setValue(zeros, sizeof(zeros));

  BLEAdvertising *adv = BLEDevice::getAdvertising();
  adv->addServiceUUID(SF_SERVICE_UUID);
  adv->setScanResponse(true);
  BLEDevice::startAdvertising();
  Serial.printf("[ble] advertising as %s\n", name);
}

// ------------------------------------------------------------------------------------------
static void handleFallVerdict(FallVerdict v) {
  switch (v) {
    case FallVerdict::PossibleFall:
      if (deviceState != SF_STATE_NORMAL) return;  // already alarming: don't stack incidents
      currentFallEventId = nextEventId();
      setState(SF_STATE_POSSIBLE_FALL);
      raiseEvent(currentFallEventId, SF_EVT_POSSIBLE_FALL, detector.peakG());
      break;
    case FallVerdict::Confirmed:
      if (deviceState != SF_STATE_POSSIBLE_FALL) return;
      setState(SF_STATE_FALL_ALARM);
      raiseEvent(currentFallEventId, SF_EVT_FALL_CONFIRMED, detector.peakG());
      ui_show_message("Fall detected - press button to cancel");
      break;
    case FallVerdict::Cleared:
      if (deviceState != SF_STATE_POSSIBLE_FALL) return;
      setState(SF_STATE_NORMAL);
      raiseEvent(currentFallEventId, SF_EVT_CLEARED, 0);
      break;
    case FallVerdict::None:
      break;
  }
}

static void handleButton(uint32_t now) {
  static bool wasDown = false;
  static uint32_t downAt = 0;
  static bool longFired = false;
  bool down = digitalRead(PIN_BUTTON) == LOW;
  if (down && !wasDown) { downAt = now; longFired = false; }
  if (down && !longFired && now - downAt >= BUTTON_LONG_PRESS_MS && deviceState == SF_STATE_NORMAL) {
    longFired = true;
    setState(SF_STATE_SOS_ALARM);
    raiseEvent(nextEventId(), SF_EVT_SOS_BUTTON, 0);
    ui_show_message("SOS sent to phone");
  }
  if (!down && wasDown && !longFired && now - downAt > 40) {  // short press (debounced)
    if (deviceState == SF_STATE_POSSIBLE_FALL || deviceState == SF_STATE_FALL_ALARM) {
      detector.reset();
      setState(SF_STATE_CANCELLED);
      raiseEvent(currentFallEventId, SF_EVT_CANCELLED_ON_DEVICE, 0);
      setState(SF_STATE_NORMAL);
      ui_show_message("Alarm cancelled");
    }
  }
  wasDown = down;
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_BUTTON, INPUT_PULLUP);
  analogReadResolution(12);
  prefs.begin("safefall", false);

  Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL, 400000);
  if (!imu.begin(Wire, QMI8658_I2C_ADDR)) {
    Serial.println("[imu] QMI8658 not found - fall detection DISABLED (status flag imuOk=0)");
  }

  setupBle();
  ui_show_state(deviceState);
  sendStatus();
}

void loop() {
  const uint32_t now = millis();

  if (cmdAvailable) {
    uint8_t local[7];
    memcpy(local, cmdBuf, 7);
    cmdAvailable = false;
    handleCommand(local);
  }

  if (now - lastSample >= 1000 / IMU_SAMPLE_HZ) {
    lastSample = now;
    if (imu.ok() && imu.read(lastA, lastG)) {
      handleFallVerdict(detector.update(now, lastA, lastG));
    }
  }

  handleButton(now);

  if (telemetryEnabled && clientConnected && now - lastTelemetry >= TELEMETRY_INTERVAL_MS) {
    lastTelemetry = now;
    uint8_t buf[20];
    sf_encode_telemetry(buf, telemetrySeq++, now, lastA, lastG);
    chTelemetry->setValue(buf, sizeof(buf));
    chTelemetry->notify();
  }

  if (eventPending && clientConnected && now - lastRetransmit >= EVENT_RETRANSMIT_MS) {
    lastRetransmit = now;
    chEvent->notify();  // app dedupes on (device, eventId, eventType)
  }
  if (eventPending && now - pendingSince >= EVENT_RETRANSMIT_MAX_MS) eventPending = false;

  if (now - lastStatus >= STATUS_HEARTBEAT_MS) {
    lastStatus = now;
    sendStatus();
  }

  delay(2);
}
