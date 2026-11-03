import { z } from 'zod';

const booleanString = z
  .enum(['true', 'false'])
  .transform((v) => v === 'true')
  .optional();

/**
 * Every environment variable the API reads, validated once at boot.
 * If something is missing or malformed the process refuses to start (fail fast).
 */
const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    CLIENT_ORIGIN: z.string().default('http://localhost:5173'),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    DATABASE_SSL: booleanString,
    DB_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),
    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
    JWT_EXPIRES_IN_HOURS: z.coerce
      .number()
      .int()
      .min(1)
      .max(24 * 30)
      .default(24),
    DEFAULT_BUSINESS_SLUG: z.string().default('bright-smile-dental'),
    AI_PROVIDER: z.enum(['gemini', 'mock']).default('gemini'),
    GEMINI_API_KEY: z.string().optional(),
    // Comma separated: the first is preferred, the rest are tried when it is overloaded.
    GEMINI_MODELS: z.string().default('gemini-3.5-flash-lite,gemini-flash-lite-latest'),
    AI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(8000),
    WEB_DIST_DIR: z.string().optional(),
    RATE_LIMIT_GLOBAL_PER_15MIN: z.coerce.number().int().positive().default(600),
    RATE_LIMIT_AUTH_PER_15MIN: z.coerce.number().int().positive().default(20),
    RATE_LIMIT_CHAT_PER_MIN: z.coerce.number().int().positive().default(20),
    RATE_LIMIT_BOOKING_PER_HOUR: z.coerce.number().int().positive().default(30),
  })
  .transform((e) => ({
    ...e,
    isProduction: e.NODE_ENV === 'production',
    geminiModels: e.GEMINI_MODELS.split(',')
      .map((m) => m.trim())
      .filter(Boolean),
    // Without a key the app still works: the assistant hands users to the form.
    aiEnabled: e.AI_PROVIDER === 'mock' || Boolean(e.GEMINI_API_KEY),
  }));

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    // eslint-disable-next-line no-console
    console.error(`Invalid environment configuration:\n${problems.join('\n')}`);
    process.exit(1);
  }
  return parsed.data;
}
