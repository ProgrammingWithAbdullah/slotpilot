import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createPool } from './pool.js';
import { dbDir } from './paths.js';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}
const pool = createPool({ connectionString: url, max: 1 });
try {
  await pool.query(readFileSync(join(dbDir(), 'seed.sql'), 'utf8'));
  console.log('seed data loaded (demo@slotpilot.dev / Password123!)');
} catch (err) {
  console.error((err as Error).message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
