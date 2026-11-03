import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createPool, directUrl } from './pool.js';
import { dbDir } from './paths.js';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

// --if-empty is used on deploy: it seeds a brand-new database once and never wipes data later.
const onlyIfEmpty = process.argv.includes('--if-empty');
const pool = createPool({ connectionString: directUrl(url), max: 1 });
try {
  const hasData = onlyIfEmpty && Boolean((await pool.query('SELECT 1 FROM businesses LIMIT 1')).rowCount);
  if (hasData) {
    console.log('database already has data, skipping seed');
  } else {
    await pool.query(readFileSync(join(dbDir(), 'seed.sql'), 'utf8'));
    console.log('seed data loaded (demo@slotpilot.dev / Password123!)');
  }
} catch (err) {
  console.error((err as Error).message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
