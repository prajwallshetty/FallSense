# Test checklist

Legend: ✅ run and passing in this change · ⬜ must be run by you (needs hardware, credentials or an Android SDK)

## A. Automated tests (run in this change)

| Suite | Command | Result |
|---|---|---|
| TypeScript | `npm run ts:check` | ✅ 0 errors |
| ESLint (eslint-config-expo) | `npm run lint` | ✅ 0 problems |
| Jest unit/integration (9 suites) | `npm test` | ✅ 98 tests |
| Firestore rules (emulator) | `cd firestore-tests && npm test` | ✅ 31 tests |
| Cloud Function compiles | `cd functions && npm run build` | ✅ |
| Firmware host tests (encoders, fall detector) | `g++ -std=c++17 -Ifirmware/safefall_watch firmware/test/host_test.cpp -o host_test && ./host_test` | ✅ |
| Android JS bundle (Metro + Hermes) | `npx expo export --platform android` | ✅ 7 MB HBC bundle |
| Native config plugins | `npx expo prebuild --platform android --no-install` | ✅ manifest generated |

What the Jest suites cover:

* **BLE parsing** (`protocol.test.ts`): units and endianness, base64, short/oversized packets,
  wrong version or type, unknown enums, reserved id 0, command encoding, plus golden vectors
  from the firmware's C++ encoder.
* **Connection manager** (`connectionManager.test.ts`): GATT validation; non-SafeFall device
  rejection; malformed packets don't drop the link; reconnect with backoff; subscription cleanup;
  stale-data detection and forced reconnect; Bluetooth off/on; late callbacks from old
  connections ignored; serialized commands.
* **State machine** (`incidentMachine.test.ts`): every transition, cancel on app or watch,
  escalation, acknowledge and resolve; duplicate BLE events; a new fall while one is open;
  restart with an overdue countdown; manual and watch SOS; simulated incidents never synced;
  remote acknowledgement adopted without echo; no backwards transitions.
* **Persistence** (`incidentStore.test.ts`): an active incident and the dedupe list survive a
  restart; side effects queued until the handler exists.
* **Permissions** (`permissions.test.ts`): Android 12+ vs older vs iOS; blocked ("don't ask
  again") diagnostics.
* **Simulator safety** (`simulatorSafety.test.ts`): unavailable unless dev tools are on; a
  persisted simulator pairing is dropped in builds without dev tools; no silent fallback to the
  simulator; simulated incidents flagged; retransmissions deduped; never uploaded as device status.
* **Honest wording** (`alertDoc.test.ts`): never says "delivered"; backend failures surfaced;
  server-only fields never written.
* **Validation** (`validation.test.ts`): E.164 phone normalization, email, password, link codes.

## B. Simulator tests (dev build with `EXPO_PUBLIC_ENABLE_DEV_TOOLS=true`) ⬜

1. Watch tab → **Search for watch**. "SafeFall Simulator" appears with a purple
   **SIMULATED, NOT A REAL WATCH** badge.
2. Connect. The dashboard card is purple and labelled simulated; battery shows **Unknown**
   (the simulator reports no battery).
3. Dashboard → *Developer simulator* → **Simulate fall**. The full-screen alert shows
   "Possible fall", then the countdown. The badge says nobody will be notified.
4. **I'm OK, cancel** closes the alert. History shows it as Cancelled (simulated).
5. Simulate a fall and let the countdown reach 0. The alert escalates, the notification panel says
   "Simulator test: nobody was notified", and **no** document appears in Firestore `alerts`.
6. **Simulate link loss**. The status goes Reconnecting… → Connected, with entries in History →
   Watch activity.
7. Kill the app during a countdown and reopen it after the countdown should have ended. The alert
   is escalated, and its timeline says "Countdown expired while app was not running".
8. Build a preview profile (dev tools off). The simulator is not offered, and an existing
   simulator pairing is removed.

## C. Physical-device tests ⬜

Hardware: an Android phone (Android 12+ recommended) and the Waveshare ESP32-S3-Touch-LCD-1.28
flashed with `firmware/safefall_watch`.

**Pairing & link**
- [ ] Permissions screen requests Nearby devices + Location; denying shows a plain-language
  reason; "Don't ask again" shows **Open phone settings**.
- [ ] Watch appears as `SafeFall-XXXX`; Android shows the bonding prompt on first connect.
- [ ] Battery % roughly matches a multimeter reading (adjust `BAT_DIVIDER_RATIO`).
- [ ] Live motion shows ~1.00 g at rest.
- [ ] Walk out of range → "Reconnecting…" with retry countdown → reconnects automatically.
- [ ] Turn Bluetooth off → "Bluetooth is off"; on → reconnects.
- [ ] Power the watch off for >45 s → stale → reconnect attempts; dashboard says alerts can't
  reach the phone.

**Fall workflow**
- [ ] Drop test onto a cushion → POSSIBLE → countdown on phone; vibration starts.
- [ ] Short-press BOOT during countdown → app shows Cancelled (by watch).
- [ ] Cancel in the app → watch returns to NORMAL (status packet state 0).
- [ ] Let it escalate → Firestore `alerts/{id}` state `escalated`; caregiver phone gets a push;
  `dispatch.pushAccepted` populated.
- [ ] Caregiver taps **I'm on it** → wearer's screen shows "<name> is responding".
- [ ] Resolve on either phone → watch receives RESOLVE; both screens close.
- [ ] Long-press BOOT (2 s) → SOS escalates immediately.
- [ ] Trigger SOS on the watch while the phone's Bluetooth is off, then turn it on → alert arrives
  once (read on reconnect, deduped).
- [ ] Android back button does nothing on an open alert.

**Location**
- [ ] Location permission granted, GPS on → coordinates, accuracy, "Captured just now", Open in Maps works.
- [ ] Location permission denied → alert says "Location unavailable: permission not granted"
  (no coordinates shown).
- [ ] Location services off → "location services are off".
- [ ] Indoors with no fix → last known position shown and labelled old, or "no GPS signal".

**Offline**
- [ ] Airplane mode (Bluetooth on) → trigger fall → escalate → offline banner; alert says
  "Not sent yet … Retrying"; turn the network on → uploads, and the caregiver is notified.
- [ ] Kill the app while offline with an unsynced alert, reopen online → it uploads.
- [ ] Call/SMS buttons still list contacts offline (cached).

**Accounts & security**
- [ ] Sign up as elderly and as caregiver; sign out/in; app restart keeps you signed in.
- [ ] Caregiver links with a code; the code can't be reused; an expired code is rejected.
- [ ] Elderly user removes a caregiver → the caregiver loses access immediately.
- [ ] Sign out with an unsynced alert → warning shown.

**Accessibility**
- [ ] TalkBack reads status badges, countdown and buttons meaningfully.
- [ ] Largest system font size: no clipped buttons on the alert screen.

## D. Known limitations to verify/decide

* **Background operation:** BLE runs while the app is in the foreground or recently
  backgrounded. Android may suspend it later. Reliable 24/7 monitoring needs an Android
  foreground service (not implemented; see README "Remaining work").
* Fall-detection thresholds are untested heuristics until validated with recorded data.
