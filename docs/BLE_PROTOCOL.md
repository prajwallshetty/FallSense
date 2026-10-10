# SafeFall BLE Protocol v1

Shared contract between the SafeFall AI app (`src/ble/protocol.ts`) and the watch firmware
(`firmware/safefall_watch/safefall_protocol.h`). Change both sides together and bump
`PROTOCOL_VERSION` on any incompatible change.

Target hardware: **Waveshare ESP32-S3-Touch-LCD-1.28** (ESP32-S3, QMI8658 6-axis IMU, GC9A01
round LCD, CST816S touch). The phone does not read sensors directly; it only talks to the
GATT server below.

## Responsibilities

| Watch (firmware) | Phone (app) |
|---|---|
| Samples the QMI8658 and runs fall detection locally, no phone or internet needed | Shows the alert and runs the countdown |
| Raises events, retransmits them until acknowledged, keeps the latest event readable | Dedupes events, persists incidents, escalates |
| Local cancel (short press) and SOS (long press) on the BOOT button | Captures GPS, notifies caregivers through the backend |
| Battery and status heartbeat every 5 s | Detects stale links and reconnects |

## GATT layout

Base UUID (inherited from the original repo): `4FA1xxxx-C4C2-4C2E-9D19-9B92A265E923`.

| Name | UUID | Properties | Payload |
|---|---|---|---|
| SafeFall service | `4fa10001-c4c2-4c2e-9d19-9b92a265e923` | primary | |
| Telemetry | `4fa10002-…` | notify | Telemetry packet (optional; off by default) |
| Event | `4fa10003-…` | read, notify | Event packet; all-zero value = no pending event |
| Status | `4fa10004-…` | read, notify | Status packet; heartbeat every 5 s and on state change |
| Command | `4fa10005-…` | write (with response) | Command packet |
| Battery service (SIG) | `0x180F` / Battery Level `0x2A19` | read, notify | uint8 0-100 (optional) |
| Device Information (SIG) | `0x180A` / Firmware Revision `0x2A26` | read | ASCII, e.g. `1.0.0` (optional) |

Advertising: local name `SafeFall-XXXX` (last two MAC bytes), service UUID `4fa10001-…`.
The app scans unfiltered and classifies devices by service UUID **or** the `SafeFall` name prefix.
After connecting, the app refuses devices that lack Event, Status or Command (`GattMismatchError`).

## Packets

All integers are **little-endian**. Byte 0 is always `protocolVersion` (= `1`) and byte 1 is
`messageType`. Receivers reject packets with an unknown version or type, packets shorter than
the length below, and unknown enum values. Extra trailing bytes are ignored (room for v1.x
additions).

### Telemetry (type `0x01`, 20 bytes)

| Offset | Type | Field | Unit |
|---|---|---|---|
| 0 | u8 | version = 1 | |
| 1 | u8 | type = 0x01 | |
| 2 | u16 | seq | wraps at 65535 |
| 4 | u32 | uptimeMs | ms since boot |
| 8, 10, 12 | i16 ×3 | accel X, Y, Z | milli-g |
| 14, 16, 18 | i16 ×3 | gyro X, Y, Z | 0.1 °/s |

20 bytes fits the default ATT MTU (23). Sent at 10 Hz only while enabled by `SET_TELEMETRY`;
the app enables it only while the dashboard is open, which saves watch battery.

### Event (type `0x02`, 16 bytes)

| Offset | Type | Field | Notes |
|---|---|---|---|
| 0 | u8 | version = 1 | |
| 1 | u8 | type = 0x02 | |
| 2 | u32 | eventId | ≠ 0, never reused (persisted counter in NVS) |
| 6 | u8 | eventType | see below |
| 7 | u8 | deviceState | state after the event |
| 8 | u16 | peakAccel | milli-g, 0 if not applicable |
| 10 | u32 | uptimeMs | ms since boot |
| 14 | u16 | reserved | 0 |

`eventType`: `0x01` POSSIBLE_FALL, `0x02` FALL_CONFIRMED, `0x03` CANCELLED_ON_DEVICE,
`0x04` SOS_BUTTON, `0x05` CLEARED (watch decided it was not a fall).

One fall uses **one eventId** for its whole life (POSSIBLE_FALL → FALL_CONFIRMED / CLEARED /
CANCELLED_ON_DEVICE). The app's stable incident ID is `<uid>_<deviceId>_<eventId>`, and its
dedupe key is `(deviceId, eventId, eventType)`.

