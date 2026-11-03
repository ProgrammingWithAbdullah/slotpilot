import type { ErrorCode } from '@slotpilot/shared';

/**
 * Base class for errors we expect and know how to describe to the client.
 * Anything that is NOT an AppError is treated as a bug: logged in full, returned as a generic 500.
 */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Some fields are invalid', details?: unknown) {
    super(400, 'VALIDATION_ERROR', message, details);
  }
}

export class BusinessRuleError extends AppError {
  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(400, code, message, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(code: ErrorCode = 'UNAUTHENTICATED', message = 'Please log in to continue') {
    super(401, code, message);
  }
}

export class NotFoundError extends AppError {
  constructor(what = 'Resource') {
    super(404, 'NOT_FOUND', `${what} not found`);
  }
}

export class ConflictError extends AppError {
  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(409, code, message, details);
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Too many requests, please slow down') {
    super(429, 'RATE_LIMITED', message);
  }
}

/** Postgres error codes we map to domain errors. */
export const PG = {
  UNIQUE_VIOLATION: '23505',
  FOREIGN_KEY_VIOLATION: '23503',
  CHECK_VIOLATION: '23514',
  EXCLUSION_VIOLATION: '23P01',
} as const;

export function pgErrorCode(err: unknown): string | undefined {
  return typeof err === 'object' && err !== null && 'code' in err && typeof err.code === 'string'
    ? err.code
    : undefined;
}

export function pgConstraint(err: unknown): string | undefined {
  return typeof err === 'object' && err !== null && 'constraint' in err && typeof err.constraint === 'string'
    ? err.constraint
    : undefined;
}
