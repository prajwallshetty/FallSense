# SafeFall backend

API for access-code sign-in, sensor sync, incidents and caretaker push. See
[../docs/WIFI_UPGRADE.md](../docs/WIFI_UPGRADE.md) for setup, and `.env.example` for configuration.

    npm test          # 59 tests on a real Postgres engine (PGlite), including row-level security
    npm run typecheck
    npm run migrate   # additive and idempotent; applies migrations/*.sql once each

`scripts/e2e-server.ts` is a test harness (in-memory database, recording push sender). Never deploy it.
