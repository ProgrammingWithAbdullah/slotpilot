import { Router, type RequestHandler } from 'express';
import { availabilityQuerySchema, type AvailabilityQuery, type BusinessDto } from '@slotpilot/shared';
import { validate } from '../../middleware/validate.js';
import type { ServicesRepository } from './services.repository.js';
import type { AvailabilityService } from './availability.service.js';

export function catalogRoutes(deps: {
  business: BusinessDto;
  services: ServicesRepository;
  availability: AvailabilityService;
  requireAuth: RequestHandler;
}): Router {
  const router = Router();

  // Public: the login page shows the business name and hours.
  router.get('/business', (_req, res) => {
    res.json({ data: deps.business });
  });

  router.get('/services', deps.requireAuth, async (_req, res) => {
    res.json({ data: await deps.services.listActive(deps.business.id) });
  });

  router.get(
    '/availability',
    deps.requireAuth,
    validate({ query: availabilityQuerySchema }),
    async (req, res) => {
      const q = req.valid.query as AvailabilityQuery;
      res.json({ data: await deps.availability.getAvailability(q.serviceId, q.date) });
    },
  );

  return router;
}
