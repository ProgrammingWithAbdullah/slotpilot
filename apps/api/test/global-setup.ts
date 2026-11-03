import { resolve } from 'node:path';
import { createPool } from '../src/db/pool.js';
import { runMigrations } from '../src/db/migrator.js';

/** Fresh schema once per test run, built from the real migration files. */
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL ?? 'postgres://slotpilot:slotpilot@localhost:5432/slotpilot_test';
  const pool = createPool({ connectionString: url, max: 1 });
  try {
    await pool.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
    await runMigrations(pool, resolve(import.meta.dirname, '../../../db/migrations'), () => undefined);
  } finally {
    await pool.end();
  }
}
