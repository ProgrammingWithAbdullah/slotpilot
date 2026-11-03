import type { CookieOptions } from 'express';

export const SESSION_COOKIE = 'sp_session';

export function sessionCookieOptions(opts: { secure: boolean; maxAgeMs: number }): CookieOptions {
  return {
    httpOnly: true, // JavaScript can't read it, so XSS can't steal the token
    secure: opts.secure, // HTTPS only in production
    sameSite: 'lax', // not sent on cross-site POSTs (CSRF protection)
    path: '/',
    maxAge: opts.maxAgeMs,
  };
}
