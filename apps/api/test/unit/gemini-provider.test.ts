import { describe, expect, it, vi } from 'vitest';
import { createGeminiProvider } from '../../src/modules/ai/gemini.provider.js';
import { LlmError, type LlmRequest } from '../../src/modules/ai/llm-provider.js';

const req: LlmRequest = {
  system: 'sys',
  messages: [
    { role: 'assistant', content: 'welcome' },
    { role: 'user', content: 'hi' },
  ],
  responseSchema: { type: 'object' },
  temperature: 0,
  maxOutputTokens: 100,
};

const ok = (text: string, extra: object = {}) =>
  new Response(
    JSON.stringify({
      candidates: [{ content: { parts: [{ text: 'thinking...', thought: true }, { text }] } }],
      usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 5 },
      modelVersion: 'gemini-x',
      ...extra,
    }),
    { status: 200 },
  );
const fail = (status: number) => new Response(JSON.stringify({ error: { message: `boom ${status}` } }), { status });
const noSleep = () => Promise.resolve();

describe('Gemini provider', () => {
  it('returns text (ignoring thought parts), usage and model, and sends a user-first conversation', async () => {
    const fetchFn = vi.fn().mockResolvedValue(ok('{"a":1}'));
    const p = createGeminiProvider({ apiKey: 'k', models: ['m1'], timeoutMs: 1000, fetchFn, sleep: noSleep });
    const res = await p.complete(req);
    expect(res).toEqual({ text: '{"a":1}', model: 'gemini-x', usage: { promptTokens: 12, completionTokens: 5 } });
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toContain('/models/m1:generateContent');
    expect(init.headers['x-goog-api-key']).toBe('k');
    const body = JSON.parse(init.body);
    expect(body.contents).toEqual([{ role: 'user', parts: [{ text: 'hi' }] }]);
    expect(body.generationConfig).toMatchObject({ temperature: 0, responseMimeType: 'application/json' });
  });

  it('falls back to the next model when the first is overloaded', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(fail(503)).mockResolvedValueOnce(ok('{}'));
    const p = createGeminiProvider({ apiKey: 'k', models: ['m1', 'm2'], timeoutMs: 1000, fetchFn, sleep: noSleep });
    await expect(p.complete(req)).resolves.toMatchObject({ text: '{}' });
    expect(fetchFn.mock.calls[1]![0]).toContain('/models/m2:');
  });

  it('retries a single model once on 429', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(fail(429)).mockResolvedValueOnce(ok('{}'));
    const p = createGeminiProvider({ apiKey: 'k', models: ['m1'], timeoutMs: 1000, fetchFn, sleep: noSleep });
    await expect(p.complete(req)).resolves.toMatchObject({ text: '{}' });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('does not retry client errors such as a bad key', async () => {
    const fetchFn = vi.fn().mockResolvedValue(fail(403));
    const p = createGeminiProvider({ apiKey: 'k', models: ['m1', 'm2'], timeoutMs: 1000, fetchFn, sleep: noSleep });
    await expect(p.complete(req)).rejects.toMatchObject({ kind: 'provider_error', retryable: false });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('maps timeouts to a retryable timeout error', async () => {
    const timeout = Object.assign(new Error('aborted'), { name: 'TimeoutError' });
    const fetchFn = vi.fn().mockRejectedValue(timeout);
    const p = createGeminiProvider({ apiKey: 'k', models: ['m1'], timeoutMs: 1000, fetchFn, sleep: noSleep });
    const err = await p.complete(req).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LlmError);
    expect(err).toMatchObject({ kind: 'timeout' });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('treats an empty candidate (e.g. safety block) as an error', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ candidates: [{ finishReason: 'SAFETY' }] }), { status: 200 }),
    );
    const p = createGeminiProvider({ apiKey: 'k', models: ['m1'], timeoutMs: 1000, fetchFn, sleep: noSleep });
    await expect(p.complete(req)).rejects.toThrow(/SAFETY/);
  });
});
