import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import express, { Router } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import type { Container } from './container.js';
import { errorHandler, notFound } from './middleware/error-handler.js';
import { httpLogger } from './middleware/http-logger.js';
import { requestId } from './middleware/request-id.js';
import { requireAuth } from './middleware/require-auth.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { catalogRoutes } from './modules/catalog/catalog.routes.js';
import { appointmentsRoutes } from './modules/appointments/appointments.routes.js';
import { chatRoutes } from './modules/chat/chat.routes.js';

/** Builds the Express app (no listening), so tests can drive it with Supertest. */
export function createApp(c: Container) {
  const app = express();
  app.disable('x-powered-by');
  // Behind Render's proxy: use the real client IP for rate limiting, and honour HTTPS.
  app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          connectSrc: ["'self'"],
          imgSrc: ["'self'", 'data:'],
          styleSrc: ["'self'", "'unsafe-inline'"],
          fontSrc: ["'self'", 'data:'],
        },
      },
    }),
  );
  app.use(requestId);
  app.use(httpLogger(c.logger));
  app.use(express.json({ limit: '16kb' }));
  app.use(cookieParser());

  // Health checks first: no rate limit, no auth.
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  app.get('/health/ready', async (_req, res) => {
    try {
      await c.pool.query('SELECT 1');
      res.json({ status: 'ready', ai: c.aiProviderName });
    } catch {
      res.status(503).json({ status: 'unavailable' });
    }
  });

  const auth = requireAuth(c.tokens);
  const api = Router();
  api.use(c.limiters.global);
  api.use(
    '/auth',
    authRoutes({
      auth: c.auth,
      businessId: c.business.id,
      requireAuth: auth,
      limiters: c.limiters,
      secureCookies: c.env.isProduction,
      sessionMaxAgeMs: c.tokens.expiresInMs,
    }),
  );
  api.use(catalogRoutes({ business: c.business, services: c.servicesRepo, availability: c.availability, requireAuth: auth }));
  api.use('/appointments', appointmentsRoutes({ appointments: c.appointments, requireAuth: auth, limiters: c.limiters }));
  api.use('/chat', chatRoutes({ chat: c.chat, requireAuth: auth, limiters: c.limiters }));
  api.use(notFound);
  app.use('/api/v1', api);

  // Production: the same process serves the built React app, so the browser sees one origin.
  const webDist = c.env.WEB_DIST_DIR ? resolve(c.env.WEB_DIST_DIR) : undefined;
  if (webDist && existsSync(webDist)) {
    app.use(express.static(webDist, { index: false, maxAge: '1h' }));
    app.use((req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
        next();
        return;
      }
      res.sendFile(resolve(webDist, 'index.html'));
    });
  }

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
