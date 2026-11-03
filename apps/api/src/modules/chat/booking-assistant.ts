import { DateTime } from 'luxon';
import type {
  BookingDraft,
  BusinessDto,
  ChatState,
  MessageMetadata,
  ServiceDto,
} from '@slotpilot/shared';
import type { EventBus } from '../../lib/events.js';
import type { Logger } from '../../lib/logger.js';
import type { ServicesRepository } from '../catalog/services.repository.js';
import type { AvailabilityService } from '../catalog/availability.service.js';
import { checkSlotRules, describeHours, formatDate, formatTime, toIso } from '../catalog/availability.js';
import type { BookingExtractor, Extraction } from '../ai/booking-extractor.js';
import type { ChatRepository, SessionRecord } from './chat.repository.js';
import {
  NO_PROGRESS_LIMIT,
  applyExtraction,
  draftStart,
  listAnd,
  missingFields,
  type Issue,
} from './booking-draft.js';

/** How much conversation the model sees. Facts older than this live on in the structured draft. */
export const HISTORY_WINDOW = 10;

interface TurnDecision {
  draft: BookingDraft;
  state: ChatState;
  failedTurns: number;
  content: string;
  metadata: MessageMetadata;
}

/** Model replies must never claim a booking happened: only the Confirm button books. */
const CLAIMS_BOOKING = /\b(booked|confirmed|scheduled|reserved|all set)\b/i;

/**
 * Orchestrates one conversational turn: AI extraction -> business validation -> next state -> reply.
 * Owns the business rules; knows nothing about which LLM is used.
 */
