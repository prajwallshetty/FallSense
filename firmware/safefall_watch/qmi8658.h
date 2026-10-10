// Minimal register-level QMI8658 driver (accelerometer +-8 g, gyroscope +-512 dps, ~224 Hz).
// Register values follow the QST QMI8658 datasheet. VERIFY against datasheet revision for
// your part; alternatively replace with SensorLib's SensorQMI8658.
#pragma once
#include <Arduino.h>
#include <Wire.h>

class Qmi8658 {
 public:
  bool begin(TwoWire &wire, uint8_t addr) {
    wire_ = &wire;
    addr_ = addr;
    if (read8(REG_WHO_AM_I) != WHO_AM_I_VALUE) return false;
    write8(REG_RESET, 0xB0);  // soft reset
    delay(15);
    write8(REG_CTRL1, 0x40);  // address auto-increment, little-endian
    write8(REG_CTRL2, 0x25);  // accel: +-8 g (aFS=010), ODR code 0101
    write8(REG_CTRL3, 0x55);  // gyro: +-512 dps (gFS=101), ODR code 0101
    write8(REG_CTRL7, 0x03);  // enable accel + gyro
    delay(30);
    ok_ = read8(REG_WHO_AM_I) == WHO_AM_I_VALUE;
    return ok_;
  }

  bool ok() const { return ok_; }

  // Reads acceleration in g and angular rate in deg/s.
  bool read(float a_g[3], float g_dps[3]) {
    uint8_t raw[12];
    wire_->beginTransmission(addr_);
    wire_->write(REG_AX_L);
    if (wire_->endTransmission(false) != 0) { ok_ = false; return false; }
    if (wire_->requestFrom((int)addr_, 12) != 12) { ok_ = false; return false; }
    for (int i = 0; i < 12; i++) raw[i] = wire_->read();
    for (int i = 0; i < 3; i++) {
      int16_t a = (int16_t)(raw[2 * i] | (raw[2 * i + 1] << 8));
      int16_t g = (int16_t)(raw[6 + 2 * i] | (raw[6 + 2 * i + 1] << 8));
      a_g[i] = a / ACC_LSB_PER_G;
      g_dps[i] = g / GYR_LSB_PER_DPS;
    }
    ok_ = true;
    return true;
  }

 private:
  static constexpr uint8_t REG_WHO_AM_I = 0x00;
  static constexpr uint8_t WHO_AM_I_VALUE = 0x05;
  static constexpr uint8_t REG_CTRL1 = 0x02;
  static constexpr uint8_t REG_CTRL2 = 0x03;
  static constexpr uint8_t REG_CTRL3 = 0x04;
  static constexpr uint8_t REG_CTRL7 = 0x08;
  static constexpr uint8_t REG_AX_L = 0x35;
  static constexpr uint8_t REG_RESET = 0x60;
  static constexpr float ACC_LSB_PER_G = 4096.0f;   // +-8 g
  static constexpr float GYR_LSB_PER_DPS = 64.0f;   // +-512 dps

  uint8_t read8(uint8_t reg) {
    wire_->beginTransmission(addr_);
    wire_->write(reg);
    if (wire_->endTransmission(false) != 0) return 0xFF;
    if (wire_->requestFrom((int)addr_, 1) != 1) return 0xFF;
    return wire_->read();
  }
  void write8(uint8_t reg, uint8_t v) {
    wire_->beginTransmission(addr_);
    wire_->write(reg);
    wire_->write(v);
    wire_->endTransmission();
  }

  TwoWire *wire_ = nullptr;
  uint8_t addr_ = 0;
  bool ok_ = false;
};
