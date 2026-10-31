import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { poolOptions } from '../src/db';

const ca = '-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----\n';

describe('database connection security', () => {
  it('requires verified TLS for any remote database', () => {
    const o = poolOptions('postgresql://u:p@aws-0-eu.pooler.supabase.com:5432/postgres', { DATABASE_CA: ca });
    assert.equal((o.ssl as { rejectUnauthorized: boolean }).rejectUnauthorized, true);
    assert.equal((o.ssl as { ca: string }).ca, ca);
  });

  it('never allows a sslmode in the URL to weaken that', () => {
    for (const mode of ['disable', 'allow', 'prefer', 'require', 'no-verify']) {
      const o = poolOptions(`postgresql://u:p@db.example.com:5432/postgres?sslmode=${mode}`, { DATABASE_CA: ca });
      assert.equal((o.ssl as { rejectUnauthorized: boolean }).rejectUnauthorized, true, mode);
      assert.ok(!String(o.connectionString).includes('sslmode'), mode);
    }
  });

  it('allows a plain connection only to this machine', () => {
    for (const host of ['localhost', '127.0.0.1']) assert.equal(poolOptions(`postgresql://u:p@${host}:5432/d`).ssl, undefined, host);
    assert.ok(poolOptions('postgresql://u:p@10.0.0.5:5432/d').ssl, 'a private network address is still remote');
  });

  it('accepts a CA with escaped newlines, as platform secrets often store it', () => {
    const o = poolOptions('postgresql://u:p@h.example.com/d', { DATABASE_CA: ca.replace(/\n/g, '\n') });
    assert.equal((o.ssl as { ca: string }).ca, ca);
  });

  it('ships a bundled CA so Supabase works with no setup', () => {
    const o = poolOptions('postgresql://u:p@h.supabase.com/d', {});
    assert.match(String((o.ssl as { ca?: string }).ca), /BEGIN CERTIFICATE/);
  });
});
