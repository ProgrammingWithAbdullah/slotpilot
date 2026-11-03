import { Router, type RequestHandler } from 'express';
import {
  listMessagesQuerySchema,
  sendMessageInputSchema,
  sessionIdParamSchema,
  type SendMessageInput,
} from '@slotpilot/shared';
import { validate } from '../../middleware/validate.js';
import type { RateLimiters } from '../../middleware/rate-limit.js';
import type { ChatService } from './chat.service.js';

export function chatRoutes(deps: {
  chat: ChatService;
  requireAuth: RequestHandler;
  limiters: RateLimiters;
}): Router {
  const router = Router();
  router.use(deps.requireAuth);

  router.post('/sessions', async (req, res) => {
    res.status(201).json({ data: await deps.chat.createSession(req.auth!.userId) });
  });

  router.get('/sessions', async (req, res) => {
    res.json({ data: await deps.chat.listSessions(req.auth!.userId) });
  });

  router.get('/sessions/:id', validate({ params: sessionIdParamSchema }), async (req, res) => {
    const { id } = req.valid.params as { id: string };
    res.json({ data: await deps.chat.getSession(req.auth!.userId, id) });
  });

  // Also the polling fallback: GET ...?after=<last message id>
  router.get(
    '/sessions/:id/messages',
    validate({ params: sessionIdParamSchema, query: listMessagesQuerySchema }),
    async (req, res) => {
      const { id } = req.valid.params as { id: string };
      const { after } = req.valid.query as { after?: number };
      res.json({ data: await deps.chat.listMessages(req.auth!.userId, id, after) });
    },
  );

  router.post(
    '/sessions/:id/messages',
    deps.limiters.chat,
    validate({ params: sessionIdParamSchema, body: sendMessageInputSchema }),
    async (req, res) => {
      const { id } = req.valid.params as { id: string };
      const { content } = req.valid.body as SendMessageInput;
      const message = await deps.chat.postMessage(req.auth!.userId, id, content);
      res.status(202).json({ data: message });
    },
  );

  return router;
}
