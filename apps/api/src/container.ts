import type pg from 'pg';
import type { BusinessDto } from '@slotpilot/shared';
import type { Env } from './config/env.js';
import { BackgroundTasks } from './lib/async.js';
import { EventBus } from './lib/events.js';
import type { Logger } from './lib/logger.js';
import { createRateLimiters } from './middleware/rate-limit.js';
import { createAuthService } from './modules/auth/auth.service.js';
import { createTokenService } from './modules/auth/token.service.js';
import { createUsersRepository } from './modules/auth/users.repository.js';
import { createBusinessRepository } from './modules/catalog/business.repository.js';
import { createServicesRepository } from './modules/catalog/services.repository.js';
import { createAvailabilityService } from './modules/catalog/availability.service.js';
import { createAppointmentsRepository } from './modules/appointments/appointments.repository.js';
import { createAppointmentsService } from './modules/appointments/appointments.service.js';
import { createAiLogRepository } from './modules/ai/ai-log.repository.js';
import { createBookingExtractor } from './modules/ai/booking-extractor.js';
import { createGeminiProvider } from './modules/ai/gemini.provider.js';
import type { LlmProvider } from './modules/ai/llm-provider.js';
import { createMockProvider } from './modules/ai/mock.provider.js';
import { createBookingAssistant } from './modules/chat/booking-assistant.js';
import { createChatRepository } from './modules/chat/chat.repository.js';
import { createChatService } from './modules/chat/chat.service.js';

export interface ContainerOverrides {
  llmProvider?: LlmProvider;
  now?: () => Date;
  bcryptCost?: number;
}

/**
 * Composition root: the one place that knows how everything is wired.
 * Plain factory functions instead of a DI framework; tests swap pieces via overrides.
 */
export async function createContainer(env: Env, pool: pg.Pool, logger: Logger, overrides: ContainerOverrides = {}) {
  const now = overrides.now ?? (() => new Date());
  const events = new EventBus();
  const tasks = new BackgroundTasks();

  const business: BusinessDto | null = await createBusinessRepository(pool).findBySlug(env.DEFAULT_BUSINESS_SLUG);
  if (!business) {
    throw new Error(
      `Business "${env.DEFAULT_BUSINESS_SLUG}" not found. Did you run "npm run db:migrate && npm run db:seed"?`,
    );
  }

  const users = createUsersRepository(pool);
  const servicesRepo = createServicesRepository(pool);
  const appointmentsRepo = createAppointmentsRepository(pool);
  const chatRepo = createChatRepository(pool);
  const tokens = createTokenService({ secret: env.JWT_SECRET, expiresInHours: env.JWT_EXPIRES_IN_HOURS });

  const availability = createAvailabilityService({ business, services: servicesRepo, appointments: appointmentsRepo, now });

  const provider: LlmProvider =
    overrides.llmProvider ??
    (env.AI_PROVIDER === 'mock' || !env.GEMINI_API_KEY
      ? createMockProvider()
      : createGeminiProvider({ apiKey: env.GEMINI_API_KEY, models: env.geminiModels, timeoutMs: env.AI_TIMEOUT_MS }));

  const extractor = createBookingExtractor({ provider, aiLog: createAiLogRepository(pool), logger });
  const assistant = createBookingAssistant({
    business,
    services: servicesRepo,
    availability,
    extractor,
    chat: chatRepo,
    events,
    logger,
    aiEnabled: Boolean(overrides.llmProvider) || env.aiEnabled,
    now,
  });

  return {
    env,
    pool,
    logger,
    events,
    tasks,
    business,
    tokens,
    servicesRepo,
    availability,
    limiters: createRateLimiters({
      globalPer15Min: env.RATE_LIMIT_GLOBAL_PER_15MIN,
      authPer15Min: env.RATE_LIMIT_AUTH_PER_15MIN,
      chatPerMin: env.RATE_LIMIT_CHAT_PER_MIN,
      bookingPerHour: env.RATE_LIMIT_BOOKING_PER_HOUR,
    }),
    auth: createAuthService({ users, tokens, logger, bcryptCost: overrides.bcryptCost }),
    appointments: createAppointmentsService({
      business,
      appointments: appointmentsRepo,
      services: servicesRepo,
      availability,
      chatSessions: chatRepo,
      events,
      logger,
      now,
    }),
    chat: createChatService({ business, chat: chatRepo, assistant, events, tasks, logger }),
    aiProviderName: provider.name,
  };
}

export type Container = Awaited<ReturnType<typeof createContainer>>;
