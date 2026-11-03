import { describe, expect, it, vi } from 'vitest';
import type { BusinessDto } from '@slotpilot/shared';
import { createBookingExtractor } from '../../src/modules/ai/booking-extractor.js';
import { LlmError, type LlmProvider } from '../../src/modules/ai/llm-provider.js';
import { createLogger } from '../../src/lib/logger.js';

const business: BusinessDto = {
  id: 'b',
  name: 'Test Clinic',
  slug: 'test',
  timezone: 'Asia/Karachi',
  opensAt: '09:00',
  closesAt: '17:00',
  openDays: [1, 2, 3, 4, 5, 6],
  slotIntervalMinutes: 30,
};
const ctx = {
  business,
  services: [{ id: 's', name: 'Cleaning', description: null, durationMinutes: 45, priceCents: null }],
  draft: {},
  history: [{ role: 'user' as const, content: 'cleaning tomorrow at 3pm' }],
  now: new Date('2030-01-07T03:00:00Z'),
  sessionId: 'sess',
};

function setup(complete: LlmProvider['complete']) {
  const insert = vi.fn().mockResolvedValue(undefined);
  const provider: LlmProvider = { name: 'fake', defaultModel: 'fake-1', complete: vi.fn(complete) };
  const extractor = createBookingExtractor({ provider, aiLog: { insert }, logger: createLogger({ level: 'silent', pretty: false }) });
  return { extractor, insert, provider };
}

describe('BookingExtractor', () => {
  it('parses valid output, normalises empty strings to null, and logs an ok interaction', async () => {
    const { extractor, insert, provider } = setup(async () => ({
      model: 'fake-1',
      text: JSON.stringify({
        intent: 'book',
        fields: { service: 'Cleaning', date: '2030-01-08', time: '15:00', notes: '  ' },
        reply: 'Sure!',
        extra: 'ignored',
      }),
    }));
    const r = await extractor.extract(ctx);
    expect(r).toEqual({
      ok: true,
      extraction: { intent: 'book', fields: { service: 'Cleaning', date: '2030-01-08', time: '15:00', notes: null }, reply: 'Sure!' },
    });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ status: 'ok', provider: 'fake', sessionId: 'sess' }));
    const call = vi.mocked(provider.complete).mock.calls[0]![0];
    expect(call.temperature).toBe(0);
    expect(call.system).toContain('TODAY: 2030-01-07 (Monday)');
    expect(call.system).toContain('- Cleaning (45 min)');
  });

  it('rejects non-JSON output', async () => {
    const { extractor, insert } = setup(async () => ({ model: 'm', text: 'Sure, booked you in!' }));
    expect(await extractor.extract(ctx)).toEqual({ ok: false, reason: 'invalid_output' });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ status: 'invalid_output', rawOutput: 'Sure, booked you in!' }));
  });

  it('rejects JSON with the wrong shape', async () => {
    const { extractor } = setup(async () => ({ model: 'm', text: '{"intent":"hack","reply":"x"}' }));
    expect(await extractor.extract(ctx)).toEqual({ ok: false, reason: 'invalid_output' });
  });

  it('turns provider failures into ai_error and logs the error kind', async () => {
    const { extractor, insert } = setup(async () => {
      throw new LlmError('rate_limited', 'HTTP 429', true, 'fake-1');
    });
    expect(await extractor.extract(ctx)).toEqual({ ok: false, reason: 'ai_error' });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ status: 'rate_limited', errorMessage: 'HTTP 429' }));
  });

  it('still answers if writing the log fails', async () => {
    const { extractor, insert } = setup(async () => ({ model: 'm', text: '{"intent":"smalltalk","fields":{},"reply":"hi"}' }));
    insert.mockRejectedValueOnce(new Error('db down'));
    await expect(extractor.extract(ctx)).resolves.toMatchObject({ ok: true });
  });
});
