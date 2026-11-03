import { describe, expect, it } from 'vitest';
import type { BusinessDto, ServiceDto } from '@slotpilot/shared';
import { applyExtraction, missingFields, resolveService } from '../../src/modules/chat/booking-draft.js';

const svc = (id: string, name: string, durationMinutes = 30): ServiceDto => ({
  id,
  name,
  description: null,
  durationMinutes,
  priceCents: null,
});
const services = [
  svc('1', 'Checkup'),
  svc('2', 'Cleaning', 45),
  svc('3', 'Teeth Whitening', 60),
  svc('4', 'Deep Cleaning', 90),
];
const business: BusinessDto = {
  id: 'b',
  name: 'Test',
  slug: 'test',
  timezone: 'Asia/Karachi',
  opensAt: '09:00',
  closesAt: '17:00',
  openDays: [1, 2, 3, 4, 5, 6],
  slotIntervalMinutes: 30,
};
const ctx = { business, services, now: new Date('2030-01-07T03:00:00Z') };
const none = { service: null, date: null, time: null, notes: null };

describe('resolveService', () => {
  it('matches exact names case-insensitively', () => {
    expect(resolveService('checkup', services)).toMatchObject({ kind: 'match', service: { id: '1' } });
  });
  it('finds a service name inside a sentence', () => {
    expect(resolveService('I want a checkup please', services)).toMatchObject({ kind: 'match', service: { id: '1' } });
  });
  it('matches a partial name when unique', () => {
    expect(resolveService('whitening', services)).toMatchObject({ kind: 'match', service: { id: '3' } });
  });
  it('reports ambiguity instead of guessing', () => {
    expect(resolveService('clean', services)).toMatchObject({ kind: 'ambiguous' });
  });
  it('prefers the exact match over partials', () => {
    expect(resolveService('Cleaning', services)).toMatchObject({ kind: 'match', service: { id: '2' } });
  });
  it('returns none for unknown services', () => {
    expect(resolveService('massage', services)).toEqual({ kind: 'none' });
  });
});

describe('applyExtraction', () => {
  it('fills valid fields and reports progress', () => {
    const r = applyExtraction({}, { ...none, service: 'Cleaning', date: '2030-01-08', time: '15:00' }, ctx);
    expect(r.issues).toEqual([]);
    expect(r.changed).toBe(true);
    expect(r.draft).toMatchObject({
      serviceId: '2',
      serviceName: 'Cleaning',
      durationMinutes: 45,
      date: '2030-01-08',
      time: '15:00',
    });
    expect(missingFields(r.draft)).toEqual([]);
  });

  it('keeps existing fields when the model returns null for them', () => {
    const r = applyExtraction(
      { serviceId: '1', serviceName: 'Checkup', durationMinutes: 30 },
      { ...none, date: '2030-01-08' },
      ctx,
    );
    expect(r.draft.serviceId).toBe('1');
    expect(r.draft.date).toBe('2030-01-08');
  });

  it('lets a later message change a field ("make it 4pm")', () => {
    const r = applyExtraction({ time: '15:00' }, { ...none, time: '16:00' }, ctx);
    expect(r.draft.time).toBe('16:00');
    expect(r.changed).toBe(true);
  });

  it('drops a stale startsAt so it is recomputed', () => {
    const r = applyExtraction({ startsAt: '2030-01-08T15:00:00+05:00' }, none, ctx);
    expect(r.draft.startsAt).toBeUndefined();
  });

  it.each([
    [{ date: '2030-01-06' }, 'date', /already passed/],
    [{ date: '2030-01-13' }, 'date', /closed on Sundays/],
    [{ date: 'next friday' }, 'date', /couldn't work out/],
    [{ date: '2030-02-30' }, 'date', /couldn't work out/],
    [{ time: '3pm' }, 'time', /couldn't work out/],
    [{ time: '20:00' }, 'time', /outside our opening hours/],
    [{ service: 'massage' }, 'service', /don't offer "massage"/],
    [{ service: 'clean' }, 'service', /Did you mean/],
  ])('rejects %o', (fields, field, message) => {
    const r = applyExtraction({}, { ...none, ...fields }, ctx);
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0]!.field).toBe(field);
    expect(r.issues[0]!.message).toMatch(message);
    expect(r.changed).toBe(false);
  });

  it('reports no change when the model repeats what is already known', () => {
    const r = applyExtraction({ date: '2030-01-08' }, { ...none, date: '2030-01-08' }, ctx);
    expect(r.changed).toBe(false);
  });
});
