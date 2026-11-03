// Deterministic test environment. Integration tests use a separate database.
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://slotpilot:slotpilot@localhost:5432/slotpilot_test';
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-123456';
process.env.DEFAULT_BUSINESS_SLUG = 'test-clinic';
process.env.AI_PROVIDER = 'mock';
delete process.env.GEMINI_API_KEY;
// Generous limits so tests aren't throttled; the rate-limit tests lower them explicitly.
process.env.RATE_LIMIT_AUTH_PER_15MIN = '10000';
process.env.RATE_LIMIT_CHAT_PER_MIN = '10000';
process.env.RATE_LIMIT_BOOKING_PER_HOUR = '10000';
process.env.RATE_LIMIT_GLOBAL_PER_15MIN = '100000';
