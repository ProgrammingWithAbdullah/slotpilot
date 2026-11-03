import { DateTime } from 'luxon';
import { z } from 'zod';
import type { BookingDraft, BusinessDto, ServiceDto } from '@slotpilot/shared';
import type { Logger } from '../../lib/logger.js';
import { describeHours } from '../catalog/availability.js';
import type { AiLogRepository, AiInteraction } from './ai-log.repository.js';
import { LlmError, type LlmMessage, type LlmProvider, type ResponseSchema } from './llm-provider.js';
import { PROMPT_VERSION, bookingSystemPrompt } from './prompts/booking-system.js';

const nullableText = (max: number) =>
  z
    .string()
    .nullish()
    .transform((v) => {
      const t = v?.trim();
      return t ? t.slice(0, max) : null;
    });

/** What we accept from the model. Anything else is rejected as invalid output. */
export const extractionSchema = z.object({
  intent: z.enum(['book', 'confirm', 'question', 'smalltalk', 'out_of_scope']),
  fields: z
    .object({
      service: nullableText(80),
      date: nullableText(10),
      time: nullableText(5),
      notes: nullableText(500),
    })
    .default({ service: null, date: null, time: null, notes: null }),
  reply: z
    .string()
    .default('')
    .transform((s) => s.trim().slice(0, 400)),
});
export type Extraction = z.infer<typeof extractionSchema>;

const responseSchema: ResponseSchema = {
  type: 'object',
  properties: {
    intent: { type: 'string', enum: ['book', 'confirm', 'question', 'smalltalk', 'out_of_scope'] },
    fields: {
      type: 'object',
      properties: {
        service: { type: 'string', nullable: true },
        date: { type: 'string', nullable: true, description: 'YYYY-MM-DD' },
        time: { type: 'string', nullable: true, description: 'HH:mm, 24-hour' },
        notes: { type: 'string', nullable: true },
      },
      required: ['service', 'date', 'time', 'notes'],
    },
    reply: { type: 'string' },
  },
  required: ['intent', 'fields', 'reply'],
};

export type ExtractionResult =
  | { ok: true; extraction: Extraction }
  | { ok: false; reason: 'ai_error' | 'invalid_output' };

export interface ExtractionContext {
  business: BusinessDto;
  services: ServiceDto[];
  draft: BookingDraft;
  history: LlmMessage[];
  now: Date;
  userId?: string;
  sessionId?: string;
}

/**
 * Turns conversation text into candidate booking fields. It knows about prompts and JSON,
 * and nothing about business rules or the database (apart from logging its own calls).
 */
export function createBookingExtractor(deps: {
  provider: LlmProvider;
  aiLog: AiLogRepository;
  logger: Logger;
}) {
  async function log(entry: AiInteraction) {
    deps.logger.info(
      {
        ai: {
          provider: entry.provider,
          model: entry.model,
          status: entry.status,
          latencyMs: entry.latencyMs,
          promptTokens: entry.promptTokens,
          completionTokens: entry.completionTokens,
          sessionId: entry.sessionId,
          error: entry.errorMessage,
        },
      },
      'ai interaction',
    );
    // Logging must never break the conversation.
    await deps.aiLog.insert(entry).catch((err: unknown) => deps.logger.error({ err }, 'failed to store ai log'));
  }

  return {
    async extract(ctx: ExtractionContext): Promise<ExtractionResult> {
      const local = DateTime.fromJSDate(ctx.now).setZone(ctx.business.timezone);
      const system = bookingSystemPrompt({
        business: ctx.business,
        services: ctx.services,
        draft: ctx.draft,
        today: local.toISODate()!,
        weekday: local.toFormat('cccc'),
        localTime: local.toFormat('HH:mm'),
        hoursText: describeHours(ctx.business),
      });
      const lastUser = [...ctx.history].reverse().find((m) => m.role === 'user')?.content;
      const base = {
        businessId: ctx.business.id,
        userId: ctx.userId,
        sessionId: ctx.sessionId,
        provider: deps.provider.name,
        promptVersion: PROMPT_VERSION,
        inputExcerpt: lastUser,
      };

      const started = performance.now();
      let raw: string;
      let model = deps.provider.defaultModel;
      let usage: { promptTokens?: number; completionTokens?: number } | undefined;
      try {
        const res = await deps.provider.complete({
          system,
          messages: ctx.history,
          responseSchema,
          temperature: 0, // extraction, not creativity: deterministic and reproducible
          maxOutputTokens: 512,
        });
        raw = res.text;
        model = res.model;
        usage = res.usage;
      } catch (err) {
        const kind = err instanceof LlmError ? err.kind : 'provider_error';
        await log({
          ...base,
          model: err instanceof LlmError && err.model ? err.model : model,
          status: kind,
          latencyMs: Math.round(performance.now() - started),
          errorMessage: (err as Error).message,
        });
        return { ok: false, reason: 'ai_error' };
      }

      const latencyMs = Math.round(performance.now() - started);
      let json: unknown;
      try {
        json = JSON.parse(raw);
      } catch {
        await log({ ...base, model, status: 'invalid_output', latencyMs, rawOutput: raw, errorMessage: 'not JSON', ...usageOf(usage) });
        return { ok: false, reason: 'invalid_output' };
      }
      const parsed = extractionSchema.safeParse(json);
      if (!parsed.success) {
        await log({
          ...base,
          model,
          status: 'invalid_output',
          latencyMs,
          rawOutput: raw,
          errorMessage: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
          ...usageOf(usage),
        });
        return { ok: false, reason: 'invalid_output' };
      }

      await log({ ...base, model, status: 'ok', latencyMs, rawOutput: raw, parsedOutput: parsed.data, ...usageOf(usage) });
      return { ok: true, extraction: parsed.data };
    },
  };
}

function usageOf(u?: { promptTokens?: number; completionTokens?: number }) {
  return { promptTokens: u?.promptTokens, completionTokens: u?.completionTokens };
}

export type BookingExtractor = ReturnType<typeof createBookingExtractor>;
