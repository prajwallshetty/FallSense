// Small database interface. Production uses node-postgres; the tests run the same SQL on PGlite,
// which is real Postgres, so row-level security and constraints are exercised for real.

import { Pool, PoolClient } from 'pg';

export interface QueryResult<T> {
  rows: T[];
  rowCount: number;
}

export interface Db {
  query<T = Record<string, any>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
  tx<T>(fn: (db: Db) => Promise<T>): Promise<T>;
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
  const pool = new Pool({ connectionString, max: 10 });
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
