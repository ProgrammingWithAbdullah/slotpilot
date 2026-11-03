import { DateTime, Interval } from 'luxon';
import type { BusinessDto, ErrorCode } from '@slotpilot/shared';

/**
 * Pure scheduling rules (no I/O), so they are easy to unit test.
 * All math happens in the business's IANA timezone, which also handles DST correctly.
 */

export interface BusyRange {
  startsAt: Date;
  endsAt: Date;
}

function parseHm(hm: string): { hour: number; minute: number } {
  const [h = '0', m = '0'] = hm.split(':');
  return { hour: Number(h), minute: Number(m) };
}

/** Opening and closing instants for a local calendar date, or null if closed that day. */
export function openingWindow(business: BusinessDto, date: string): Interval | null {
  const day = DateTime.fromISO(date, { zone: business.timezone });
  if (!day.isValid || !business.openDays.includes(day.weekday)) return null;
  const open = day.set({ ...parseHm(business.opensAt), second: 0, millisecond: 0 });
  const close = day.set({ ...parseHm(business.closesAt), second: 0, millisecond: 0 });
  return Interval.fromDateTimes(open, close);
}

function overlapsAny(start: DateTime, end: DateTime, busy: BusyRange[]): boolean {
  const s = start.toMillis();
  const e = end.toMillis();
  // Half-open ranges, same as the DB constraint: [start, end)
  return busy.some((b) => s < b.endsAt.getTime() && b.startsAt.getTime() < e);
}

export function toIso(dt: DateTime): string {
  return dt.toISO({ suppressMilliseconds: true })!;
}

/** Free start times for a service on a date. */
export function computeSlots(args: {
  business: BusinessDto;
  durationMinutes: number;
  date: string;
  busy: BusyRange[];
  now: Date;
}): string[] {
  const window = openingWindow(args.business, args.date);
  if (!window?.start || !window.end) return [];
  const now = DateTime.fromJSDate(args.now);
  const slots: string[] = [];
  for (
    let t = window.start;
    t.plus({ minutes: args.durationMinutes }) <= window.end;
    t = t.plus({ minutes: args.business.slotIntervalMinutes })
  ) {
    if (t <= now) continue;
    if (overlapsAny(t, t.plus({ minutes: args.durationMinutes }), args.busy)) continue;
    slots.push(toIso(t));
  }
  return slots;
}

export interface SlotProblem {
  code: ErrorCode;
  message: string;
}

/** Checks the static rules for a requested start time (availability is checked separately). */
export function checkSlotRules(args: {
  business: BusinessDto;
  durationMinutes: number;
  startsAt: DateTime;
  now: Date;
}): SlotProblem | null {
  const { business } = args;
  const start = args.startsAt.setZone(business.timezone);
  if (!start.isValid) return { code: 'VALIDATION_ERROR', message: 'That time is not valid' };
  if (start.toMillis() <= args.now.getTime()) {
    return { code: 'IN_THE_PAST', message: 'That time has already passed' };
  }
  const window = openingWindow(business, start.toISODate()!);
  if (!window?.start || !window.end) {
    return { code: 'OUTSIDE_BUSINESS_HOURS', message: `We're closed on ${start.toFormat('cccc')}s` };
  }
  const end = start.plus({ minutes: args.durationMinutes });
  if (start < window.start || end > window.end) {
    return {
      code: 'OUTSIDE_BUSINESS_HOURS',
      message: `That's outside our opening hours (${formatTime(window.start)} to ${formatTime(window.end)})`,
    };
  }
  const minutesFromOpen = start.diff(window.start, 'minutes').minutes;
  if (minutesFromOpen % business.slotIntervalMinutes !== 0) {
    return {
      code: 'VALIDATION_ERROR',
      message: `Appointments start every ${business.slotIntervalMinutes} minutes (e.g. ${formatTime(window.start)}, ${formatTime(window.start.plus({ minutes: business.slotIntervalMinutes }))})`,
    };
  }
  return null;
}

export function formatTime(dt: DateTime): string {
  return dt.toFormat('h:mm a');
}

export function formatDate(dt: DateTime): string {
  return dt.toFormat('cccc d LLLL');
}

export function describeHours(business: BusinessDto): string {
  const names = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const days = [...business.openDays].sort();
  const contiguous = days.every((d, i) => i === 0 || d === days[i - 1]! + 1);
  const dayText =
    contiguous && days.length > 1
      ? `${names[days[0]!]} to ${names[days[days.length - 1]!]}`
      : days.map((d) => names[d]).join(', ');
  const t = (hm: string) => DateTime.fromFormat(hm, 'HH:mm').toFormat('h:mm a');
  return `${dayText}, ${t(business.opensAt)} to ${t(business.closesAt)}`;
}
