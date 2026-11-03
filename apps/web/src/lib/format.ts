/**
 * All times are shown in the BUSINESS's timezone (not the browser's):
 * an appointment at the clinic is at 3 PM clinic time wherever the customer is.
 */
const cache = new Map<string, Intl.DateTimeFormat>();
function fmt(timeZone: string, options: Intl.DateTimeFormatOptions) {
  const key = timeZone + JSON.stringify(options);
  let f = cache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', { timeZone, ...options });
    cache.set(key, f);
  }
  return f;
}

export const formatTime = (iso: string, tz: string) =>
  fmt(tz, { hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(iso)).toUpperCase();

export const formatDate = (iso: string, tz: string) =>
  fmt(tz, { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(iso));

export const formatShortDate = (iso: string, tz: string) =>
  fmt(tz, { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(iso));

export function dateParts(iso: string, tz: string) {
  const parts = fmt(tz, { day: 'numeric', month: 'short', weekday: 'short' }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return { day: get('day'), month: get('month'), weekday: get('weekday') };
}

/** YYYY-MM-DD of an instant in the given timezone. */
export function isoDateIn(date: Date, tz: string): string {
  return fmt(tz, { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date).split('/').reverse().join('-');
}

/** HH:mm (24h) of an instant in the given timezone. */
export function hmIn(iso: string, tz: string): string {
  return fmt(tz, { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
}

export function timezoneLabel(tz: string): string {
  const name = fmt(tz, { timeZoneName: 'short' })
    .formatToParts(new Date())
    .find((p) => p.type === 'timeZoneName')?.value;
  return name ? `${tz.replace(/_/g, ' ')} (${name})` : tz;
}

/** The next `count` calendar days starting today in the business timezone. */
export function upcomingDays(tz: string, count: number, now = new Date()) {
  const today = isoDateIn(now, tz);
  const base = new Date(`${today}T12:00:00Z`); // noon UTC avoids DST edge cases when adding days
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(base.getTime() + i * 86_400_000);
    const iso = d.toISOString().slice(0, 10);
    const isoWeekday = ((d.getUTCDay() + 6) % 7) + 1; // 1 = Monday
    return {
      date: iso,
      isoWeekday,
      label: new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short' }).format(d),
      day: d.getUTCDate(),
      month: new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', month: 'short' }).format(d),
    };
  });
}

export function formatPrice(cents: number | null): string | null {
  if (cents === null) return null;
  if (cents === 0) return 'Free';
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}

export function greeting(now = new Date()): string {
  const h = now.getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}
