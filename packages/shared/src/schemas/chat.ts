import { z } from 'zod';

export const CHAT_STATES = ['collecting', 'confirming', 'booked', 'closed'] as const;
export type ChatState = (typeof CHAT_STATES)[number];

export const MAX_MESSAGE_LENGTH = 1000;

/**
 * The assistant's structured memory: what has been understood AND validated so far.
 * `startsAt` is only set once service + date + time are valid and the slot is free.
 */
export interface BookingDraft {
  serviceId?: string;
  serviceName?: string;
  durationMinutes?: number;
  date?: string; // YYYY-MM-DD in business timezone
  time?: string; // HH:mm in business timezone
  startsAt?: string; // ISO instant, only when complete + available
  notes?: string;
}

export type MessageCard = 'booking_summary' | 'fallback_form' | 'booked';

export interface MessageMetadata {
  card?: MessageCard;
  /** Quick replies the user can click (sent as their next message). */
  suggestions?: string[];
  /** Alternative free start times (ISO) when the requested one is taken. */
  alternatives?: string[];
  draft?: BookingDraft;
  fallbackReason?: 'ai_error' | 'invalid_output' | 'no_progress' | 'ai_disabled';
  appointmentId?: string;
}

export interface ChatMessageDto {
  id: number;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  metadata: MessageMetadata;
  createdAt: string;
}

export interface ChatSessionDto {
  id: string;
  title: string | null;
  state: ChatState;
  draft: BookingDraft;
  replyPending: boolean;
  lastMessageAt: string;
  createdAt: string;
}

export const sendMessageInputSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, 'Message cannot be empty')
    .max(MAX_MESSAGE_LENGTH, `Messages are limited to ${MAX_MESSAGE_LENGTH} characters`),
});
export type SendMessageInput = z.infer<typeof sendMessageInputSchema>;

export const listMessagesQuerySchema = z.object({
  after: z.coerce.number().int().min(0).optional(),
});

export const sessionIdParamSchema = z.object({ id: z.uuid({ message: 'Invalid session id' }) });
