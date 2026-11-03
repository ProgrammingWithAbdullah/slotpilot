/**
 * Provider-agnostic LLM interface. Business code depends on this, never on a vendor SDK,
 * so switching Mistral -> Gemini (which this project did) or adding OpenAI is one new class.
 */
export interface LlmMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** OpenAPI-3.0-style schema subset (what Gemini's responseSchema accepts). */
export interface ResponseSchema {
  type: 'object' | 'string' | 'number' | 'boolean' | 'array';
  properties?: Record<string, ResponseSchema>;
  required?: string[];
  enum?: string[];
  nullable?: boolean;
  items?: ResponseSchema;
  description?: string;
}

export interface LlmRequest {
  system: string;
  messages: LlmMessage[];
  responseSchema: ResponseSchema;
  temperature: number;
  maxOutputTokens: number;
}

export interface LlmResponse {
  text: string;
  model: string;
  usage?: { promptTokens?: number; completionTokens?: number };
}

export type LlmErrorKind = 'timeout' | 'rate_limited' | 'provider_error';

export class LlmError extends Error {
  constructor(
    readonly kind: LlmErrorKind,
    message: string,
    readonly retryable: boolean,
    readonly model?: string,
  ) {
    super(message);
    this.name = 'LlmError';
  }
}

export interface LlmProvider {
  readonly name: string;
  /** Model used when nothing else is known (for logging failures). */
  readonly defaultModel: string;
  complete(req: LlmRequest): Promise<LlmResponse>;
}
