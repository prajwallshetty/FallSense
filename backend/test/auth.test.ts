import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import jwt from 'jsonwebtoken';
import { accessCodeLookup, generateAccessCode, normalizeAccessCode } from '../src/accessCodes';
import { createApp } from '../src/app';
import { api, FakePush, freshDatabase, login, PEPPER, SECRET, startWorld, World } from './helpers';

describe('access-code authentication', () => {
  let w: World;
  before(async () => { w = await startWorld(); });
  after(async () => { await w.close(); });

  it('logs a user in and returns their linked caretakers', async () => {
    const s = await login(w, w.asha.code, 'user');
    assert.equal(s.subject.id, w.asha.id);
    assert.equal(s.subject.role, 'user');
    assert.deepEqual(s.links.map((l) => l.name), ['Ravi Rao']);
  });

  it('logs a caretaker in and returns their linked users', async () => {
    const s = await login(w, w.ravi.code, 'caretaker');
    assert.equal(s.subject.role, 'caretaker');
    assert.deepEqual(s.links.map((l) => l.name), ['Asha Rao']);
  });

  it('accepts lower case and missing dashes', async () => {
    const s = await login(w, w.asha.code.toLowerCase().replace(/-/g, ' '), 'user');
    assert.equal(s.subject.id, w.asha.id);
  });

  it('gives the same error for an unknown code and the wrong role', async () => {
    const unknown = await api(w.url, '/v1/auth/login', { body: { accessCode: 'AAAA-BBBB-CCCC', role: 'user' } });
    const wrongRole = await api(w.url, '/v1/auth/login', { body: { accessCode: w.asha.code, role: 'caretaker' } });
    assert.equal(unknown.status, 401);
    assert.deepEqual(unknown, wrongRole);
  });

  it('rejects revoked and expired codes', async () => {
    await w.db.query(`update access_credentials set revoked_at = now() where user_id = $1`, [w.ben.id]);
    assert.equal((await api(w.url, '/v1/auth/login', { body: { accessCode: w.ben.code, role: 'user' } })).status, 401);
    await w.db.query(`update access_credentials set revoked_at = null, expires_at = now() - interval '1 minute' where user_id = $1`, [w.ben.id]);
    assert.equal((await api(w.url, '/v1/auth/login', { body: { accessCode: w.ben.code, role: 'user' } })).status, 401);
    await w.db.query(`update access_credentials set expires_at = null where user_id = $1`, [w.ben.id]);
  });

  it('stores no plain access code anywhere', async () => {
    const { rows } = await w.db.query<{ code_lookup: string }>('select code_lookup from access_credentials');
    const dump = JSON.stringify(rows);
    for (const c of [w.asha.code, w.ravi.code]) {
      assert.ok(!dump.includes(c));
      assert.ok(!dump.includes(normalizeAccessCode(c)));
    }
    assert.ok(dump.includes(accessCodeLookup(w.asha.code, PEPPER)));
  });

  it('rejects missing, malformed, wrongly signed, expired and unsigned tokens', async () => {
    assert.equal((await api(w.url, '/v1/me')).status, 401);
    assert.equal((await api(w.url, '/v1/me', { token: 'garbage' })).status, 401);
    const claims = { role: 'authenticated', app_role: 'user', cid: 'x' };
    const forged = jwt.sign(claims, 'a-different-secret-a-different-secret', { subject: w.asha.id, audience: 'authenticated' });
    assert.equal((await api(w.url, '/v1/me', { token: forged })).status, 401);
    const expired = jwt.sign(claims, SECRET, { subject: w.asha.id, audience: 'authenticated', expiresIn: -10 });
    assert.equal((await api(w.url, '/v1/me', { token: expired })).status, 401);
    const none = jwt.sign(claims, '', { algorithm: 'none', subject: w.asha.id, audience: 'authenticated' });
    assert.equal((await api(w.url, '/v1/me', { token: none })).status, 401);
  });

  it('stops honouring an access token as soon as the code is revoked', async () => {
    const s = await login(w, w.ben.code, 'user');
    assert.equal((await api(w.url, '/v1/me', { token: s.accessToken })).status, 200);
    await w.db.query(`update access_credentials set revoked_at = now() where user_id = $1`, [w.ben.id]);
    assert.equal((await api(w.url, '/v1/me', { token: s.accessToken })).status, 401);
    const upload = await api(w.url, '/v1/sync/readings', { token: s.accessToken, body: { readings: [{ epoch: 1793363492, x: 0, y: 0, z: 1 }] } });
    assert.equal(upload.status, 401, 'write routes must check revocation too');
    await w.db.query(`update access_credentials set revoked_at = null where user_id = $1`, [w.ben.id]);
  });

  it('rotates refresh tokens and revokes the family when a spent one is replayed', async () => {
    const s = await login(w, w.asha.code, 'user');
    const r1 = await api(w.url, '/v1/auth/refresh', { body: { refreshToken: s.refreshToken } });
    assert.equal(r1.status, 200);
    assert.notEqual(r1.body.refreshToken, s.refreshToken);
    const replay = await api(w.url, '/v1/auth/refresh', { body: { refreshToken: s.refreshToken } });
    assert.equal(replay.status, 401);
    const stolen = await api(w.url, '/v1/auth/refresh', { body: { refreshToken: r1.body.refreshToken } });
    assert.equal(stolen.status, 401, 'replay must also kill the newest token in the family');
  });

  it('logout revokes the refresh token', async () => {
    const s = await login(w, w.asha.code, 'user');
    assert.equal((await api(w.url, '/v1/auth/logout', { body: { refreshToken: s.refreshToken } })).status, 204);
    assert.equal((await api(w.url, '/v1/auth/refresh', { body: { refreshToken: s.refreshToken } })).status, 401);
  });

  it('never returns the access code hash to clients', async () => {
    const s = await login(w, w.asha.code, 'user');
    assert.ok(!JSON.stringify(s).includes('code_lookup'));
  });

  it('answers bad JSON with 400, not a crash', async () => {
    const res = await fetch(`${w.url}/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{nope' });
    assert.equal(res.status, 400);
  });
});

describe('login rate limiting', () => {
  it('blocks repeated failures, which keeps code guessing impractical', async () => {
    const w = await startWorld({ windowMs: 60_000, max: 3 });
    try {
      const attempt = () => api(w.url, '/v1/auth/login', { body: { accessCode: 'AAAA-BBBB-CCCC', role: 'user' } });
      for (let i = 0; i < 3; i++) assert.equal((await attempt()).status, 401);
      const blocked = await attempt();
      assert.equal(blocked.status, 429);
      assert.equal(blocked.body.error.code, 'rate_limited');
    } finally {
      await w.close();
    }
  });
});

describe('code generation', () => {
  it('produces distinct, well-formed codes', () => {
    const codes = new Set(Array.from({ length: 2000 }, generateAccessCode));
    assert.equal(codes.size, 2000);
    for (const c of codes) assert.match(c, /^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
  });
  it('treats O/0 and I/L/1 as the same character', () => {
    assert.equal(normalizeAccessCode('oil-1 0'), '01110');
  });
});

describe('HTTPS enforcement', () => {
  it('refuses plain HTTP when required', async () => {
    const { pg, db } = await freshDatabase();
    const app = createApp({ db, push: new FakePush(), config: { jwtSecret: SECRET, accessCodePepper: PEPPER, requireHttps: true, trustProxyHops: 1, corsOrigins: [], loginRateLimit: { windowMs: 1000, max: 5 } } });
    const server = app.listen(0);
    await new Promise((r) => server.once('listening', r));
    const port = (server.address() as { port: number }).port;
    assert.equal((await fetch(`http://127.0.0.1:${port}/v1/me`)).status, 426);
    assert.equal((await fetch(`http://127.0.0.1:${port}/v1/me`, { headers: { 'x-forwarded-proto': 'https' } })).status, 401, 'over HTTPS it reaches the auth check');
    assert.equal((await fetch(`http://127.0.0.1:${port}/health`)).status, 200, 'health probes work over plain HTTP');
    assert.equal((await fetch(`http://127.0.0.1:${port}/ready`)).status, 200);
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    await pg.close();
  });
});
