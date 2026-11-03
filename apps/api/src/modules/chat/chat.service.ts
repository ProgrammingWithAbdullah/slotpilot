import { DateTime } from 'luxon';
import type { BusinessDto, ChatMessageDto, ChatSessionDto } from '@slotpilot/shared';
import { ConflictError, NotFoundError } from '../../lib/errors.js';
import type { EventBus } from '../../lib/events.js';
import type { Logger } from '../../lib/logger.js';
import type { BackgroundTasks } from '../../lib/async.js';
import { formatDate, formatTime } from '../catalog/availability.js';
import type { BookingAssistant } from './booking-assistant.js';
import { toPublicSession, type ChatRepository } from './chat.repository.js';

export function createChatService(deps: {
  business: BusinessDto;
  chat: ChatRepository;
  assistant: BookingAssistant;
  events: EventBus;
  tasks: BackgroundTasks;
  logger: Logger;
}) {
  const { business } = deps;

  async function requireSession(userId: string, sessionId: string) {
    const session = await deps.chat.findSession(business.id, userId, sessionId);
    if (!session) throw new NotFoundError('Chat session');
    return session;
  }

  // When a booking made from a conversation succeeds, close the loop inside that conversation.
  deps.events.on('appointment.created', ({ userId, appointment, chatSessionId }) => {
    if (!chatSessionId) return;
    deps.tasks.run(
      async () => {
        const start = DateTime.fromISO(appointment.startsAt, { zone: business.timezone });
        const message = await deps.chat.markBooked(
          chatSessionId,
          `You're booked! ${appointment.service.name} on ${formatDate(start)} at ${formatTime(start)}. You can see it in your appointments. Anything else?`,
          { card: 'booked', appointmentId: appointment.id },
        );
        deps.events.emit('chat.message', { userId, sessionId: chatSessionId, message, draft: {}, state: 'booked' });
      },
      (err) => deps.logger.error({ err, chatSessionId }, 'failed to post booking confirmation'),
    );
  });

  return {
    async createSession(userId: string): Promise<ChatSessionDto> {
      return toPublicSession(await deps.chat.createSession(business.id, userId, deps.assistant.welcome()));
    },

    async listSessions(userId: string): Promise<ChatSessionDto[]> {
      return (await deps.chat.listSessions(business.id, userId, 20)).map(toPublicSession);
    },

    async getSession(userId: string, sessionId: string): Promise<ChatSessionDto> {
      return toPublicSession(await requireSession(userId, sessionId));
    },

    async listMessages(userId: string, sessionId: string, after?: number): Promise<ChatMessageDto[]> {
      await requireSession(userId, sessionId);
      return deps.chat.listMessages(sessionId, after ?? 0);
    },

    /**
     * Stores the user's message and returns immediately (HTTP 202).
     * The AI reply is produced in the background and pushed over the socket.
     */
    async postMessage(userId: string, sessionId: string, content: string): Promise<ChatMessageDto> {
      await requireSession(userId, sessionId);
      const message = await deps.chat.claimAndAddUserMessage(business.id, userId, sessionId, content);
      if (!message) {
        throw new ConflictError('REPLY_IN_PROGRESS', 'Please wait for the assistant to reply first');
      }
      const session = await requireSession(userId, sessionId);
      deps.tasks.run(
        () => deps.assistant.handleTurn(session, userId),
        (err) => deps.logger.error({ err, sessionId }, 'background chat turn crashed'),
      );
      return message;
    },
  };
}

export type ChatService = ReturnType<typeof createChatService>;
