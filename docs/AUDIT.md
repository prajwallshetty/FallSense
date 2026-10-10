# SafeFall AI: Repository Audit (pre-hardening)

Audited commit: `7a0d117` (branch `claude/kind-meitner-2ebrqc`). Severity scale: **Critical**
(safety, security or app cannot build/run), **High** (core feature broken or fabricated),
**Medium** (reliability/UX), **Low** (cleanup).

## Summary

The app was a UI prototype. The Firebase layer, BLE layer, location fallback, health data
and admin metrics were all **in-memory mocks or hard-coded values** shown to the user as if
they were real. The repository contains **no firmware** and no BLE protocol definition beyond
two UUID constants that nothing used. `npm ci` failed on a clean checkout.

## Findings

| # | Severity | File(s) | Finding |
|---|----------|---------|---------|
| 1 | Critical | `package.json` | `npm ci` fails: `lucide-react-native@0.379` peer-requires React ≤18 while Expo SDK 54 ships React 19.1. |
| 2 | Critical | `package.json` | `expo-linear-gradient@^56` is the SDK 56 line; SDK 54 expects `~15.0.8` (native module mismatch in dev/release builds). |
| 3 | Critical | `src/services/firebase.ts` | No Firebase SDK installed or initialised. `login()` ignores the password and returns a hard-coded profile (any email containing "caregiver" logs in as the caregiver). All data is in-memory and lost on restart. |
| 4 | Critical | `src/app/(auth)/login.tsx` | "Developer Testing Sandbox" one-tap login present in all builds, bypassing authentication. |
| 5 | Critical | `src/services/locationService.ts`, `src/services/bleService.ts` | When GPS is unavailable or denied, the app returns fabricated San Francisco coordinates and street address. Fall alerts always carried the fabricated location. |
| 6 | Critical | `src/app/alert.tsx` | "Dispatched! Caregivers and responders have been successfully alerted." shown although nothing is sent. Escalation only changes a local status string. |
| 7 | Critical | `src/store/alertStore.ts` | Active alert lives only in memory; killing the app silently loses an in-progress incident. No dedupe, so repeated triggers replace the current alert. |
| 8 | Critical | (missing) | No Firestore Security Rules. Authorisation existed only in UI code. Caregiver linking by email let any caregiver attach to any elderly account with no consent. |
| 9 | High | `src/services/bleService.ts` | No real BLE: non-simulator path logs "Defaulting to simulator mode". `connect()` always succeeds after a delay. |
| 10 | High | `src/store/deviceStore.ts` | `isSimulatorMode` defaults to `true` in all builds; simulated watch indistinguishable from a real one in the UI. Restores "connected" state from storage on launch without any connection. |
| 11 | High | `README.md`, `LiveStatusCard.tsx` | Docs and UI reference an MPU6050; the intended hardware is the Waveshare ESP32-S3-Touch-LCD-1.28 (QMI8658 IMU). README also claims Expo SDK 51, NativeWind and React Query, none of which are used. |
| 12 | High | `src/services/notificationService.ts` | Push token is `fcm_token_<random>`; permissions always "granted"; "siren" is console logging. |
| 13 | High | `src/app/(onboarding)/permissions.tsx` | Bluetooth "Enable" button just flips local state; no Android 12+ runtime permission request. |
| 14 | High | `(tabs)/index.tsx`, `health.tsx`, `location.tsx`, `admin/index.tsx` | Fabricated data presented as real: steps 3450, "24 min", "180 kcal", "Vitals: Normal", weekly step charts, fall hotspots, "Signal Locked", admin KPIs (1250 users, 99.98% uptime), fake "export saved" and "DB optimized" confirmations. |
| 15 | High | `(tabs)/index.tsx` | The SOS button called `simulateFallEvent()`, which silently did nothing unless a (simulated) watch was connected. |
| 16 | High | `src/app/_layout.tsx`, `src/app/index.tsx` | Auth guard checks `pathname.startsWith('/(auth)')` (group names never appear in pathnames) and `index` always redirects to login, so authenticated users were bounced and every login re-ran onboarding. |
| 17 | Medium | `src/store/authStore.ts` | Full profile JSON persisted in SecureStore as the "session"; no token, no expiry, no server validation. |
| 18 | Medium | `contact-setup.tsx`, `contacts/index.tsx` | No phone validation, no editing, no reordering; "Use Demo Contact" skips setup without creating anything. |
| 19 | Medium | `app.json` | Requests `ACCESS_BACKGROUND_LOCATION`, `BLUETOOTH_ADVERTISE`, `RECEIVE_BOOT_COMPLETED` and iOS background location without any feature using them (Play Store rejection risk). No BLE config plugin, so a native build would lack BLE setup. |
| 20 | Medium | `.env.example` | Contained realistic-looking project IDs and an `EXPO_PUBLIC_SMS_API_KEY`; any `EXPO_PUBLIC_` key ships inside the APK, so an SMS gateway key there would be public. |
| 21 | Medium | many screens | Hard-coded `paddingTop: 56` instead of safe-area insets; 9-11 px text; touch targets below 44 dp; back buttons use `router.replace` (breaks Android back stack). |
| 22 | Medium | `SkeletalLoader.tsx` | `new Animated.Value` created on every render. |
| 23 | Low | `bleService.ts`, `firebase.ts` | Unused variables, `as any` route casts, duplicated colour literals in every file. |
| 24 | Low | (missing) | No tests, no lint config, no EAS config. |

## What was kept

Expo Router file structure and route groups, Zustand stores, the component folder layout,
the SafeFall AI dark/teal identity, existing UI primitives (Button, Card, Input, StatusBadge,
BatteryRing), and the original service UUID base `4FA1xxxx-C4C2-4C2E-9D19-9B92A265E923`,
which became the base for the versioned protocol.

See `README.md` for how each finding was resolved.
