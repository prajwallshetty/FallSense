// Small database interface. Production uses node-postgres; the tests run the same SQL on PGlite,
// which is real Postgres, so row-level security and constraints are exercised for real.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Pool, PoolClient, PoolConfig } from 'pg';

export interface QueryResult<T> {
  rows: T[];
  rowCount: number;
}

export interface Db {
  query<T = Record<string, any>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
  tx<T>(fn: (db: Db) => Promise<T>): Promise<T>;
}

const LOCAL_HOST = /^(localhost|127\.0\.0\.1|::1|\[::1\])$/;

/** Supabase's public CA, shipped with the app so verified TLS works without extra setup. */
const BUNDLED_CA = join(__dirname, '..', 'certs', 'supabase-prod-ca-2021.crt');

function readCa(env: NodeJS.ProcessEnv): string | undefined {
  if (env.DATABASE_CA) return env.DATABASE_CA.replace(/\\n/g, '\n');
  const file = env.DATABASE_CA_FILE || (existsSync(BUNDLED_CA) ? BUNDLED_CA : undefined);
  return file ? readFileSync(file, 'utf8') : undefined;
}

/**
 * Connection options. Any database that is not on this machine must use TLS with a verified
 * certificate: the password and every record cross the internet. A sslmode in the URL is dropped so
 * it cannot weaken that. Plain connections are accepted only for localhost.
 */
export function poolOptions(connectionString: string, env: NodeJS.ProcessEnv = process.env): PoolConfig {
  const url = new URL(connectionString);
  url.searchParams.delete('sslmode');
  url.searchParams.delete('sslrootcert');
  const options: PoolConfig = { connectionString: url.toString(), max: 10 };
  if (!LOCAL_HOST.test(url.hostname)) options.ssl = { rejectUnauthorized: true, ca: readCa(env) };
  return options;
}

function fromClient(client: Pool | PoolClient): Pick<Db, 'query'> {
  return {
    async query<T>(sql: string, params: unknown[] = []) {
      const r = await client.query(sql, params as any[]);
      return { rows: r.rows as T[], rowCount: r.rowCount ?? 0 };
    },
  };
}

export function createPgDb(connectionString: string): Db & { close(): Promise<void> } {
  const pool = new Pool(poolOptions(connectionString));
  return {
    ...fromClient(pool),
    async tx(fn) {
      const client = await pool.connect();
      const scoped: Db = { ...fromClient(client), tx: (inner) => inner(scoped) };
      try {
        await client.query('begin');
        const result = await fn(scoped);
        await client.query('commit');
        return result;
      } catch (e) {
        await client.query('rollback');
        throw e;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}
