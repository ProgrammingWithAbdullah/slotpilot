import type { RequestHandler } from 'express';
import { UnauthorizedError } from '../lib/errors.js';
import { SESSION_COOKIE } from '../modules/auth/cookies.js';
import type { TokenService } from '../modules/auth/token.service.js';

export function requireAuth(tokens: TokenService): RequestHandler {
  return (req, _res, next) => {
    const token: unknown = req.cookies?.[SESSION_COOKIE];
    const claims = typeof token === 'string' ? tokens.verify(token) : null;
    if (!claims) {
      next(new UnauthorizedError());
      return;
    }
    req.auth = claims;
    next();
  };
}
