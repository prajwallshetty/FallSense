# SafeFall AI: Wi-Fi watch, detection and remote caretaker upgrade

Watch -> user's phone -> cloud backend -> caretaker's phone.

This document says what exists, how to run it, and, plainly, what has and has not been tested.
The verification table at the end is the part to read before relying on any of this.

## What was built

| Area | Where |
|---|---|
| Watch API contract and parsing | `src/watch/protocol.ts` |
| Polling, connection state, staleness | `src/services/connectionService.ts`, `watchApiService.ts` |
| Android routing over the watch Wi-Fi, background polling | `modules/watch-network/` (Kotlin) |
| Ordering, duplicates, gaps, magnitude, jerk | `src/services/sensorService.ts` |
| Fall detection (4 layers, 8 states) | `src/detection/` |
| Incident workflow and user verification | `src/emergency/incidentMachine.ts`, `src/services/incidentService.ts` |
| Access-code login | `src/services/authService.ts`, `backend/src/app.ts` |
| Cloud sync with offline queue | `src/services/cloudSyncService.ts` |
| Backend API, database, RLS, push dispatch | `backend/` |
| Caretaker dashboard, alerts, history, insights | `src/app/(app)/` |
| Calibration and evaluation | `src/detection/evaluation.ts`, `scripts/evaluate-detection.ts` |

The existing BLE code, Firestore rules and Cloud Function were left in place. Email/Firebase sign-in
is off by default (`EXPO_PUBLIC_ENABLE_FIREBASE_AUTH`), because Firebase Authentication is not
provisioned on this project (the API returns `CONFIGURATION_NOT_FOUND`).

## The watch firmware

The Wi-Fi firmware that serves `/data` **is not in this repository**. The only firmware here is the
Bluetooth reference sketch under `firmware/`, which has no Wi-Fi or HTTP code. So these could not be
confirmed from source and the app deliberately assumes none of them:

- accelerometer model and the unit of x/y/z (the app shows **no units**);
- sampling rate and filtering behind the one-second values;
- axis orientation;
- whether the watch buffers high-rate data or runs its own fall detection.

One observation worth checking on the real watch: the sample in the brief has a magnitude of 0.888.
A resting accelerometer in g reads about 1.0. That could be a different scale, an offset, or filtering.
The detector uses ratios to a learned resting level, so it works either way, but the cause should be known.

`epoch` is UTC (1793363492 = 12:31:32 UTC) and `time`/`date` are the watch's local clock (18:01:32 here,
UTC+5:30). The app orders by `epoch` and treats `time`/`date` as display only.

**Recommended firmware change (not made):** sample the accelerometer at 50-100 Hz, keep a rolling buffer,
and expose peak magnitude and a timestamped event for the last few seconds (for example `/events` or extra
fields). At one reading per second the impact of a fall usually falls *between* readings. The detector
therefore relies on a lasting orientation change followed by stillness, and treats a captured peak as extra
evidence. That is weaker than seeing the impact.

## Detection

Rules, not a trained model: there is no labelled data yet. The four layers are in
`src/detection/detectionEngine.ts`. The "score" is a sum of evidence weights, **not a probability**, and is
never shown as a percentage. Thresholds are ratios of the wearer's own learned resting level, so they do
not depend on units. They are **uncalibrated starting values**.

Failure direction: lost or poor data never clears a possible fall; it asks the user. "I'M OK" closes the
incident as a false alarm and records the response; the original event stays in history and in the cloud.

To measure accuracy: record labelled data on the Calibration screen (enabled per user in the database),
export it, and run `npx tsx scripts/evaluate-detection.ts recordings.json`. The tool splits by participant
and prints warnings until the dataset is large enough to say anything. **No accuracy figure exists yet.**
Simulated falls must be done under supervision, on mats, by adults able to do so safely.

## Backend

Node + Express + Postgres (Supabase). Access codes are random, shown once, stored only as an HMAC with a
server-side pepper, rate limited, and revocable (revocation takes effect on the next request). Tokens are
short-lived JWTs plus rotating refresh tokens. Row-level security protects direct database access and
Supabase Realtime.

```
cd backend
cp .env.example .env          # fill in; never commit
npm install
npm run migrate               # additive and idempotent
npm run admin -- create-user "Asha Rao"
npm run admin -- create-caretaker "Ravi Rao"
npm run admin -- link <userId> <caretakerId> son
npm run admin -- issue-code user <userId>        # shown once
npm run admin -- issue-code caretaker <caretakerId>
npm run build && npm start     # behind a TLS-terminating proxy
```

