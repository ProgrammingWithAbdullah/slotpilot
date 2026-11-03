import { join } from 'node:path';
import { createPool, directUrl } from './pool.js';
import { runMigrations } from './migrator.js';
import { dbDir } from './paths.js';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}
const pool = createPool({ connectionString: directUrl(url), max: 1 });
try {
  await runMigrations(pool, join(dbDir(), 'migrations'));
  console.log('migrations up to date');
} catch (err) {
  console.error((err as Error).message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
