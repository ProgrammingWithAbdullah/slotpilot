import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createPool } from './pool.js';
import { runMigrations } from './migrator.js';
import { dbDir } from './paths.js';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}
if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to reset a production database');
  process.exit(1);
}
const pool = createPool({ connectionString: url, max: 1 });
try {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await runMigrations(pool, join(dbDir(), 'migrations'));
  await pool.query(readFileSync(join(dbDir(), 'seed.sql'), 'utf8'));
  console.log('database reset, migrated and seeded');
} finally {
  await pool.end();
}
