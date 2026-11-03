import { EventEmitter } from 'node:events';
import type { AppointmentDto, BookingDraft, ChatMessageDto, ChatState } from '@slotpilot/shared';

/**
 * In-process domain events. Services emit them; other modules (realtime, chat) react.
 * This keeps e.g. the appointment service ignorant of Socket.IO.
 * Multi-instance deployments would back this with Redis pub/sub or Postgres LISTEN/NOTIFY.
 */
export interface DomainEvents {
  'appointment.created': { userId: string; appointment: AppointmentDto; chatSessionId?: string };
  'appointment.updated': { userId: string; appointment: AppointmentDto };
  'chat.typing': { userId: string; sessionId: string; isTyping: boolean };
  'chat.message': {
    userId: string;
    sessionId: string;
    message: ChatMessageDto;
    draft: BookingDraft;
    state: ChatState;
  };
}

type Listener<K extends keyof DomainEvents> = (payload: DomainEvents[K]) => void;

export class EventBus {
  private readonly emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(50);
  }

  emit<K extends keyof DomainEvents>(event: K, payload: DomainEvents[K]): void {
    this.emitter.emit(event, payload);
  }

  on<K extends keyof DomainEvents>(event: K, listener: Listener<K>): () => void {
    this.emitter.on(event, listener);
    return () => this.emitter.off(event, listener);
  }
}
