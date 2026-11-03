import type { Queryable } from '../../db/pool.js';

export interface AiInteraction {
  businessId: string;
  userId?: string;
  sessionId?: string;
  provider: string;
  model: string;
  promptVersion: string;
  status: 'ok' | 'invalid_output' | 'timeout' | 'provider_error' | 'rate_limited';
  latencyMs: number;
  promptTokens?: number;
  completionTokens?: number;
  inputExcerpt?: string;
  rawOutput?: string;
  parsedOutput?: unknown;
  errorMessage?: string;
}

/** The AI module's only database access: its own audit log. */
export function createAiLogRepository(db: Queryable) {
  return {
    async insert(i: AiInteraction): Promise<void> {
      await db.query(
        `INSERT INTO ai_interactions (business_id, user_id, session_id, provider, model, prompt_version, status,
           latency_ms, prompt_tokens, completion_tokens, input_excerpt, raw_output, parsed_output, error_message)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          i.businessId,
          i.userId ?? null,
          i.sessionId ?? null,
          i.provider,
          i.model,
          i.promptVersion,
          i.status,
          i.latencyMs,
          i.promptTokens ?? null,
          i.completionTokens ?? null,
          i.inputExcerpt?.slice(0, 500) ?? null,
          i.rawOutput?.slice(0, 4000) ?? null,
          i.parsedOutput === undefined ? null : JSON.stringify(i.parsedOutput),
          i.errorMessage?.slice(0, 500) ?? null,
        ],
      );
    },
  };
}

export type AiLogRepository = ReturnType<typeof createAiLogRepository>;
