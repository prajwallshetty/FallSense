# SafeFall watch firmware (reference)

Target: **Waveshare ESP32-S3-Touch-LCD-1.28**: ESP32-S3R2, QMI8658 IMU, GC9A01 LCD, CST816S touch.

> This firmware did not exist in the repository before; it's a reference implementation
> of [SafeFall BLE Protocol v1](../docs/BLE_PROTOCOL.md). It has **not** been compiled or
> flashed as part of this change. Treat it as a starting point that has to be verified on hardware.

## Build & flash (Windows)

1. Install Arduino IDE 2.x.
2. Go to *File → Preferences → Additional boards manager URLs* and add
   `https://espressif.github.io/arduino-esp32/package_esp32_index.json`.
3. In *Boards Manager*, install **esp32 by Espressif Systems** (3.x).
4. Open `firmware/safefall_watch/safefall_watch.ino`.
5. Select *Board*: **ESP32S3 Dev Module**. Set *USB CDC On Boot*: **Enabled**,
   *Flash Size*: **16MB**, *PSRAM*: **QSPI PSRAM**, *Partition Scheme*: default 4 MB is enough.
6. Pick the board's COM port and click Upload. If upload fails, hold **BOOT**, tap **RESET**,
   then release BOOT.
7. Open the Serial Monitor at 115200 baud. You should see `[ble] advertising as SafeFall-XXXX`.
   If you see `QMI8658 not found`, check the I2C pins in `board_config.h`.

No extra libraries are required (BLE, Wire, Preferences ship with the core).

## Bench checks before trusting it

1. **IMU:** at rest, the telemetry screen in the app shows |a| ≈ 1.00 g. Rotate the watch and
   make sure the axes respond.
2. **Battery:** compare the status packet's mV with a multimeter on the cell. Adjust
   `BAT_DIVIDER_RATIO` until they match.
3. **Event delivery:** with the app connected, long-press BOOT for 2 s. The app should show an SOS
   alert once, even though the watch retransmits every 2 s.
4. **Out-of-range delivery:** disconnect the phone (turn Bluetooth off), trigger SOS,
   turn Bluetooth on again. The app must raise the alert after reconnecting.
5. **Fall detection:** drop the watch onto a cushion from about 1 m. You should get POSSIBLE_FALL,
   then FALL_CONFIRMED if it stays still or CLEARED if you pick it up within 2.5 s.
6. **Tuning:** record activities of daily living (sitting down hard, walking stairs, clapping,
   putting the watch on a table) and real/simulated falls on a mat. Adjust thresholds in
   `board_config.h` to keep false positives low without missing falls. Document the results.

## Firmware TODO

* GC9A01 alarm screen with countdown, plus CST816S tap-to-cancel.
* Passkey pairing shown on the display (replace Just Works).
* Haptic or buzzer feedback during an alarm (the board has no buzzer).
* Charging detection, if supported by your board revision.
* Light sleep / reduced IMU ODR for battery life.