export function createBookingAssistant(deps: {
  business: BusinessDto;
  services: ServicesRepository;
  availability: AvailabilityService;
  extractor: BookingExtractor;
  chat: ChatRepository;
  events: EventBus;
  logger: Logger;
  aiEnabled: boolean;
  now: () => Date;
}) {
  const { business } = deps;
  const tz = business.timezone;

  function welcome(): { content: string; metadata: MessageMetadata } {
    return {
      content: `Hi! I'm the ${business.name} booking assistant. Tell me what you'd like to book and when, for example "a cleaning tomorrow at 3pm".`,
      metadata: { suggestions: ['Book a checkup tomorrow morning', 'What services do you offer?', 'Cleaning next Monday at 11am'] },
    };
  }

  function fallback(draft: BookingDraft, reason: NonNullable<MessageMetadata['fallbackReason']>, intro: string): Pick<TurnDecision, 'content' | 'metadata'> {
    const hasDraft = Boolean(draft.serviceId || draft.date || draft.time);
    return {
      content: `${intro} ${hasDraft ? "You can finish in the booking form; I've filled in what I have so far." : 'You can use the booking form instead.'}`,
      metadata: { card: 'fallback_form', draft, fallbackReason: reason },
    };
  }

  async function timeSuggestions(services: ServiceDto[], draft: BookingDraft): Promise<string[]> {
    const service = services.find((s) => s.id === draft.serviceId);
    if (!service || !draft.date) return [];
    const slots = await deps.availability.slotsFor(service, draft.date);
    return slots.slice(0, 4).map((s) => formatTime(DateTime.fromISO(s, { zone: tz })));
  }

  async function nextQuestion(services: ServiceDto[], draft: BookingDraft): Promise<{ text: string; suggestions: string[] }> {
    const missing = missingFields(draft);
    if (missing[0] === 'service') {
      return {
        text: `Which service would you like? We offer ${listAnd(services.map((s) => s.name))}.`,
        suggestions: services.map((s) => s.name),
      };
    }
    if (missing[0] === 'date') {
      return { text: `What day suits you for your ${draft.serviceName}? We're open ${describeHours(business)}.`, suggestions: ['Tomorrow', 'This Saturday', 'Next Monday'] };
    }
    const suggestions = await timeSuggestions(services, draft);
    const day = DateTime.fromISO(draft.date!, { zone: tz });
    return {
      text: suggestions.length
        ? `What time on ${formatDate(day)}? Here are some free times.`
        : `Sorry, ${formatDate(day)} is fully booked. Could you pick another day?`,
      suggestions,
    };
  }

  function summary(draft: BookingDraft, start: DateTime): string {
    return `Here's your booking: ${draft.serviceName} on ${formatDate(start)} at ${formatTime(start)} (${draft.durationMinutes} min). Tap Confirm to book it, or Edit to change anything.`;
  }

  /** Validates a complete draft against hours and live availability. */
  async function finalize(
    services: ServiceDto[],
    draft: BookingDraft,
    issues: Issue[],
  ): Promise<{ draft: BookingDraft; alternatives: string[] }> {
    const service = services.find((s) => s.id === draft.serviceId);
    const start = draftStart(draft, tz);
    if (!service || !start) return { draft, alternatives: [] };

    const problem = checkSlotRules({ business, durationMinutes: service.durationMinutes, startsAt: start, now: deps.now() });
    if (problem) {
      issues.push({ field: 'time', message: `${problem.message}.`.replace('..', '.') });
      const { time: _t, ...rest } = draft;
      return { draft: rest, alternatives: [] };
    }
    if (!(await deps.availability.isFree(service, start))) {
      issues.push({ field: 'time', message: `Sorry, ${formatTime(start)} on ${formatDate(start)} is already taken.` });
      const alternatives = await deps.availability.alternatives(service, start);
      const { time: _t, ...rest } = draft;
      return { draft: rest, alternatives };
    }
    return { draft: { ...draft, startsAt: toIso(start) }, alternatives: [] };
  }

  async function decide(session: SessionRecord, userId: string): Promise<TurnDecision> {
    // A finished booking starts a fresh draft for the next one.
    const startingDraft: BookingDraft = session.state === 'booked' ? {} : session.draft;
    const failedTurns = session.state === 'booked' ? 0 : session.failedTurns;
    const baseState: ChatState = session.state === 'booked' || session.state === 'closed' ? 'collecting' : session.state;

    if (!deps.aiEnabled) {
      return { draft: startingDraft, state: baseState, failedTurns, ...fallback(startingDraft, 'ai_disabled', 'The assistant is offline right now.') };
    }

    const services = await deps.services.listActive(business.id);
    const history = (await deps.chat.recentMessages(session.id, HISTORY_WINDOW)).map((m) => ({
      role: m.role,
      content: m.content,
    }));
    const result = await deps.extractor.extract({
      business,
      services,
      draft: startingDraft,
      history,
      now: deps.now(),
      userId,
      sessionId: session.id,
    });

    if (!result.ok) {
      const intro =
        result.reason === 'ai_error'
          ? "Sorry, I'm having trouble thinking right now."
          : "Sorry, I didn't quite catch that.";
      return { draft: startingDraft, state: baseState, failedTurns, ...fallback(startingDraft, result.reason, intro) };
    }

    const ex: Extraction = result.extraction;
    const hasFields = Boolean(ex.fields.service || ex.fields.date || ex.fields.time || ex.fields.notes);
    const modelReply = ex.reply && !CLAIMS_BOOKING.test(ex.reply) ? ex.reply : null;

    // Questions and small talk: answer, keep the draft, don't count as a failed booking turn.
    if (!hasFields && (ex.intent === 'question' || ex.intent === 'smalltalk' || ex.intent === 'out_of_scope')) {
      const q = await nextQuestion(services, startingDraft);
      const reply =
        ex.intent === 'out_of_scope'
          ? `I can only help with booking appointments at ${business.name}. ${q.text}`
          : (modelReply ?? q.text);
      return {
        draft: startingDraft,
        state: baseState,
        failedTurns,
        content: reply,
        metadata: { suggestions: q.suggestions.slice(0, 4) },
      };
    }

    // "Yes, book it": the AI never books. Re-show the summary so the user presses Confirm.
    if (!hasFields && ex.intent === 'confirm' && baseState === 'confirming' && startingDraft.startsAt) {
      const start = DateTime.fromISO(startingDraft.startsAt, { zone: tz });
      return {
        draft: startingDraft,
        state: 'confirming',
        failedTurns: 0,
        content: `Great! Just tap Confirm below to book ${startingDraft.serviceName} on ${formatDate(start)} at ${formatTime(start)}.`,
        metadata: { card: 'booking_summary', draft: startingDraft },
      };
    }

    const applied = applyExtraction(startingDraft, ex.fields, { business, services, now: deps.now() });
    const { draft, alternatives } = await finalize(services, applied.draft, applied.issues);

    if (draft.startsAt) {
      const start = DateTime.fromISO(draft.startsAt, { zone: tz });
      return {
        draft,
        state: 'confirming',
        failedTurns: 0,
        content: summary(draft, start),
        metadata: { card: 'booking_summary', draft },
      };
    }

    // A turn that changed nothing in the draft is "no progress". Two in a row -> offer the form.
    const nextFailed = applied.changed ? 0 : failedTurns + 1;
    if (nextFailed >= NO_PROGRESS_LIMIT) {
      return { draft, state: 'collecting', failedTurns: nextFailed, ...fallback(draft, 'no_progress', "Let's make this easier.") };
    }

    const q = await nextQuestion(services, draft);
    let content: string;
    let suggestions = q.suggestions;
    if (applied.issues.length > 0) {
      content = `${applied.issues.map((i) => i.message).join(' ')} ${alternatives.length ? 'Here are the closest free times.' : q.text}`;
      if (alternatives.length) {
        suggestions = alternatives.map((iso) => {
          const dt = DateTime.fromISO(iso, { zone: tz });
          return `${formatDate(dt)} at ${formatTime(dt)}`;
        });
      }
    } else {
      content = modelReply ?? q.text;
    }

    return {
      draft,
      state: 'collecting',
      failedTurns: nextFailed,
      content,
      metadata: { suggestions: suggestions.slice(0, 4), draft, ...(alternatives.length ? { alternatives } : {}) },
    };
  }

  return {
    welcome,

    async handleTurn(session: SessionRecord, userId: string): Promise<void> {
      deps.events.emit('chat.typing', { userId, sessionId: session.id, isTyping: true });
      let decision: TurnDecision;
      try {
        decision = await decide(session, userId);
      } catch (err) {
        deps.logger.error({ err, sessionId: session.id }, 'chat turn failed');
        decision = {
          draft: session.draft,
          state: session.state === 'booked' ? 'collecting' : session.state,
          failedTurns: session.failedTurns,
          ...fallback(session.draft, 'ai_error', 'Sorry, something went wrong on my side.'),
        };
      }
      try {
        const message = await deps.chat.completeTurn(session.id, decision);
        deps.events.emit('chat.message', {
          userId,
          sessionId: session.id,
          message,
          draft: decision.draft,
          state: decision.state,
        });
      } catch (err) {
        deps.logger.error({ err, sessionId: session.id }, 'failed to store assistant reply');
        await deps.chat.releaseClaim(session.id).catch(() => undefined);
      } finally {
        deps.events.emit('chat.typing', { userId, sessionId: session.id, isTyping: false });
      }
    },
  };
}

export type BookingAssistant = ReturnType<typeof createBookingAssistant>;
