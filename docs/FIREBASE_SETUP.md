# Firebase setup

SafeFall AI uses Firebase Authentication (email/password), Cloud Firestore and Cloud Functions
(for caregiver push notifications through Firebase Cloud Messaging). There is no mock backend.
Without configuration the app shows a "Setup required" screen.

## 1. Create the project

1. Go to <https://console.firebase.google.com> and click **Add project**.
2. Open **Build → Authentication → Sign-in method** and enable **Email/Password**.
3. Open **Build → Firestore Database**, click **Create database**, and choose **production mode**
   and a region near your users.
4. Upgrade to the **Blaze** plan. Cloud Functions require it; with prototype traffic the cost
   should stay within the free tier.

## 2. Register the apps

* **Web app** (*Project settings → Your apps → Web*): copy the config values into `.env`
  (see `.env.example`). The JS SDK uses these values. They identify the project but are not
  secrets; access is enforced by the security rules.
* **Android app**, package `com.safefall.ai`: download `google-services.json` to the repository
  root. It's git-ignored, and `app.config.js` picks it up automatically. Native FCM push tokens
  need it.
* **iOS app** (optional), bundle id `com.safefall.ai`: download `GoogleService-Info.plist` to the
  root and upload an APNs key under *Project settings → Cloud Messaging*.

## 3. Deploy rules, indexes and functions (Windows PowerShell)

```powershell
npm install -g firebase-tools
firebase login
copy .firebaserc.example .firebaserc      # then edit: set your project id
firebase deploy --only firestore:rules,firestore:indexes
cd functions; npm install; npm run build; cd ..
firebase deploy --only functions
```

## Data model

| Path | Written by | Readable by |
|---|---|---|
| `users/{uid}` | owner (role fixed at creation, `admin` impossible) | owner, linked caregivers |
| `users/{uid}/contacts/{id}` | owner, linked caregivers (validated E.164 phone) | owner, linked caregivers |
| `users/{uid}/devices/{deviceId}` | owner's phone (watch status) | owner, linked caregivers |
| `users/{uid}/private/push` | owner (FCM tokens) | owner only (+ Cloud Function) |
| `linkCodes/{CODE}` | elderly user; ≤30 min validity; single use | get-by-code only (never listed) |
| `relations/{caregiverUid}_{elderlyUid}` | caregiver, **only with a valid code** | both parties; either can delete |
| `alerts/{incidentId}` | elderly user creates; caregivers may only acknowledge/resolve | elderly user, linked caregivers |
| `alerts/*.dispatch` | Cloud Function only | as above |

The alert `state` must follow the app's state machine
(`possible_fall → countdown → escalated → acknowledged → resolved`, with `cancelled` from the
first two states). Rules reject backwards transitions, forged `dispatch` results and deletions.

**Linking flow (consent):** the elderly user taps *Create code* (8 characters from an
unambiguous alphabet, valid 15 minutes) and gives it to the caregiver. The caregiver enters it.
In one batch, the app creates the relation and deletes the code. The rules check that the code
exists, matches the elderly user and name, and hasn't expired.

## Testing the rules

The rules tests (`firestore-tests/`) run against the local emulator. They need Java 11+.

```powershell
cd firestore-tests
npm install
npm test
```

## Local emulator for the app (optional)

```powershell
firebase emulators:start --only auth,firestore --project demo-safefall
```

Then set `EXPO_PUBLIC_FIREBASE_USE_EMULATOR=true` and `EXPO_PUBLIC_FIREBASE_EMULATOR_HOST`.
Use `10.0.2.2` for the Android emulator, or your PC's LAN IP for a physical phone. The
Firebase config values still need to be non-placeholder strings; for a `demo-` project any
non-empty value works.

## Push notifications

* Every signed-in phone registers its native FCM token in `users/{uid}/private/push`, once
  notification permission is granted. Sign-out removes it.
* When an alert becomes `escalated`, `dispatchEscalatedAlert` sends a high-priority push to all
  linked caregivers' tokens on Android channel `emergency-alerts`. It records
  `pushRecipients / pushAccepted / pushFailed / error` on the alert and prunes invalid tokens.
* "Accepted" means FCM accepted the message. It does **not** prove delivery. The app's wording
  says this, and delivery is only certain once a caregiver acknowledges.
* There is no SMS gateway. The alert screen opens the phone's own SMS app and dialer. To add
  server-side SMS (e.g. Twilio), add it to the Cloud Function and keep the API key in
  `firebase functions:secrets:set`. **Never** put it in an `EXPO_PUBLIC_` variable.

## Offline behaviour

* Incidents are stored on the phone (AsyncStorage) with a version counter. The sync service
  uploads them with idempotent `setDoc(merge)` calls on a stable id, retries with backoff
  (2 s up to 60 s), and retries again when the network or the app returns.
* The Firestore JS SDK on React Native only has an in-memory cache, so the app doesn't rely on
  it for durability.
* Emergency contacts are cached on the phone, so call/SMS buttons work offline.
