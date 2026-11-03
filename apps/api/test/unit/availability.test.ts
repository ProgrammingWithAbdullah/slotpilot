import { describe, expect, it } from 'vitest';
import { DateTime } from 'luxon';
import type { BusinessDto } from '@slotpilot/shared';
import { checkSlotRules, computeSlots, describeHours, openingWindow } from '../../src/modules/catalog/availability.js';

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
const now = new Date('2030-01-07T03:00:00Z'); // Monday 08:00 local

describe('computeSlots', () => {
  it('returns every 30-minute start that fits before closing', () => {
    const slots = computeSlots({ business, durationMinutes: 45, date: '2030-01-07', busy: [], now });
    expect(slots[0]).toBe('2030-01-07T09:00:00+05:00');
    // Last start must END by 17:00: 16:00 + 45 = 16:45 fits, 16:30 + 45 = 17:15 does not.
    expect(slots.at(-1)).toBe('2030-01-07T16:00:00+05:00');
    expect(slots).toHaveLength(15);
  });

  it('is empty on a closed day', () => {
    expect(computeSlots({ business, durationMinutes: 30, date: '2030-01-13', busy: [], now })).toEqual([]);
  });

  it('skips times that are already over', () => {
    const lateMorning = new Date('2030-01-07T06:10:00Z'); // 11:10 local
    const slots = computeSlots({ business, durationMinutes: 30, date: '2030-01-07', busy: [], now: lateMorning });
    expect(slots[0]).toBe('2030-01-07T11:30:00+05:00');
  });

  it('removes slots overlapping existing appointments (half-open ranges)', () => {
    const busy = [{ startsAt: new Date('2030-01-07T10:00:00+05:00'), endsAt: new Date('2030-01-07T10:45:00+05:00') }];
    const slots = computeSlots({ business, durationMinutes: 30, date: '2030-01-07', busy, now });
    expect(slots).toContain('2030-01-07T09:30:00+05:00'); // ends exactly at 10:00: allowed
    expect(slots).not.toContain('2030-01-07T10:00:00+05:00');
    expect(slots).not.toContain('2030-01-07T10:30:00+05:00'); // overlaps 10:30-10:45
    expect(slots).toContain('2030-01-07T11:00:00+05:00');
  });

  it('handles a daylight-saving change using the IANA zone', () => {
    const london: BusinessDto = { ...business, timezone: 'Europe/London', openDays: [7] };
    // Clocks go forward on Sunday 2030-03-31: opening 09:00 is BST (+01:00).
    const slots = computeSlots({ business: london, durationMinutes: 30, date: '2030-03-31', busy: [], now });
    expect(slots[0]).toBe('2030-03-31T09:00:00+01:00');
    const before = computeSlots({ business: london, durationMinutes: 30, date: '2030-03-24', busy: [], now });
    expect(before[0]).toBe('2030-03-24T09:00:00+00:00');
  });
});

describe('checkSlotRules', () => {
  const check = (iso: string, durationMinutes = 30) =>
    checkSlotRules({ business, durationMinutes, startsAt: DateTime.fromISO(iso, { setZone: true }), now });

  it('accepts a valid future slot', () => {
    expect(check('2030-01-07T09:30:00+05:00')).toBeNull();
  });
  it('accepts the same instant expressed in another offset', () => {
    expect(check('2030-01-07T04:30:00Z')).toBeNull();
  });
  it('rejects the past', () => {
    expect(check('2030-01-06T09:00:00+05:00')?.code).toBe('IN_THE_PAST');
  });
  it('rejects closed days', () => {
    expect(check('2030-01-13T10:00:00+05:00')?.code).toBe('OUTSIDE_BUSINESS_HOURS');
  });
  it('rejects appointments that would end after closing', () => {
    expect(check('2030-01-07T16:30:00+05:00', 45)?.code).toBe('OUTSIDE_BUSINESS_HOURS');
  });
  it('rejects misaligned start times', () => {
    expect(check('2030-01-07T09:10:00+05:00')?.code).toBe('VALIDATION_ERROR');
  });
});

describe('helpers', () => {
  it('describes opening hours', () => {
    expect(describeHours(business)).toBe('Mon to Sat, 9:00 AM to 5:00 PM');
  });
  it('returns null opening window for an invalid date', () => {
    expect(openingWindow(business, '2030-02-30')).toBeNull();
  });
});
