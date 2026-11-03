import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import {
  MONDAY,
  SERVICES,
  SUNDAY,
  TUESDAY,
  at,
  buildTestApp,
  resetDatabase,
  signedInAgent,
  testPool,
  type TestApp,
} from '../helpers.js';

let t: TestApp;
beforeAll(async () => {
  await resetDatabase(testPool());
  t = await buildTestApp();
});
beforeEach(async () => {
  await resetDatabase(testPool());
});

const book = (agent: ReturnType<typeof request.agent>, body: object, key?: string) => {
  const r = agent.post('/api/v1/appointments');
  if (key) r.set('Idempotency-Key', key);
  return r.send(body);
};

describe('catalog', () => {
  it('lists active services and free slots', async () => {
    const { agent } = await signedInAgent(t.app);
    const services = await agent.get('/api/v1/services').expect(200);
    expect(services.body.data.map((s: { name: string }) => s.name)).toEqual(['Checkup', 'Cleaning', 'Whitening']);
    const slots = await agent.get(`/api/v1/availability?serviceId=${SERVICES.cleaning}&date=${MONDAY}`).expect(200);
    expect(slots.body.data.slots[0]).toBe(at(MONDAY, '09:00'));
    expect(slots.body.data.timezone).toBe('Asia/Karachi');
  });

  it("does not expose another tenant's services", async () => {
    const { agent } = await signedInAgent(t.app);
    await agent.get(`/api/v1/availability?serviceId=${SERVICES.otherTenant}&date=${MONDAY}`).expect(404);
  });

  it('validates availability query params', async () => {
    const { agent } = await signedInAgent(t.app);
    const res = await agent.get('/api/v1/availability?serviceId=nope&date=tomorrow');
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.error.details)).toEqual(['serviceId', 'date']);
  });

  it('serves the public business profile without auth', async () => {
    const res = await request(t.app).get('/api/v1/business').expect(200);
    expect(res.body.data).toMatchObject({ name: 'Test Clinic', timezone: 'Asia/Karachi', opensAt: '09:00' });
  });
});

describe('POST /appointments', () => {
  it('books a free slot and removes it from availability', async () => {
    const { agent } = await signedInAgent(t.app);
    const res = await book(agent, {
      serviceId: SERVICES.cleaning,
      startsAt: at(TUESDAY, '10:00'),
      notes: 'Sensitive teeth',
    });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      status: 'confirmed',
      source: 'form',
      notes: 'Sensitive teeth',
      service: { name: 'Cleaning', durationMinutes: 45 },
      startsAt: '2030-01-08T05:00:00.000Z',
      endsAt: '2030-01-08T05:45:00.000Z',
    });
    const slots = await agent.get(`/api/v1/availability?serviceId=${SERVICES.checkup}&date=${TUESDAY}`);
    expect(slots.body.data.slots).not.toContain(at(TUESDAY, '10:00'));
    expect(slots.body.data.slots).not.toContain(at(TUESDAY, '10:30')); // still inside 10:00-10:45
    expect(slots.body.data.slots).toContain(at(TUESDAY, '11:00'));
  });

  it.each([
    ['in the past', at('2030-01-06', '10:00'), 'IN_THE_PAST'],
    ['on a closed day', at(SUNDAY, '10:00'), 'OUTSIDE_BUSINESS_HOURS'],
    ['ending after closing', at(TUESDAY, '16:30'), 'OUTSIDE_BUSINESS_HOURS'],
    ['misaligned', at(TUESDAY, '10:10'), 'VALIDATION_ERROR'],
  ])('rejects a time %s', async (_label, startsAt, code) => {
    const { agent } = await signedInAgent(t.app);
    const res = await book(agent, { serviceId: SERVICES.cleaning, startsAt });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe(code);
  });

  it("rejects another tenant's service", async () => {
    const { agent } = await signedInAgent(t.app);
    const res = await book(agent, { serviceId: SERVICES.otherTenant, startsAt: at(TUESDAY, '10:00') });
    expect(res.status).toBe(400);
  });

  it('returns 409 SLOT_UNAVAILABLE with alternatives when the slot overlaps', async () => {
    const a = await signedInAgent(t.app);
    const b = await signedInAgent(t.app);
    await book(a.agent, { serviceId: SERVICES.cleaning, startsAt: at(TUESDAY, '10:00') }).expect(201);
    const res = await book(b.agent, { serviceId: SERVICES.checkup, startsAt: at(TUESDAY, '10:30') });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SLOT_UNAVAILABLE');
    // The three free times closest to the requested 10:30, in time order.
    expect(res.body.error.details.alternatives).toEqual([
      at(TUESDAY, '09:30'),
      at(TUESDAY, '11:00'),
      at(TUESDAY, '11:30'),
    ]);
  });

  it('lets exactly one of two simultaneous bookings for the same slot win (DB exclusion constraint)', async () => {
    const a = await signedInAgent(t.app);
    const b = await signedInAgent(t.app);
    const body = { serviceId: SERVICES.whitening, startsAt: at(TUESDAY, '13:00') };
    const results = await Promise.all([book(a.agent, body), book(b.agent, body), book(a.agent, body)]);
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([201, 409, 409]);
    const { rows } = await testPool().query("SELECT count(*)::int AS n FROM appointments WHERE status = 'confirmed'");
    expect(rows[0].n).toBe(1);
  });

  it('is idempotent: a retried request with the same key returns the original booking', async () => {
    const { agent } = await signedInAgent(t.app);
    const body = { serviceId: SERVICES.checkup, startsAt: at(TUESDAY, '09:00') };
    const first = await book(agent, body, 'key-abcdef-123');
    const retry = await book(agent, body, 'key-abcdef-123');
    expect(first.status).toBe(201);
    expect(retry.status).toBe(200);
    expect(retry.body.data.id).toBe(first.body.data.id);
  });

  it('rejects a chat session that belongs to someone else', async () => {
    const a = await signedInAgent(t.app);
    const b = await signedInAgent(t.app);
    const session = await a.agent.post('/api/v1/chat/sessions').expect(201);
    const res = await book(b.agent, {
      serviceId: SERVICES.checkup,
      startsAt: at(TUESDAY, '09:00'),
      chatSessionId: session.body.data.id,
    });
    expect(res.status).toBe(404);
  });

  it('requires authentication', async () => {
    await request(t.app).post('/api/v1/appointments').send({}).expect(401);
  });
});

