import type pg from 'pg';
import request from 'supertest';
import { loadEnv } from '../src/config/env.js';
import { createPool } from '../src/db/pool.js';
import { createLogger } from '../src/lib/logger.js';
import { createContainer, type ContainerOverrides } from '../src/container.js';
import { createApp } from '../src/app.js';

export const BUSINESS_ID = '0b0e1a1e-0000-4000-8000-000000000001';
export const OTHER_BUSINESS_ID = '0b0e1a1e-0000-4000-8000-000000000002';
export const SERVICES = {
  checkup: '0b0e1a1e-0000-4000-8000-000000000101', // 30 min
  cleaning: '0b0e1a1e-0000-4000-8000-000000000102', // 45 min
  whitening: '0b0e1a1e-0000-4000-8000-000000000103', // 60 min
  otherTenant: '0b0e1a1e-0000-4000-8000-000000000199',
};

/**
 * Fixed clock: Monday 2030-01-07 08:00 in Asia/Karachi (03:00Z), before opening.
 * Far in the future so DB-side now() comparisons ("upcoming", cancel) behave naturally.
 */
export const NOW = new Date('2030-01-07T03:00:00Z');
export const MONDAY = '2030-01-07';
export const TUESDAY = '2030-01-08';
export const SUNDAY = '2030-01-13';
/** Local Karachi time (UTC+5) as an ISO string. */
export const at = (date: string, hm: string) => `${date}T${hm}:00+05:00`;

export async function resetDatabase(pool: pg.Pool) {
  await pool.query(`TRUNCATE businesses, users, services, chat_sessions, chat_messages, appointments, ai_interactions
                    RESTART IDENTITY CASCADE`);
  await pool.query(
    `INSERT INTO businesses (id, name, slug, timezone, opens_at, closes_at, open_days, slot_interval_minutes) VALUES
       ($1, 'Test Clinic', 'test-clinic', 'Asia/Karachi', '09:00', '17:00', '{1,2,3,4,5,6}', 30),
       ($2, 'Other Clinic', 'other-clinic', 'UTC', '09:00', '17:00', '{1,2,3,4,5}', 30)`,
    [BUSINESS_ID, OTHER_BUSINESS_ID],
  );
  await pool.query(
    `INSERT INTO services (id, business_id, name, duration_minutes) VALUES
       ($1, $5, 'Checkup', 30), ($2, $5, 'Cleaning', 45), ($3, $5, 'Whitening', 60), ($4, $6, 'Other Service', 30)`,
    [SERVICES.checkup, SERVICES.cleaning, SERVICES.whitening, SERVICES.otherTenant, BUSINESS_ID, OTHER_BUSINESS_ID],
  );
}

let sharedPool: pg.Pool | undefined;
export function testPool(): pg.Pool {
  sharedPool ??= createPool({ connectionString: process.env.DATABASE_URL!, max: 5 });
  return sharedPool;
}

export async function buildTestApp(overrides: ContainerOverrides & { env?: Record<string, string> } = {}) {
  const { env: envOverrides, ...containerOverrides } = overrides;
  const env = loadEnv({ ...process.env, ...envOverrides });
  const pool = testPool();
  const logger = createLogger({ level: 'silent', pretty: false });
  const container = await createContainer(env, pool, logger, { now: () => NOW, bcryptCost: 4, ...containerOverrides });
  const app = createApp(container);
  return { app, container, pool };
}

export type TestApp = Awaited<ReturnType<typeof buildTestApp>>;

let userCounter = 0;
/** Signs up a fresh user and returns a supertest agent that keeps the session cookie. */
export async function signedInAgent(app: TestApp['app'], name = 'Test User') {
  const agent = request.agent(app);
  const email = `user${++userCounter}-${Date.now()}@example.com`;
  const res = await agent.post('/api/v1/auth/signup').send({ fullName: name, email, password: 'Password123!' });
  if (res.status !== 201) throw new Error(`signup failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { agent, user: res.body.data as { id: string; email: string }, email };
}
