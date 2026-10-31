// TEST HARNESS ONLY: the real API on an in-memory Postgres, seeded with known accounts and a push
// sender that records messages instead of sending them. Never used in production.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import express from 'express';
import { createApp } from '../src/app';
import { createCaretaker, createUser, issueAccessCode, linkCaretaker } from '../src/provisioning';
import { PushMessage, PushSender } from '../src/push/sender';
import { pgliteDb } from '../test/helpers';

const SECRET = 'e2e-jwt-secret-e2e-jwt-secret-e2e-jwt-secret';
const PEPPER = 'e2e-pepper-e2e-pepper-e2e-pepper-e2e-pepper';

async function main() {
  const port = Number(process.env.PORT ?? 8787);
  const outFile = process.argv[2];
  const pg = new PGlite();
  const dir = join(__dirname, '..', 'migrations');
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.sql')).sort()) await pg.exec(readFileSync(join(dir, f), 'utf8'));
  const db = pgliteDb(pg);

  const pushes: PushMessage[] = [];
  const push: PushSender = {
    async sendAll(messages) {
      pushes.push(...messages);
      return messages.map((_, i) => ({ ok: true as const, providerMessageId: `e2e-${pushes.length}-${i}` }));
    },
  };

  const asha = await createUser(db, 'Asha Rao', true);
  const ben = await createUser(db, 'Ben Paul');
  const ravi = await createCaretaker(db, 'Ravi Rao');
  await linkCaretaker(db, asha, ravi, 'son');

  const app = createApp({
    db,
    push,
    config: {
      jwtSecret: SECRET,
      accessCodePepper: PEPPER,
      requireHttps: false,
      trustProxyHops: 0,
      corsOrigins: (process.env.CORS_ORIGINS ?? '').split(',').filter(Boolean),
      loginRateLimit: { windowMs: 60_000, max: 500 },
    },
  });

  // Test-only window into what the server stored, for assertions the UI cannot show. It sits on a
  // parent app so it is matched before the API's catch-all 404.
  const root = express();
  root.get('/__e2e/state', async (_req, res) => {
    const events = await db.query('select client_event_id, detection_status, final_user_response, incident_state, acknowledged_at, dispatched_at from fall_events order by created_at');
    const readings = await db.query<{ c: number }>('select count(*)::int as c from sensor_readings');
    const logs = await db.query('select delivery_status from notification_logs');
    res.json({ events: events.rows, readings: readings.rows[0].c, logs: logs.rows, pushes });
  });
  root.use(app);

  root.listen(port, '0.0.0.0', async () => {
    const codes = {
      asha: await issueAccessCode(db, PEPPER, 'user', asha),
      ben: await issueAccessCode(db, PEPPER, 'user', ben),
      ravi: await issueAccessCode(db, PEPPER, 'caretaker', ravi),
    };
    if (outFile) writeFileSync(outFile, JSON.stringify(codes));
    console.log(`e2e API on ${port}`);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
