import type { Server as HttpServer } from 'node:http';
import { parse as parseCookie } from 'cookie';
import { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@slotpilot/shared';
import type { EventBus } from '../../lib/events.js';
import type { Logger } from '../../lib/logger.js';
import { SESSION_COOKIE } from '../auth/cookies.js';
import type { TokenService } from '../auth/token.service.js';

interface SocketData {
  userId: string;
}

const room = (userId: string) => `user:${userId}`;

/**
 * Server -> client event channel. Clients never send commands here (those go over REST);
 * they only receive events for their own room. Socket.IO falls back to HTTP long-polling
 * automatically when WebSockets are blocked.
 */
export function attachRealtime(deps: {
  httpServer: HttpServer;
  events: EventBus;
  tokens: TokenService;
  logger: Logger;
  corsOrigin?: string;
}) {
  const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(
    deps.httpServer,
    {
      path: '/socket.io',
      serveClient: false,
      ...(deps.corsOrigin ? { cors: { origin: deps.corsOrigin, credentials: true } } : {}),
    },
  );

  // Authenticate the handshake with the same httpOnly cookie the REST API uses.
  io.use((socket, next) => {
    const cookies = parseCookie(socket.handshake.headers.cookie ?? '');
    const token = cookies[SESSION_COOKIE];
    const claims = token ? deps.tokens.verify(token) : null;
    if (!claims) {
      next(new Error('unauthorized'));
      return;
    }
    socket.data.userId = claims.userId;
    next();
  });

  io.on('connection', (socket) => {
    void socket.join(room(socket.data.userId));
    deps.logger.debug({ userId: socket.data.userId, transport: socket.conn.transport.name }, 'socket connected');
  });

  const unsubscribers = [
    deps.events.on('chat.typing', ({ userId, sessionId, isTyping }) =>
      io.to(room(userId)).emit('chat:typing', { sessionId, isTyping }),
    ),
    deps.events.on('chat.message', ({ userId, sessionId, message, draft, state }) =>
      io.to(room(userId)).emit('chat:message', { sessionId, message, draft, state }),
    ),
    deps.events.on('appointment.created', ({ userId, appointment }) =>
      io.to(room(userId)).emit('appointment:created', { appointment }),
    ),
    deps.events.on('appointment.updated', ({ userId, appointment }) =>
      io.to(room(userId)).emit('appointment:updated', { appointment }),
    ),
  ];

  return {
    io,
    async close() {
      unsubscribers.forEach((off) => off());
      await io.close();
    },
  };
}