**Delivery:** the firmware notifies the event, re-notifies every 2 s until it receives
`ACK_EVENT` for that id (giving up after 10 min), and keeps it readable on the Event
characteristic. On every (re)connect the app reads the Event characteristic, so a fall that
happened while the phone was out of range is delivered when the link returns.

### Status (type `0x03`, 14 bytes)

| Offset | Type | Field | Notes |
|---|---|---|---|
| 0 | u8 | version = 1 | |
| 1 | u8 | type = 0x03 | |
| 2 | u8 | deviceState | 0 NORMAL, 1 POSSIBLE_FALL, 2 FALL_ALARM, 3 CANCELLED, 4 SOS_ALARM |
| 3 | u8 | batteryPercent | 0-100, `0xFF` = unknown |
| 4 | u16 | batteryMillivolts | 0 = unknown |
| 6 | u8 | flags | bit0 charging, bit1 IMU OK, bit2 telemetry on |
| 7 | u8 ×3 | firmware major, minor, patch | |
| 10 | u32 | uptimeMs | |

The battery percentage is a **linear voltage estimate** (3300 to 4150 mV), not a fuel gauge.
The app shows "unknown" rather than a number when the watch reports `0xFF`.

### Command (written by the app, 7 bytes)

| Offset | Type | Field |
|---|---|---|
| 0 | u8 | version = 1 |
| 1 | u8 | command |
| 2 | u32 | eventId (0 when not applicable) |
| 6 | u8 | arg |

| Code | Name | Effect on watch |
|---|---|---|
| `0x01` | ACK_EVENT | Stop retransmitting `eventId` |
| `0x02` | CANCEL_ALARM | User cancelled in app: POSSIBLE_FALL/FALL_ALARM → NORMAL, clear event |
| `0x03` | RESOLVE | Incident resolved: any alarm → NORMAL, clear event |
| `0x10` | SET_TELEMETRY | `arg` 1 = on, 0 = off |
| `0x20` | PING | No-op (keep-alive / diagnostics) |

## Timing

| Item | Value |
|---|---|
| Status heartbeat | every 5 s |
| App marks data stale | 15 s without any packet |
| App forces reconnect | 45 s without any packet |
| App reconnect backoff | 1, 2, 5, 10, 20, 30 s, then 30 s steps; **bounded to 12 attempts** (~4.5 min), then Disconnected until app foreground / Bluetooth on / Reconnect |
| Event age | `watchUptimeNow − event.uptimeMs` (watch uptime extrapolated from the last status heartbeat). ≥1 min: incident marked "delivered late"; >60 min: ACKed and logged, no alarm |
| Connect timeout | 15 s |
| Event retransmit | every 2 s, for up to 10 min |
| App countdown | `EXPO_PUBLIC_FALL_COUNTDOWN_SECONDS` (default 30 s) |
| Possible-fall timeout | 20 s: if no FALL_CONFIRMED/CLEARED arrives, the app starts the countdown anyway (fail-safe) |

## Security

* `SAFEFALL_REQUIRE_BONDING=1` (default) sets every SafeFall characteristic to require an
  **encrypted, bonded link** (LE Secure Connections). Android shows a pairing prompt on first
  connect. This stops nearby devices from reading data or sending CANCEL/RESOLVE.
* **Limitation:** the reference firmware uses "Just Works" pairing (`ESP_IO_CAP_NONE`), which
  encrypts the link but does not protect against an active man-in-the-middle during the first
  pairing. **Firmware TODO:** show a 6-digit passkey on the GC9A01 (`ESP_IO_CAP_OUT`).
* The watch accepts a single connection; advertising resumes on disconnect.

## Not provided by firmware v1

The app does not invent these fields. If they are needed, they must be added to the firmware (and a protocol version bump):

* **Fall confidence score:** only `peakAccel` is sent.
* **Absolute timestamps:** only watch uptime is sent; the app records phone receive time and derives event age from uptime.
* **Charging state:** the flag exists but the reference firmware never sets it (no charge-detect pin wired), so the app does not display charging.

## Firmware implementation status

| Item | Status |
|---|---|
| GATT server, packets, commands, retransmission, NVS event ids | Implemented in `firmware/safefall_watch` (not compiled in CI) |
| QMI8658 driver (register level) | Implemented; **verify** register values and pins on hardware |
| Fall detection (free fall → impact → stillness) | Implemented; **thresholds must be tuned/validated** |
| BOOT button cancel / SOS | Implemented |
| Battery estimate via ADC (GPIO1, divider ×3) | Implemented; **verify divider ratio** |
| GC9A01 alarm UI, CST816S touch cancel, passkey display | **Not implemented (firmware TODO)** |
| Charging detection | **Not implemented** (flag always 0) |
