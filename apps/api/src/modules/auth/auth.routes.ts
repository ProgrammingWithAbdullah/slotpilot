import { Router, type RequestHandler } from 'express';
import { loginInputSchema, signupInputSchema, type LoginInput, type SignupInput } from '@slotpilot/shared';
import { validate } from '../../middleware/validate.js';
import type { RateLimiters } from '../../middleware/rate-limit.js';
import type { AuthService } from './auth.service.js';
import { SESSION_COOKIE, sessionCookieOptions } from './cookies.js';

export function authRoutes(deps: {
  auth: AuthService;
  businessId: string;
  requireAuth: RequestHandler;
  limiters: RateLimiters;
  secureCookies: boolean;
  sessionMaxAgeMs: number;
}): Router {
  const router = Router();
  const cookieOpts = sessionCookieOptions({ secure: deps.secureCookies, maxAgeMs: deps.sessionMaxAgeMs });

  router.post('/signup', deps.limiters.auth, validate({ body: signupInputSchema }), async (req, res) => {
    const { user, token } = await deps.auth.signup(deps.businessId, req.valid.body as SignupInput);
    res.cookie(SESSION_COOKIE, token, cookieOpts).status(201).json({ data: user });
  });

  router.post('/login', deps.limiters.auth, validate({ body: loginInputSchema }), async (req, res) => {
    const { user, token } = await deps.auth.login(deps.businessId, req.valid.body as LoginInput);
    res.cookie(SESSION_COOKIE, token, cookieOpts).json({ data: user });
  });

  router.post('/logout', (_req, res) => {
    const { maxAge: _maxAge, ...clearOpts } = cookieOpts;
    res.clearCookie(SESSION_COOKIE, clearOpts).status(204).end();
  });

  router.get('/me', deps.requireAuth, async (req, res) => {
    const user = await deps.auth.me(req.auth!.businessId, req.auth!.userId);
    res.json({ data: user });
  });

  return router;
}
