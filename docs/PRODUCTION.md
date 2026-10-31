# Production setup

State of the Supabase project `<ref>` when this was written: reachable, **empty** (no SafeFall tables).
The app's anon key was checked: it is the public `anon` role for this project and expires in 2036.

Run `npm run check:prod` at any point. It lists what still blocks a production build.

## What is yours to do

| | Where to get it | Goes in |
|---|---|---|
| Database connection string | Supabase > Project Settings > Database > Connection string > **Session pooler** | `backend/.env` `DATABASE_URL` |
| JWT secret | Supabase > Project Settings > API > JWT Secret (legacy) | `backend/.env` `JWT_SECRET` |
| FCM service account | Firebase > Project settings > Service accounts > Generate key | `backend/.env` `FIREBASE_SERVICE_ACCOUNT_JSON` (one line) |
| `google-services.json` | Firebase > Project settings > Your apps > add Android app `com.safefall.ai` | project root (git-ignored), or EAS file secret `GOOGLE_SERVICES_JSON` |
| A host for the API | Any host that runs a container or Node 22 and terminates HTTPS | then `EXPO_PUBLIC_API_URL` in `.env` |

`backend/.env` was created with a generated `ACCESS_CODE_PEPPER`. **Back it up.** Changing or losing it
invalidates every access code ever issued.

## 1. Database

```
cd backend
npm run migrate        # 0001 schema, 0002 row-level security, 0003 grant lockdown. Additive, idempotent.
```

Use the **Session pooler** string: the direct `db.<ref>.supabase.co` host is IPv6-only on many plans.
Supabase's certificate needs its CA: download `prod-ca-2021.crt` (Project Settings > Database > SSL), set
`NODE_EXTRA_CA_CERTS=/path/to/prod-ca-2021.crt`, and use `?sslmode=verify-full` on the URL.

Migration 0003 revokes the privileges Supabase grants by default to `anon` and `authenticated`, so those
roles can only read the six data tables through their RLS policies. All writes go through the API.

Optional retention (90 days of raw readings; incidents are never purged):

```sql
select cron.schedule('safefall-purge', '0 3 * * *', $$select safefall_purge_sensor_readings(90)$$);
```

## 2. Accounts

```
npm run admin -- create-user "Asha Rao"
npm run admin -- create-caretaker "Ravi Rao"
npm run admin -- link <userId> <caretakerId> son
npm run admin -- issue-code user <userId>             # shown once; give it to the person
npm run admin -- issue-code caretaker <caretakerId>
npm run admin -- revoke-code <credentialId>           # takes effect on their next request
```

To let someone use the Calibration screens: `update users set calibration_access = true where id = '...'`.

## 3. Deploy the API

Container: `backend/Dockerfile` (**not built or run on this machine**; Docker was unavailable). Without
Docker: Node 22, `npm ci && npm run build`, start with `node dist/server.js`.

- Set the `backend/.env` values as the platform's **secrets**, never in the image.
- Keep `REQUIRE_HTTPS=true` and `TRUST_PROXY_HOPS=1` (one load balancer in front).
- Health check: `GET /health` (works over plain HTTP, never touches the DB). Monitor `GET /ready` (DB reachable).
- Release command: `npx tsx scripts/migrate.ts`.
- **Run one instance.** Login rate limiting is in memory per process; more instances multiply the limit.

Verified locally with the compiled server: `/health` 200 and `/ready` 503 when the DB is down; plain HTTP
to the API gets 426; a database outage returns a generic 500 and the process stays up; startup fails if a
secret is missing; logs contain no credentials.

## 4. Build the app

1. Set `EXPO_PUBLIC_API_URL=https://...` in `.env` (and `EXPO_PUBLIC_ENABLE_DEMO_MODE` empty or `false`).
2. `npm run check:prod` must print "all checks passed". It blocks: empty or non-HTTPS API URL, dev tools,
   demo mode, emulator, a service-role key in a public variable, and a missing `google-services.json`.
3. Build with EAS (own signing credentials, Play Store bundle):
   `eas build -p android --profile production`. Provide the `EXPO_PUBLIC_*` values as EAS environment
   variables and `google-services.json` as the `GOOGLE_SERVICES_JSON` file secret, because `.env` is
   git-ignored and not uploaded. The check runs automatically on that profile and fails the build if unsafe.

A local `gradlew assembleRelease` APK is signed with the **debug** keystore. That is fine for installing
on your own phones. **Do not upload it to the Play Store.**

## 5. Check it on real phones before relying on it

1. User phone: sign in with a user code, join the watch Wi-Fi, Start monitoring, confirm live readings.
2. Caretaker phone (on mobile data, not the watch Wi-Fi): sign in with a caretaker code. It should show the user's status.
3. Press **SOS** on the user phone. The caretaker phone must get a push, and the incident must show
   "Sent, delivery not confirmed" until their phone confirms it. This is the real end-to-end push test.
4. Turn the user phone's mobile data off during an SOS: it must say it is saved, then upload on reconnect.
5. Collect labelled recordings before trusting fall detection (see `docs/WIFI_UPGRADE.md`).

## Not verified

Real watch, Android Wi-Fi routing and the background service, FCM delivery, Supabase Realtime, the
Dockerfile, and a deployed API. Detection is uncalibrated. See the table in `docs/WIFI_UPGRADE.md`.
