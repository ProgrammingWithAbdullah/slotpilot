import { LlmError, type LlmMessage, type LlmProvider, type LlmRequest, type LlmResponse } from './llm-provider.js';

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

interface GeminiPart {
  text?: string;
  thought?: boolean;
}
interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: GeminiPart[] }; finishReason?: string }>;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  modelVersion?: string;
  error?: { message?: string };
}

/** Gemini wants alternating turns that start with the user. */
function toContents(messages: LlmMessage[]) {
  const trimmed = [...messages];
  while (trimmed[0]?.role === 'assistant') trimmed.shift();
  const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];
  for (const m of trimmed) {
    const role = m.role === 'assistant' ? 'model' : 'user';
    const last = contents[contents.length - 1];
    if (last?.role === role) last.parts.push({ text: m.content });
    else contents.push({ role, parts: [{ text: m.content }] });
  }
  return contents;
}

/**
 * Google Gemini via the REST API (plain fetch: explicit timeout and error mapping, no SDK magic).
 * Resilience: each model gets one attempt with a timeout; on a retryable failure (timeout, 429, 5xx,
 * model retired) we move to the next model in the list. With a single model we retry it once.
 */
export function createGeminiProvider(opts: {
  apiKey: string;
  models: string[];
  timeoutMs: number;
  fetchFn?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}): LlmProvider {
  const fetchFn = opts.fetchFn ?? fetch;
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const attempts = opts.models.length > 1 ? opts.models : [opts.models[0]!, opts.models[0]!];

  async function callOnce(model: string, req: LlmRequest): Promise<LlmResponse> {
    let res: Response;
    try {
      res = await fetchFn(`${BASE_URL}/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': opts.apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: req.system }] },
          contents: toContents(req.messages),
          generationConfig: {
            temperature: req.temperature,
            maxOutputTokens: req.maxOutputTokens,
            responseMimeType: 'application/json',
            responseSchema: req.responseSchema,
          },
        }),
        signal: AbortSignal.timeout(opts.timeoutMs),
      });
    } catch (err) {
      const name = (err as Error).name;
      if (name === 'TimeoutError' || name === 'AbortError') {
        throw new LlmError('timeout', `Gemini timed out after ${opts.timeoutMs}ms`, true, model);
      }
      throw new LlmError('provider_error', `Network error: ${(err as Error).message}`, true, model);
    }

    const body = (await res.json().catch(() => ({}))) as GeminiResponse;
    if (!res.ok) {
      const msg = `Gemini HTTP ${res.status}: ${body.error?.message ?? 'no message'}`.slice(0, 300);
      if (res.status === 429) throw new LlmError('rate_limited', msg, true, model);
      // 404 = model retired for this key; 5xx = overloaded. Both are worth trying another model.
      if (res.status >= 500 || res.status === 404) throw new LlmError('provider_error', msg, true, model);
      // 400/401/403: our request or key is wrong; retrying won't help.
      throw new LlmError('provider_error', msg, false, model);
    }

    const candidate = body.candidates?.[0];
    const text = (candidate?.content?.parts ?? [])
      .filter((p) => !p.thought && typeof p.text === 'string')
      .map((p) => p.text)
      .join('');
    if (!text) {
      throw new LlmError(
        'provider_error',
        `Empty response (finishReason: ${candidate?.finishReason ?? 'unknown'})`,
        false,
        model,
      );
    }
    return {
      text,
      model: body.modelVersion ?? model,
      usage: {
        promptTokens: body.usageMetadata?.promptTokenCount,
        completionTokens: body.usageMetadata?.candidatesTokenCount,
      },
    };
  }

  return {
    name: 'gemini',
    defaultModel: opts.models[0]!,
    async complete(req) {
      let lastError: unknown;
      for (let i = 0; i < attempts.length; i++) {
        try {
          return await callOnce(attempts[i]!, req);
        } catch (err) {
          lastError = err;
          const retryable = err instanceof LlmError && err.retryable;
          if (!retryable || i === attempts.length - 1) break;
          await sleep(250 + Math.floor(Math.random() * 250)); // small jittered backoff
        }
      }
      throw lastError;
    },
  };
}
