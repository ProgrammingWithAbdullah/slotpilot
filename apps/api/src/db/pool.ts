import pg from 'pg';

export type Queryable = Pick<pg.Pool | pg.PoolClient, 'query'>;

// Return bigint columns (chat_messages.id) as JS numbers; our ids stay far below 2^53.
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number(v));
// Keep DATE columns as plain 'YYYY-MM-DD' strings instead of shifting them through local time.
pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v);

export function createPool(opts: { connectionString: string; max: number; ssl?: boolean }): pg.Pool {
  const needsSsl = opts.ssl ?? /sslmode=require/.test(opts.connectionString);
  return new pg.Pool({
    connectionString: opts.connectionString,
    max: opts.max,
    ssl: needsSsl ? { rejectUnauthorized: true } : undefined,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    // Protects the pool from runaway queries.
    statement_timeout: 5_000,
  });
}

/** Runs fn inside a transaction; commits on success, rolls back on any error. */
export async function withTransaction<T>(
  pool: pg.Pool,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
