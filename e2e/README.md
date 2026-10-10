# Web end-to-end flow

Runs the real app JavaScript in Chromium (Expo web) against the local Firebase Auth +
Firestore emulators, driving it with Playwright. It covers sign-up, onboarding, emergency
contacts, watch pairing **with the developer simulator**, link loss/reconnect, possible fall →
countdown → cancel, escalation, caregiver linking with a code, manual SOS, caregiver
acknowledgement, resolution and session persistence.

It does **not** test real Bluetooth: web has no BLE stack (exactly like Expo Go). Physical
watch tests are listed in docs/TEST_CHECKLIST.md.

## Run (PowerShell, three terminals)

```powershell
# 1. Firebase emulators (needs Java 11+)
cd firestore-tests; npm install; npx firebase emulators:start --only auth,firestore --project demo-safefall

# 2. Expo web with emulator config + simulator
Get-Content e2e\web.env.example | Where-Object { $_ -match '^[A-Z]' } | ForEach-Object { $k,$v = $_ -split '=',2; Set-Item "env:$k" $v }
npx expo start --web --port 8081

# 3. The flow
npx playwright-core install chromium   # first time only (or set CHROMIUM_PATH)
npm run test:e2e:web
```
Screenshots are written to `e2e/artifacts/`.
