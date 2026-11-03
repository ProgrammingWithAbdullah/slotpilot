import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { buildTestApp, resetDatabase, testPool, type TestApp } from '../helpers.js';

let t: TestApp;
beforeAll(async () => {
  await resetDatabase(testPool());
  t = await buildTestApp();
});
beforeEach(async () => {
  await testPool().query('TRUNCATE users CASCADE');
});

const signup = (body: object) => request(t.app).post('/api/v1/auth/signup').send(body);
const valid = { fullName: 'Ayesha Malik', email: 'Ayesha@Example.com', password: 'Password123!' };

describe('POST /auth/signup', () => {
  it('creates the user, normalises the email and sets a secure session cookie', async () => {
    const res = await signup(valid);
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ email: 'ayesha@example.com', fullName: 'Ayesha Malik', role: 'customer' });
    expect(res.body.data.passwordHash).toBeUndefined();
    const cookie = res.headers['set-cookie']![0]!;
    expect(cookie).toMatch(/^sp_session=/);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
  });

  it('stores a bcrypt hash, never the password', async () => {
    await signup(valid);
    const { rows } = await testPool().query('SELECT password_hash FROM users');
    expect(rows[0].password_hash).toMatch(/^\$2[aby]\$/);
  });

  it('returns 409 EMAIL_TAKEN for a duplicate email (case-insensitive)', async () => {
    await signup(valid);
    const res = await signup({ ...valid, email: 'AYESHA@example.com' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('returns 400 with field errors for invalid input', async () => {
    const res = await signup({ fullName: '', email: 'nope', password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(Object.keys(res.body.error.details)).toEqual(expect.arrayContaining(['fullName', 'email', 'password']));
    expect(res.body.error.requestId).toBeTruthy();
  });

  it('rejects passwords longer than bcrypt can handle (72 bytes)', async () => {
    const res = await signup({ ...valid, password: 'x'.repeat(73) });
    expect(res.status).toBe(400);
  });
});

describe('POST /auth/login', () => {
  beforeEach(async () => {
    await signup(valid);
  });

  it('logs in with the right password', async () => {
    const res = await request(t.app).post('/api/v1/auth/login').send({ email: 'ayesha@example.com', password: 'Password123!' });
    expect(res.status).toBe(200);
    expect(res.headers['set-cookie']![0]).toMatch(/^sp_session=/);
  });

  it('gives the same 401 for a wrong password and an unknown email', async () => {
    const wrong = await request(t.app).post('/api/v1/auth/login').send({ email: 'ayesha@example.com', password: 'nope-nope' });
    const unknown = await request(t.app).post('/api/v1/auth/login').send({ email: 'ghost@example.com', password: 'nope-nope' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(wrong.body.error.message).toBe(unknown.body.error.message);
  });
});

describe('GET /auth/me and logout', () => {
  it('returns 401 without a cookie', async () => {
    const res = await request(t.app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('restores the session from the cookie, and logout clears it', async () => {
    const agent = request.agent(t.app);
    await agent.post('/api/v1/auth/signup').send(valid).expect(201);
    await agent.get('/api/v1/auth/me').expect(200);
    const out = await agent.post('/api/v1/auth/logout');
    expect(out.status).toBe(204);
    await agent.get('/api/v1/auth/me').expect(401);
  });

  it('rejects tampered and expired tokens', async () => {
    const res = await signup(valid);
    const userId = res.body.data.id;
    const forged = jwt.sign({ bid: 'x' }, 'wrong-secret-wrong-secret-wrong-secret!!', { subject: userId });
    await request(t.app).get('/api/v1/auth/me').set('Cookie', `sp_session=${forged}`).expect(401);
    const expired = jwt.sign({ bid: t.container.business.id }, process.env.JWT_SECRET!, { subject: userId, expiresIn: -10 });
    await request(t.app).get('/api/v1/auth/me').set('Cookie', `sp_session=${expired}`).expect(401);
  });

  it('treats a token for a deleted user as logged out', async () => {
    const agent = request.agent(t.app);
    await agent.post('/api/v1/auth/signup').send(valid).expect(201);
    await testPool().query('DELETE FROM users');
    await agent.get('/api/v1/auth/me').expect(401);
  });
});

describe('auth rate limiting', () => {
  it('returns 429 after too many attempts', async () => {
    const limited = await buildTestApp({ env: { RATE_LIMIT_AUTH_PER_15MIN: '3' } });
    const attempt = () => request(limited.app).post('/api/v1/auth/login').send({ email: 'a@b.co', password: 'whatever' });
    for (let i = 0; i < 3; i++) expect((await attempt()).status).toBe(401);
    const res = await attempt();
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
  });
});
