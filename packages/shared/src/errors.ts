/**
 * Machine-readable error codes. The frontend switches on these, never on message text.
 */
export const ERROR_CODES = [
  'VALIDATION_ERROR',
  'UNAUTHENTICATED',
  'INVALID_CREDENTIALS',
  'NOT_FOUND',
  'EMAIL_TAKEN',
  'SLOT_UNAVAILABLE',
  'OUTSIDE_BUSINESS_HOURS',
  'IN_THE_PAST',
  'NOT_CANCELLABLE',
  'REPLY_IN_PROGRESS',
  'RATE_LIMITED',
  'PAYLOAD_TOO_LARGE',
  'SERVICE_UNAVAILABLE',
  'INTERNAL_ERROR',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
    requestId?: string;
  };
}

export interface ApiSuccess<T> {
  data: T;
  meta?: { nextCursor?: string | null };
}

/** Shape of `details` for VALIDATION_ERROR: field path -> messages. */
export type FieldErrors = Record<string, string[]>;
