import type { RequestHandler } from 'express';
import type { z } from 'zod';
import { type ZodType } from 'zod';
import type { FieldErrors } from '@slotpilot/shared';
import { ValidationError } from '../lib/errors.js';

interface Schemas {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
}

function toFieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? issue.path.join('.') : '_';
    (out[key] ??= []).push(issue.message);
  }
  return out;
}

/**
 * Parses body/query/params with Zod. Handlers read typed values from req.valid.
 * Schema validation only; rules that need the database live in services.
 */
export function validate(schemas: Schemas): RequestHandler {
  return (req, _res, next) => {
    const fieldErrors: FieldErrors = {};
    for (const part of ['params', 'query', 'body'] as const) {
      const schema = schemas[part];
      if (!schema) continue;
      const result = schema.safeParse(req[part] ?? {});
      if (result.success) {
        req.valid[part] = result.data;
      } else {
        Object.assign(fieldErrors, toFieldErrors(result.error));
      }
    }
    if (Object.keys(fieldErrors).length > 0) {
      next(new ValidationError('Some fields are invalid', fieldErrors));
      return;
    }
    next();
  };
}

/** Typed accessor for validated input. */
export function input<T>(value: unknown): T {
  return value as T;
}
