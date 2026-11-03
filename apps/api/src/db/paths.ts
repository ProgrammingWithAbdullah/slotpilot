import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Finds the repo's db/ folder whether running from src (tsx) or dist (node). */
export function dbDir(): string {
  if (process.env.DB_DIR) return process.env.DB_DIR;
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    const candidate = resolve(dir, 'db', 'migrations');
    if (existsSync(candidate)) return resolve(dir, 'db');
    dir = resolve(dir, '..');
  }
  throw new Error('Could not locate the db/ directory; set DB_DIR');
}
