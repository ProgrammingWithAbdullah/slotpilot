// req.id and req.log are declared by pino-http.
declare global {
  namespace Express {
    interface Request {
      /** Set by requireAuth. */
      auth?: { userId: string; businessId: string };
      /** Parsed + typed inputs, set by validate(). (Express 5 makes req.query read-only.) */
      valid: { body?: unknown; query?: unknown; params?: unknown };
    }
  }
}

export {};
