import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import {
  createAppointmentInputSchema,
  idParamSchema,
  listAppointmentsQuerySchema,
  type CreateAppointmentInput,
  type ListAppointmentsQuery,
} from '@slotpilot/shared';
import { validate } from '../../middleware/validate.js';
import { ValidationError } from '../../lib/errors.js';
import type { RateLimiters } from '../../middleware/rate-limit.js';
import type { AppointmentsService } from './appointments.service.js';

const idempotencyKeySchema = z
  .string()
  .min(8)
  .max(100)
  .regex(/^[A-Za-z0-9-_]+$/);

export function appointmentsRoutes(deps: {
  appointments: AppointmentsService;
  requireAuth: RequestHandler;
  limiters: RateLimiters;
}): Router {
  const router = Router();
  router.use(deps.requireAuth);

  router.post('/', deps.limiters.booking, validate({ body: createAppointmentInputSchema }), async (req, res) => {
    const rawKey = req.header('idempotency-key');
    const key = rawKey === undefined ? undefined : idempotencyKeySchema.safeParse(rawKey);
    if (key && !key.success) {
      throw new ValidationError('Invalid Idempotency-Key header', { 'Idempotency-Key': ['Invalid format'] });
    }
    const { appointment, created } = await deps.appointments.create(
      req.auth!.userId,
      req.valid.body as CreateAppointmentInput,
      key?.data,
    );
    res.status(created ? 201 : 200).json({ data: appointment });
  });

  router.get('/', validate({ query: listAppointmentsQuerySchema }), async (req, res) => {
    const { items, nextCursor } = await deps.appointments.list(
      req.auth!.userId,
      req.valid.query as ListAppointmentsQuery,
    );
    res.json({ data: items, meta: { nextCursor } });
  });

  router.get('/:id', validate({ params: idParamSchema }), async (req, res) => {
    const { id } = req.valid.params as { id: string };
    res.json({ data: await deps.appointments.get(req.auth!.userId, id) });
  });

  router.post('/:id/cancel', validate({ params: idParamSchema }), async (req, res) => {
    const { id } = req.valid.params as { id: string };
    res.json({ data: await deps.appointments.cancel(req.auth!.userId, id) });
  });

  return router;
}
