import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildTestApp, resetDatabase, testPool, type TestApp } from '../helpers.js';

let t: TestApp;
beforeAll(async () => {
  await resetDatabase(testPool());
  t = await buildTestApp();
});

describe('HTTP behaviour', () => {
  it('exposes liveness and readiness', async () => {
    await request(t.app).get('/health').expect(200, { status: 'ok' });
    const ready = await request(t.app).get('/health/ready').expect(200);
    expect(ready.body).toMatchObject({ status: 'ready', ai: 'mock' });
  });

  it('returns the standard error shape for unknown routes', async () => {
    const res = await request(t.app).get('/api/v1/nope').expect(404);
    expect(res.body).toEqual({
      error: { code: 'NOT_FOUND', message: 'Route GET /nope not found', requestId: expect.any(String) },
    });
  });

  it('reuses a safe incoming X-Request-Id', async () => {
    const res = await request(t.app).get('/api/v1/nope').set('X-Request-Id', 'abc-123');
    expect(res.headers['x-request-id']).toBe('abc-123');
    expect(res.body.error.requestId).toBe('abc-123');
  });

  it('rejects malformed JSON with 400', async () => {
    const res = await request(t.app)
      .post('/api/v1/auth/login')
      .set('content-type', 'application/json')
      .send('{"email":');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects bodies over 16kb with 413', async () => {
    const res = await request(t.app)
      .post('/api/v1/auth/login')
      .send({ email: 'a@b.co', password: 'x'.repeat(20_000) });
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('sets security headers and hides the framework', async () => {
    const res = await request(t.app).get('/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
  });

  it('applies the global rate limit to the API', async () => {
    const limited = await buildTestApp({ env: { RATE_LIMIT_GLOBAL_PER_15MIN: '2' } });
    await request(limited.app).get('/api/v1/business').expect(200);
    await request(limited.app).get('/api/v1/business').expect(200);
    const res = await request(limited.app).get('/api/v1/business');
    expect(res.status).toBe(429);
    expect(res.headers['ratelimit-policy'] ?? res.headers['ratelimit']).toBeDefined();
  });
});
