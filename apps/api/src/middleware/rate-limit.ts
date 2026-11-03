import { rateLimit, ipKeyGenerator, type Options } from 'express-rate-limit';
import { RateLimitError } from '../lib/errors.js';

export interface RateLimitConfig {
  globalPer15Min: number;
  authPer15Min: number;
  chatPerMin: number;
  bookingPerHour: number;
}

/**
 * In-memory stores: fine for one instance. With several instances, pass a Redis store
 * (rate-limit-redis); the middleware interface does not change.
 */
function limiter(opts: Partial<Options> & { message: string }) {
  const { message, ...rest } = opts;
  return rateLimit({
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, _res, next) => next(new RateLimitError(message)),
    ...rest,
  });
}

/** Per authenticated user when available (one NAT can hide many users), else per IP. */
const userOrIp = (req: Parameters<NonNullable<Options['keyGenerator']>>[0]) =>
  req.auth?.userId ?? ipKeyGenerator(req.ip ?? 'unknown');

export function createRateLimiters(cfg: RateLimitConfig) {
  return {
    global: limiter({
      windowMs: 15 * 60_000,
      limit: cfg.globalPer15Min,
      message: 'Too many requests, please try again in a few minutes',
    }),
    auth: limiter({
      windowMs: 15 * 60_000,
      limit: cfg.authPer15Min,
      message: 'Too many sign-in attempts, please wait a few minutes',
    }),
    chat: limiter({
      windowMs: 60_000,
      limit: cfg.chatPerMin,
      keyGenerator: userOrIp,
      message: 'You are sending messages too quickly, please wait a moment',
    }),
    booking: limiter({
      windowMs: 60 * 60_000,
      limit: cfg.bookingPerHour,
      keyGenerator: userOrIp,
      message: 'Too many booking attempts, please try again later',
    }),
  };
}

export type RateLimiters = ReturnType<typeof createRateLimiters>;