describe('reading and cancelling', () => {
  it('lists upcoming appointments soonest first with cursor pagination', async () => {
    const { agent } = await signedInAgent(t.app);
    for (const hm of ['15:00', '09:00', '11:00']) {
      await book(agent, { serviceId: SERVICES.checkup, startsAt: at(TUESDAY, hm) }).expect(201);
    }
    const page1 = await agent.get('/api/v1/appointments?scope=upcoming&limit=2').expect(200);
    expect(page1.body.data.map((a: { startsAt: string }) => a.startsAt)).toEqual([
      '2030-01-08T04:00:00.000Z',
      '2030-01-08T06:00:00.000Z',
    ]);
    expect(page1.body.meta.nextCursor).toBeTruthy();
    const page2 = await agent
      .get(`/api/v1/appointments?scope=upcoming&limit=2&cursor=${page1.body.meta.nextCursor}`)
      .expect(200);
    expect(page2.body.data.map((a: { startsAt: string }) => a.startsAt)).toEqual(['2030-01-08T10:00:00.000Z']);
    expect(page2.body.meta.nextCursor).toBeNull();
  });

  it("returns 404 (not 403) for another user's appointment", async () => {
    const a = await signedInAgent(t.app);
    const b = await signedInAgent(t.app);
    const created = await book(a.agent, { serviceId: SERVICES.checkup, startsAt: at(TUESDAY, '09:00') });
    await b.agent.get(`/api/v1/appointments/${created.body.data.id}`).expect(404);
    await b.agent.post(`/api/v1/appointments/${created.body.data.id}/cancel`).expect(404);
    await a.agent.get(`/api/v1/appointments/${created.body.data.id}`).expect(200);
  });

  it('cancels, moves it to past, frees the slot, and refuses to cancel twice', async () => {
    const { agent } = await signedInAgent(t.app);
    const created = await book(agent, { serviceId: SERVICES.checkup, startsAt: at(TUESDAY, '09:00') });
    const id = created.body.data.id;
    const res = await agent.post(`/api/v1/appointments/${id}/cancel`).expect(200);
    expect(res.body.data.status).toBe('cancelled');
    expect(res.body.data.cancelledAt).toBeTruthy();
    const again = await agent.post(`/api/v1/appointments/${id}/cancel`);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('NOT_CANCELLABLE');
    const past = await agent.get('/api/v1/appointments?scope=past').expect(200);
    expect(past.body.data[0].id).toBe(id);
    await book(agent, { serviceId: SERVICES.checkup, startsAt: at(TUESDAY, '09:00') }).expect(201);
  });

  it('rejects malformed ids and cursors', async () => {
    const { agent } = await signedInAgent(t.app);
    await agent.get('/api/v1/appointments/not-a-uuid').expect(400);
    await agent.get('/api/v1/appointments?cursor=garbage').expect(400);
  });
});
