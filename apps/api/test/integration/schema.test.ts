import { beforeEach, describe, expect, it } from 'vitest';
import { BUSINESS_ID, OTHER_BUSINESS_ID, SERVICES, resetDatabase, testPool } from '../helpers.js';

/** The database itself enforces the most important rules; these tests prove it. */
const pool = testPool();
let userId: string;

beforeEach(async () => {
  await resetDatabase(pool);
  const { rows } = await pool.query(
    `INSERT INTO users (business_id, email, password_hash, full_name) VALUES ($1, 'db@test.com', 'x', 'DB') RETURNING id`,
    [BUSINESS_ID],
  );
  userId = rows[0].id;
});

const insert = (start: string, end: string, extra: { status?: string; business?: string; service?: string } = {}) =>
  pool.query(
    `INSERT INTO appointments (business_id, user_id, service_id, starts_at, ends_at, status, source, cancelled_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'form', CASE WHEN $6 = 'cancelled' THEN now() END)`,
    [extra.business ?? BUSINESS_ID, userId, extra.service ?? SERVICES.checkup, start, end, extra.status ?? 'confirmed'],
  );

describe('appointments constraints', () => {
  it('rejects overlapping active appointments (exclusion constraint, SQLSTATE 23P01)', async () => {
    await insert('2030-01-08T10:00Z', '2030-01-08T10:45Z');
    await expect(insert('2030-01-08T10:30Z', '2030-01-08T11:00Z')).rejects.toMatchObject({ code: '23P01' });
  });

  it('allows back-to-back appointments (half-open ranges)', async () => {
    await insert('2030-01-08T10:00Z', '2030-01-08T10:30Z');
    await expect(insert('2030-01-08T10:30Z', '2030-01-08T11:00Z')).resolves.toBeTruthy();
  });

  it('ignores cancelled appointments when checking overlap', async () => {
    await insert('2030-01-08T10:00Z', '2030-01-08T10:30Z', { status: 'cancelled' });
    await expect(insert('2030-01-08T10:00Z', '2030-01-08T10:30Z')).resolves.toBeTruthy();
  });

  it('rejects an appointment whose service belongs to another tenant (composite FK)', async () => {
    await expect(insert('2030-01-08T10:00Z', '2030-01-08T10:30Z', { service: SERVICES.otherTenant })).rejects.toMatchObject({
      code: '23503',
    });
  });

  it('rejects an appointment whose user belongs to another tenant (composite FK)', async () => {
    await expect(
      insert('2030-01-08T10:00Z', '2030-01-08T10:30Z', { business: OTHER_BUSINESS_ID, service: SERVICES.otherTenant }),
    ).rejects.toMatchObject({ code: '23503' });
  });

  it('enforces status values, ordering of times and cancelled_at consistency', async () => {
    await expect(insert('2030-01-08T10:00Z', '2030-01-08T10:30Z', { status: 'maybe' })).rejects.toMatchObject({ code: '23514' });
    await expect(insert('2030-01-08T10:30Z', '2030-01-08T10:00Z')).rejects.toMatchObject({ code: '23514' });
    await expect(
      pool.query(
        `INSERT INTO appointments (business_id, user_id, service_id, starts_at, ends_at, status, source)
         VALUES ($1, $2, $3, '2030-01-09T10:00Z', '2030-01-09T10:30Z', 'cancelled', 'form')`,
        [BUSINESS_ID, userId, SERVICES.checkup],
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });
});

describe('users constraints', () => {
  it('treats emails case-insensitively per business (citext)', async () => {
    await expect(
      pool.query(`INSERT INTO users (business_id, email, password_hash, full_name) VALUES ($1, 'DB@TEST.COM', 'x', 'Dup')`, [BUSINESS_ID]),
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('allows the same email at a different business', async () => {
    await expect(
      pool.query(`INSERT INTO users (business_id, email, password_hash, full_name) VALUES ($1, 'db@test.com', 'x', 'Other')`, [
        OTHER_BUSINESS_ID,
      ]),
    ).resolves.toBeTruthy();
  });
});

describe('updated_at trigger', () => {
  it('bumps updated_at on update', async () => {
    await insert('2030-01-08T10:00Z', '2030-01-08T10:30Z');
    const before = await pool.query('SELECT updated_at FROM appointments');
    await new Promise((r) => setTimeout(r, 20));
    await pool.query("UPDATE appointments SET notes = 'x'");
    const after = await pool.query('SELECT updated_at FROM appointments');
    expect(after.rows[0].updated_at.getTime()).toBeGreaterThan(before.rows[0].updated_at.getTime());
  });
});
