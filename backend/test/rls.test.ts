// Runs the real policies on real Postgres. Queries execute as the `authenticated` database role
// with JWT claims set the way Supabase sets them for Realtime and PostgREST.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { api, incident, login, startWorld, World } from './helpers';

describe('row-level security', () => {
  let w: World;

  async function as(role: 'user' | 'caretaker' | null, sub: string | null, sql: string) {
    const claims = role ? JSON.stringify({ sub, app_role: role, role: 'authenticated' }) : '';
    return w.pg.transaction(async (t) => {
      await t.query(`select set_config('request.jwt.claims', $1, true)`, [claims]);
      await t.query('set local role authenticated');
      return (await t.query<any>(sql)).rows;
    });
  }

  before(async () => {
    w = await startWorld();
    const asha = (await login(w, w.asha.code, 'user')).accessToken;
    const ben = (await login(w, w.ben.code, 'user')).accessToken;
    const reading = { epoch: 1793363492, x: 1, y: 2, z: 3 };
    for (const token of [asha, ben]) {
      await api(w.url, '/v1/sync/readings', { token, body: { readings: [reading] } });
      await api(w.url, '/v1/sync/status', { token, body: { watchConnectionStatus: 'connected', safetyState: 'NORMAL', lastSync: null, latest: reading } });
      await api(w.url, '/v1/incidents', { token, body: incident() });
    }
  });
  after(async () => { await w.close(); });

  for (const table of ['sensor_readings', 'fall_events', 'device_status']) {
    it(`${table}: a user sees only their own rows`, async () => {
      const rows = await as('user', w.asha.id, `select user_id from ${table}`);
      assert.ok(rows.length > 0);
      assert.ok(rows.every((r) => r.user_id === w.asha.id));
    });
    it(`${table}: a caretaker sees linked users only`, async () => {
      const rows = await as('caretaker', w.ravi.id, `select user_id from ${table}`);
      assert.ok(rows.length > 0);
      assert.ok(rows.every((r) => r.user_id === w.asha.id));
    });
    it(`${table}: an unlinked caretaker sees nothing`, async () => {
      assert.deepEqual(await as('caretaker', w.stranger.id, `select user_id from ${table}`), []);
    });
    it(`${table}: no JWT sees nothing`, async () => {
      assert.deepEqual(await as(null, null, `select user_id from ${table}`), []);
    });
  }

  it('a mismatched role claim does not reach another user', async () => {
    // Ravi's id presented as a "user" matches no user row.
    assert.deepEqual(await as('user', w.ravi.id, 'select user_id from fall_events'), []);
  });

  it('secret tables are unreadable with any app token', async () => {
    for (const table of ['access_credentials', 'refresh_tokens', 'push_tokens']) {
      await assert.rejects(as('caretaker', w.ravi.id, `select * from ${table}`), /permission denied/);
    }
  });

  it('app tokens cannot write directly', async () => {
    await assert.rejects(as('user', w.asha.id, `update fall_events set detection_status = 'NORMAL'`), /permission denied/);
    await assert.rejects(as('user', w.asha.id, `delete from sensor_readings`), /permission denied/);
    await assert.rejects(as('caretaker', w.ravi.id, `insert into user_caretaker_links (user_id, caretaker_id) values ('${w.ben.id}', '${w.ravi.id}')`), /permission denied/);
  });

  it('on a Supabase-style database, anon and authenticated lose their default privileges', async () => {
    // Recreate what Supabase does: an anon role and broad default grants on every public table.
    await w.pg.exec(`
      do $$ begin if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if; end $$;
      grant usage on schema public to anon, authenticated;
      grant all on all tables in schema public to anon, authenticated;
      grant execute on function safefall_purge_sensor_readings(integer) to public, anon, authenticated;
    `);
    const dir = join(__dirname, '..', 'migrations');
    for (const f of readdirSync(dir).sort()) await w.pg.exec(readFileSync(join(dir, f), 'utf8'));

    const asRole = (role: string, sql: string) =>
      w.pg.transaction(async (t) => {
        await t.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: w.asha.id, app_role: 'user', role })]);
        await t.query(`set local role ${role}`);
        return (await t.query<any>(sql)).rows;
      });

    await assert.rejects(asRole('anon', 'select * from users'), /permission denied/);
    await assert.rejects(asRole('anon', 'select * from fall_events'), /permission denied/);
    await assert.rejects(asRole('authenticated', `update fall_events set detection_status = 'NORMAL'`), /permission denied/);
    await assert.rejects(asRole('authenticated', 'delete from sensor_readings'), /permission denied/);
    await assert.rejects(asRole('authenticated', 'select safefall_purge_sensor_readings(1)'), /permission denied/);
    await assert.rejects(asRole('authenticated', 'select * from access_credentials'), /permission denied/);
    // Reading their own data through RLS still works.
    const own = await asRole('authenticated', 'select user_id from fall_events');
    assert.ok(own.length > 0 && own.every((r) => r.user_id === w.asha.id));
  });

  it('re-running the migrations changes nothing', async () => {
    const count = async () => (await w.db.query<{ c: number }>('select count(*)::int as c from fall_events')).rows[0].c;
    const before = await count();
    const dir = join(__dirname, '..', 'migrations');
    for (const f of readdirSync(dir).sort()) await w.pg.exec(readFileSync(join(dir, f), 'utf8'));
    assert.equal(await count(), before);
  });

  it('the retention job removes old readings and never touches fall events', async () => {
    const count = async () => (await w.db.query<{ c: number }>('select count(*)::int as c from fall_events')).rows[0].c;
    const events = await count();
    await w.db.query(`insert into sensor_readings (user_id, "timestamp", watch_epoch, x, y, z) values ($1, now() - interval '200 days', 1, 0, 0, 0)`, [w.asha.id]);
    const removed = (await w.db.query<{ r: number }>('select safefall_purge_sensor_readings(90)::int as r')).rows[0].r;
    assert.equal(removed >= 1, true);
    assert.equal(await count(), events);
    await assert.rejects(w.db.query('select safefall_purge_sensor_readings(0)'), /at least 1/);
  });
});
