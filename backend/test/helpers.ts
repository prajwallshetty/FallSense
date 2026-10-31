import { readdirSync, readFileSync } from 'node:fs';
import { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { createApp } from '../src/app';
import { Db } from '../src/db';
import { createCaretaker, createUser, issueAccessCode, linkCaretaker } from '../src/provisioning';
import { PushMessage, PushResult, PushSender } from '../src/push/sender';

export const SECRET = 'test-jwt-secret-that-is-long-enough-000';
export const PEPPER = 'test-pepper-that-is-long-enough-000000';

export function pgliteDb(pg: PGlite): Db {
  const wrap = (c: Pick<PGlite, 'query'>): Pick<Db, 'query'> => ({
    async query<T>(sql: string, params: unknown[] = []) {
      const r = await c.query<T>(sql, params as any[]);
      return { rows: r.rows, rowCount: r.affectedRows || r.rows.length };
    },
  });
  return {
    ...wrap(pg),
    tx: <T>(fn: (db: Db) => Promise<T>) =>
      pg.transaction(async (t) => {
        const scoped: Db = { ...wrap(t as unknown as Pick<PGlite, 'query'>), tx: (inner) => inner(scoped) };
        return fn(scoped);
      }) as Promise<T>,
  };
}

export async function freshDatabase() {
  const pg = new PGlite();
  const dir = join(__dirname, '..', 'migrations');
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.sql')).sort()) await pg.exec(readFileSync(join(dir, f), 'utf8'));
  return { pg, db: pgliteDb(pg) };
}

export class FakePush implements PushSender {
  sent: PushMessage[] = [];
  next: (m: PushMessage) => PushResult = () => ({ ok: true, providerMessageId: `msg-${this.sent.length}` });
  async sendAll(messages: PushMessage[]) {
    return messages.map((m) => {
      this.sent.push(m);
      return this.next(m);
    });
  }
}

export interface World {
  pg: PGlite;
  db: Db;
  url: string;
  push: FakePush;
  settle(): Promise<void>;
  close(): Promise<void>;
  asha: { id: string; code: string };
  ben: { id: string; code: string };
  ravi: { id: string; code: string };
  stranger: { id: string; code: string };
}

/** Two users and two caretakers. Ravi is linked to Asha only; the stranger to nobody. */
export async function startWorld(limit = { windowMs: 60_000, max: 1000 }): Promise<World> {
  const { pg, db } = await freshDatabase();
  const push = new FakePush();
  const work: Promise<unknown>[] = [];
  const app = createApp({
    db,
    push,
    background: (p) => work.push(p),
    config: { jwtSecret: SECRET, accessCodePepper: PEPPER, requireHttps: false, trustProxyHops: 0, corsOrigins: ['http://localhost:9999'], loginRateLimit: limit },
  });
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const ashaId = await createUser(db, 'Asha Rao');
  const benId = await createUser(db, 'Ben Paul');
  const raviId = await createCaretaker(db, 'Ravi Rao');
  const strangerId = await createCaretaker(db, 'Stranger');
  await linkCaretaker(db, ashaId, raviId, 'son');

  return {
    pg,
    db,
    url,
    push,
    settle: async () => {
      while (work.length) await work.shift();
    },
    close: async () => {
      server.closeAllConnections();
      await new Promise((r) => server.close(r));
      await pg.close();
    },
    asha: { id: ashaId, code: await issueAccessCode(db, PEPPER, 'user', ashaId) },
    ben: { id: benId, code: await issueAccessCode(db, PEPPER, 'user', benId) },
    ravi: { id: raviId, code: await issueAccessCode(db, PEPPER, 'caretaker', raviId) },
    stranger: { id: strangerId, code: await issueAccessCode(db, PEPPER, 'caretaker', strangerId) },
  };
}

export async function api(url: string, path: string, opts: { method?: string; token?: string; body?: unknown } = {}) {
  const res = await fetch(url + path, {
    method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
    headers: { 'content-type': 'application/json', ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}) },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

export const login = async (w: World, code: string, role: 'user' | 'caretaker') => {
  const r = await api(w.url, '/v1/auth/login', { body: { accessCode: code, role } });
  if (r.status !== 200) throw new Error(`login failed: ${JSON.stringify(r.body)}`);
  return r.body as { accessToken: string; refreshToken: string; subject: { id: string; name: string; role: string }; links: { id: string; name: string }[] };
};

export function incident(overrides: Record<string, unknown> = {}) {
  return {
    clientEventId: 'evt-1',
    clientVersion: 1,
    eventTimestamp: 1793363492000,
    eventType: 'fall',
    detectionStatus: 'FALL_VERIFICATION',
    detectionScore: 0.7,
    sensorQuality: 'good',
    movementClassification: 'unusual',
    incidentState: 'countdown',
    finalUserResponse: null,
    details: {},
    ...overrides,
  };
}