Needs from you: a Supabase project (or any Postgres), a place to host the API over HTTPS, and a Firebase
service-account JSON for FCM. Without the service account, pushes are logged as `failed`
(`provider_unconfigured`); nothing is reported as sent.

Delivery is tracked honestly: `provider_accepted` means FCM took the message, **not** that the phone got it.
`device_received` is recorded only when the caretaker's own phone confirms. Acknowledgment is separate.

## The app

Set in `.env` (the app is not built with a backend until you do):

```
EXPO_PUBLIC_API_URL=https://your-api.example.com
EXPO_PUBLIC_SUPABASE_URL=...        # optional, faster caretaker updates
EXPO_PUBLIC_SUPABASE_ANON_KEY=...   # optional
EXPO_PUBLIC_ENABLE_DEMO_MODE=false  # true shows local demo accounts; never for production
```

Caretaker push needs `google-services.json` in the project root (git-ignored) so the build can get an FCM token.

Build: `npx expo run:android` (debug) or `cd android && .\gradlew.bat assembleRelease`. Use a development or
native build; Expo Go cannot load the native module.

### Phone networking

The watch Wi-Fi has no internet. The native module asks Android for the Wi-Fi network and sends only watch
requests over it, leaving mobile data as the default for cloud sync. It does **not** bind the whole process to
Wi-Fi. Whether the phone keeps both connections depends on the manufacturer; the Watch screen shows what
this phone is actually doing (route, internet on each network, battery restrictions). If the cloud is
unreachable the app says "Cloud offline", keeps monitoring, queues events, and uploads when the internet returns.

On Android, tell the phone to stay connected to the watch network when it warns there is no internet. On
manufacturers that kill background apps, use Settings > Battery settings.

## Verification

"Stand-in" means a small test server (`e2e/mock-watch.js`) that returns the confirmed response shape.
It proves the app handles that shape. It does not prove how the real watch behaves.

| # | Required test | Status |
|---|---|---|
| 1 | User login | Passed: API tests and web end-to-end. Not on a phone. |
| 2 | Caretaker login | Passed: same. |
| 3 | Watch hotspot connection | **Not tested.** No watch available. |
| 4 | Local IP reachability | **Not tested** on a phone. |
| 5 | `/data` endpoint access | Passed against the stand-in only. |
| 6 | Actual JSON parsing | Passed: unit tests on the confirmed payload and bad variants. |
| 7 | Automatic XYZ updates | Passed against the stand-in (web). |
| 8 | Timestamp accuracy | Ordering and clock-skew logic unit tested. Real watch clock not checked. |
| 9 | Negative and positive readings | Passed (unit and end-to-end). |
| 10 | Stale-data detection | Passed (unit and end-to-end). |
| 11 | Disconnect and reconnect | Passed against the stand-in. |
| 12 | Cloud synchronization | Passed against the real API on Postgres. |
| 13 | Offline event queue | Passed (unit and end-to-end, including upload on reconnect). |
| 14 | Remote caretaker updates | Passed by polling. **Realtime not tested.** |
| 15 | Confirmed fall handling | Passed end-to-end (verification, I'M OK, no response, help). |
| 16 | Push notification delivery | **Not tested.** Dispatch to a test sender passed; no FCM, no real phone. |
| 17 | Caretaker acknowledgment | Passed end-to-end, including back to the wearer. |
| 18 | Android background behaviour | **Not tested.** The service compiles; it has not run on a phone. |
| 19 | Access permissions | Passed: backend tests, including RLS on real Postgres. |
| 20 | Data integrity | Passed: idempotent uploads, duplicate suppression, stale snapshots, migrations re-run. |

Automated: app `jest`, backend `npm test` (Postgres engine in WASM, not Supabase itself), `tsc`, lint,
`expo-doctor`, Metro bundle for Android, native debug build, and `e2e/full-flow.e2e.js`.
Run the end-to-end flow as described at the top of that file.

## Known limits

- Detection is uncalibrated and has seen no real falls. Falls can be missed and false alarms will happen.
- One reading per second can miss the impact itself (see the firmware note).
- Not a certified medical device; it never contacts emergency services by itself.
- Cleartext HTTP is allowed in the Android manifest because the watch serves plain HTTP. The app refuses
  non-HTTPS cloud URLs and accepts only private addresses for the watch.
- iOS: foreground-only polling. Not built or tested.
