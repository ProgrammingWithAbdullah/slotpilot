import { DateTime } from 'luxon';
import type { LlmProvider } from './llm-provider.js';

/**
 * Deterministic, offline stand-in for an LLM. Used by tests, CI, the e2e test and
 * local development without a key (AI_PROVIDER=mock). It understands simple phrases like
 * "cleaning tomorrow at 3pm", "next friday", "2026-11-20", "10:30 am".
 * It reads TODAY from the system prompt, just like the real model has to.
 */
const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

export function parseDate(text: string, today: DateTime): string | null {
  const t = text.toLowerCase();
  const iso = t.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso) return iso[1]!;
  if (/\btoday\b/.test(t)) return today.toISODate();
  if (/\btomorrow\b/.test(t)) return today.plus({ days: 1 }).toISODate();
  for (let i = 0; i < WEEKDAYS.length; i++) {
    if (new RegExp(`\\b${WEEKDAYS[i]}\\b`).test(t)) {
      let diff = (i + 1 - today.weekday + 7) % 7;
      if (diff === 0 || /\bnext\b/.test(t)) diff = diff === 0 ? 7 : diff;
      return today.plus({ days: diff }).toISODate();
    }
  }
  return null;
}

export function parseTime(text: string): string | null {
  const t = text.toLowerCase();
  if (/\bnoon\b/.test(t)) return '12:00';
  const ampm = t.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
  if (ampm) {
    let h = Number(ampm[1]) % 12;
    if (ampm[3] === 'pm') h += 12;
    return `${String(h).padStart(2, '0')}:${ampm[2] ?? '00'}`;
  }
  const h24 = t.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (h24) return `${h24[1]!.padStart(2, '0')}:${h24[2]}`;
  return null;
}

export function createMockProvider(): LlmProvider {
  return {
    name: 'mock',
    defaultModel: 'mock-1',
    async complete(req) {
      const todayMatch = req.system.match(/TODAY: (\d{4}-\d{2}-\d{2})/);
      const today = todayMatch ? DateTime.fromISO(todayMatch[1]!) : DateTime.now();
      const services = [...req.system.matchAll(/^- (.+?) \(\d+ min\)/gm)].map((m) => m[1]!);
      const last = [...req.messages].reverse().find((m) => m.role === 'user')?.content ?? '';
      const lower = last.toLowerCase();

      const service = services.find((s) => lower.includes(s.toLowerCase())) ?? null;
      const date = parseDate(last, today);
      const time = parseTime(last);
      const hasFields = Boolean(service || date || time);

      let intent = 'book';
      if (/\bcancel\b/.test(lower)) intent = 'cancel';
      else if (!hasFields && /^(yes|yep|confirm|book it|sounds good)\b/.test(lower)) intent = 'confirm';
      else if (!hasFields && /^(hi|hello|hey|thanks|thank you)\b/.test(lower)) intent = 'smalltalk';
      else if (!hasFields && /\?$/.test(lower)) intent = 'question';

      const reply =
        intent === 'smalltalk'
          ? 'Hello! What would you like to book?'
          : intent === 'question'
            ? 'I can help you book an appointment. What would you like to book?'
            : ''; // booking turns: the server asks the next question itself
      return {
        model: 'mock-1',
        text: JSON.stringify({ intent, fields: { service, date, time, notes: null }, reply }),
        usage: { promptTokens: 0, completionTokens: 0 },
      };
    },
  };
}
