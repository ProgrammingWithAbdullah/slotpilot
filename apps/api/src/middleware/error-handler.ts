import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { ApiErrorBody } from '@slotpilot/shared';
import { AppError, NotFoundError, PG, pgErrorCode } from '../lib/errors.js';

export const notFound: RequestHandler = (req, _res, next) => {
  next(new NotFoundError(`Route ${req.method} ${req.path}`));
};

/**
 * The single place that turns errors into HTTP responses, so every endpoint
 * returns the same shape: { error: { code, message, details?, requestId } }.
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  let appError: AppError;

  if (err instanceof AppError) {
    appError = err;
  } else if (isBodyParserError(err, 'entity.too.large')) {
    appError = new AppError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large');
  } else if (isBodyParserError(err, 'entity.parse.failed')) {
    appError = new AppError(400, 'VALIDATION_ERROR', 'Request body is not valid JSON');
  } else if (pgErrorCode(err) === PG.FOREIGN_KEY_VIOLATION) {
    appError = new AppError(400, 'VALIDATION_ERROR', 'A referenced record does not exist');
  } else if (pgErrorCode(err) === PG.CHECK_VIOLATION) {
    appError = new AppError(400, 'VALIDATION_ERROR', 'Some values are out of range');
  } else {
    // Unknown error: a bug. Log everything, reveal nothing.
    req.log?.error({ err }, 'unhandled error');
    appError = new AppError(500, 'INTERNAL_ERROR', 'Something went wrong on our side');
  }

  const body: ApiErrorBody = {
    error: {
      code: appError.code,
      message: appError.message,
      ...(appError.details !== undefined ? { details: appError.details } : {}),
      requestId: String(req.id),
    },
  };
  res.status(appError.status).json(body);
};

function isBodyParserError(err: unknown, type: string): boolean {
  return typeof err === 'object' && err !== null && 'type' in err && err.type === type;
}
