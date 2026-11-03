import { DateTime } from 'luxon';
import type { BookingDraft, BusinessDto, ServiceDto } from '@slotpilot/shared';
import { openingWindow } from '../catalog/availability.js';

/**
 * Pure booking rules applied to whatever the model extracted. No I/O: heavily unit-tested.
 * "The LLM proposes, the code decides."
 */

export type DraftField = 'service' | 'date' | 'time';

export interface Issue {
  field: DraftField;
  message: string;
}

export type ServiceMatch =
  { kind: 'match'; service: ServiceDto } | { kind: 'ambiguous'; options: ServiceDto[] } | { kind: 'none' };

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

/** Maps free text ("a cleaning please") to exactly one catalog service, or reports why it can't. */
export function resolveService(text: string, services: ServiceDto[]): ServiceMatch {
  const t = norm(text);
  if (!t) return { kind: 'none' };
  const exact = services.filter((s) => norm(s.name) === t);
  if (exact.length === 1) return { kind: 'match', service: exact[0]! };

  const contained = services.filter((s) => new RegExp(`\\b${escapeRe(norm(s.name))}\\b`).test(t));
  if (contained.length === 1) return { kind: 'match', service: contained[0]! };
  if (contained.length > 1) return { kind: 'ambiguous', options: contained };

  if (t.length >= 3) {
    const partial = services.filter((s) => norm(s.name).includes(t));
    if (partial.length === 1) return { kind: 'match', service: partial[0]! };
    if (partial.length > 1) return { kind: 'ambiguous', options: partial };
  }
  return { kind: 'none' };
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface ExtractedFields {
  service: string | null;
  date: string | null;
  time: string | null;
  notes: string | null;
}

export interface ApplyResult {
  draft: BookingDraft;
  issues: Issue[];
  changed: boolean;
}

/** Merges model output into the draft, keeping only values that pass validation. */
export function applyExtraction(
  current: BookingDraft,
  fields: ExtractedFields,
  ctx: { business: BusinessDto; services: ServiceDto[]; now: Date },
): ApplyResult {
  const { startsAt: _drop, ...rest } = current;
  const draft: BookingDraft = { ...rest };
  const issues: Issue[] = [];
  const tz = ctx.business.timezone;
  const today = DateTime.fromJSDate(ctx.now).setZone(tz).startOf('day');

  if (fields.service) {
    const match = resolveService(fields.service, ctx.services);
    if (match.kind === 'match') {
      draft.serviceId = match.service.id;
      draft.serviceName = match.service.name;
      draft.durationMinutes = match.service.durationMinutes;
    } else if (match.kind === 'ambiguous') {
      issues.push({
        field: 'service',
        message: `Did you mean ${listOr(match.options.map((s) => s.name))}?`,
      });
    } else {
      issues.push({
        field: 'service',
        message: `Sorry, we don't offer "${fields.service}". We offer ${listAnd(ctx.services.map((s) => s.name))}.`,
      });
    }
  }

  if (fields.date) {
    const d = /^\d{4}-\d{2}-\d{2}$/.test(fields.date)
      ? DateTime.fromISO(fields.date, { zone: tz })
      : DateTime.invalid('format');
    if (!d.isValid) {
      issues.push({ field: 'date', message: "I couldn't work out that date." });
    } else if (d < today) {
      issues.push({ field: 'date', message: `${d.toFormat('cccc d LLLL')} has already passed.` });
    } else if (!openingWindow(ctx.business, fields.date)) {
      issues.push({ field: 'date', message: `Sorry, we're closed on ${d.toFormat('cccc')}s.` });
    } else {
      draft.date = fields.date;
    }
  }

  if (fields.time) {
    const m = fields.time.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
    if (!m) {
      issues.push({ field: 'time', message: "I couldn't work out that time." });
    } else if (fields.time < ctx.business.opensAt || fields.time >= ctx.business.closesAt) {
      issues.push({
        field: 'time',
        message: `${formatHm(fields.time)} is outside our opening hours (${formatHm(ctx.business.opensAt)} to ${formatHm(ctx.business.closesAt)}).`,
      });
    } else {
      draft.time = fields.time;
    }
  }

  if (fields.notes) draft.notes = fields.notes.slice(0, 500);

  const changed =
    draft.serviceId !== current.serviceId ||
    draft.date !== current.date ||
    draft.time !== current.time ||
    draft.notes !== current.notes;

  return { draft, issues, changed };
}

export function missingFields(draft: BookingDraft): DraftField[] {
  const missing: DraftField[] = [];
  if (!draft.serviceId) missing.push('service');
  if (!draft.date) missing.push('date');
  if (!draft.time) missing.push('time');
  return missing;
}

/** Start instant for a complete draft, in the business timezone. */
export function draftStart(draft: BookingDraft, timezone: string): DateTime | null {
  if (!draft.date || !draft.time) return null;
  const dt = DateTime.fromISO(`${draft.date}T${draft.time}`, { zone: timezone });
  return dt.isValid ? dt : null;
}

/** Two booking turns in a row without progress: hand over to the form. */
export const NO_PROGRESS_LIMIT = 2;

export function formatHm(hm: string): string {
  return DateTime.fromFormat(hm, 'HH:mm').toFormat('h:mm a');
}

export function listAnd(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

export function listOr(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} or ${items[items.length - 1]}`;
}
