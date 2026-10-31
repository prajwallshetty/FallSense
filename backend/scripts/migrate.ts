// Applies migrations/*.sql in order, once each. Never edits or removes applied migrations.
import '../src/loadEnv';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Pool } from 'pg';
import { poolOptions } from '../src/db';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL must be set');
  const pool = new Pool(poolOptions(url));
  const dir = join(__dirname, '..', 'migrations');
  await pool.query('create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())');
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    const done = await pool.query('select 1 from schema_migrations where name = $1', [file]);
    if (done.rowCount) continue;
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query(readFileSync(join(dir, file), 'utf8'));
      await client.query('insert into schema_migrations (name) values ($1)', [file]);
      await client.query('commit');
      console.log(`applied ${file}`);
    } catch (e) {
      await client.query('rollback');
      throw e;
    } finally {
      client.release();
    }
  }
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
