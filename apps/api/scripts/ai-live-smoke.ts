/**
 * Live smoke test against the real Gemini API (not part of CI: it needs a key and costs quota).
 *   npm run test:ai-live -w @slotpilot/api
 * Sends a few typical messages through the real prompt + schema and prints what came back.
 */
import type { BookingDraft, BusinessDto, ServiceDto } from '@slotpilot/shared';
import { createGeminiProvider } from '../src/modules/ai/gemini.provider.js';
import { createBookingExtractor } from '../src/modules/ai/booking-extractor.js';
import type { AiLogRepository } from '../src/modules/ai/ai-log.repository.js';
import { createLogger } from '../src/lib/logger.js';

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error('GEMINI_API_KEY is not set (put it in .env)');
  process.exit(1);
}

const business: BusinessDto = {
  id: 'b1',
  name: 'Bright Smile Dental',
  slug: 'bright-smile-dental',
  timezone: 'Asia/Karachi',
  opensAt: '09:00',
  closesAt: '17:00',
  openDays: [1, 2, 3, 4, 5, 6],
  slotIntervalMinutes: 30,
};
const services: ServiceDto[] = [
  { id: 's1', name: 'Checkup', description: null, durationMinutes: 30, priceCents: 3000 },
  { id: 's2', name: 'Cleaning', description: null, durationMinutes: 45, priceCents: 5000 },
  { id: 's3', name: 'Whitening', description: null, durationMinutes: 60, priceCents: 12000 },
];
const emptyDraft = {} as BookingDraft;

const cases = [
  'I need a cleaning tomorrow at 3pm',
  'can I come in next friday morning for a checkup? around 10:30',
  'what are your opening hours?',
  'write me a poem about the sea',
  'yes, book it',
];

const aiLog = { insert: async () => {} } as unknown as AiLogRepository;
const logger = createLogger({ level: 'warn', pretty: true });
const models = (process.env.GEMINI_MODELS ?? 'gemini-3.5-flash-lite,gemini-flash-lite-latest')
  .split(',')
  .map((m) => m.trim());
const extractor = createBookingExtractor({
  provider: createGeminiProvider({ apiKey, models, timeoutMs: Number(process.env.AI_TIMEOUT_MS ?? 8000) }),
  aiLog,
  logger,
});

let failures = 0;
for (const text of cases) {
  const started = Date.now();
  const result = await extractor.extract({
    business,
    services,
    draft: emptyDraft,
    history: [{ role: 'user', content: text }],
    now: new Date(),
  });
  const ms = Date.now() - started;
  if (!result.ok) failures++;
  console.log(`\n> ${text}  (${ms} ms)`);
  console.log(result.ok ? JSON.stringify(result.extraction, null, 2) : `FAILED: ${result.reason}`);
}
process.exitCode = failures ? 1 : 0;
