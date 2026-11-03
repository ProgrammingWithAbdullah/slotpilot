import jwt from 'jsonwebtoken';

export interface AuthClaims {
  userId: string;
  businessId: string;
}

/** Signs and verifies session JWTs (HS256). Pure, no I/O. */
export function createTokenService(opts: { secret: string; expiresInHours: number }) {
  return {
    expiresInMs: opts.expiresInHours * 3600_000,

    sign(claims: AuthClaims): string {
      return jwt.sign({ bid: claims.businessId }, opts.secret, {
        algorithm: 'HS256',
        subject: claims.userId,
        expiresIn: opts.expiresInHours * 3600,
      });
    },

    /** Returns null for any invalid, expired or tampered token. */
    verify(token: string): AuthClaims | null {
      try {
        const payload = jwt.verify(token, opts.secret, { algorithms: ['HS256'] });
        if (typeof payload === 'string' || typeof payload.sub !== 'string') return null;
        const bid: unknown = payload.bid;
        if (typeof bid !== 'string') return null;
        return { userId: payload.sub, businessId: bid };
      } catch {
        return null;
      }
    },
  };
}

export type TokenService = ReturnType<typeof createTokenService>;
