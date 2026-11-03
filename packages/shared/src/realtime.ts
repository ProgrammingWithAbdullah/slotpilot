import type { AppointmentDto } from './schemas/appointments.js';
import type { BookingDraft, ChatMessageDto, ChatState } from './schemas/chat.js';

/** Events the server pushes to a user's socket room (`user:<id>`). Commands go over REST. */
export interface ServerToClientEvents {
  'chat:typing': (payload: { sessionId: string; isTyping: boolean }) => void;
  'chat:message': (payload: {
    sessionId: string;
    message: ChatMessageDto;
    draft: BookingDraft;
    state: ChatState;
  }) => void;
  'appointment:created': (payload: { appointment: AppointmentDto }) => void;
  'appointment:updated': (payload: { appointment: AppointmentDto }) => void;
}

// Clients never emit; everything client -> server is a REST call.
export type ClientToServerEvents = Record<string, never>;
