import { DateTime } from 'luxon';
import type { AppointmentDto, BusinessDto, CreateAppointmentInput, ListAppointmentsQuery } from '@slotpilot/shared';
import {
  BusinessRuleError,
  ConflictError,
  NotFoundError,
  PG,
  ValidationError,
  pgConstraint,
  pgErrorCode,
} from '../../lib/errors.js';
import type { EventBus } from '../../lib/events.js';
import type { Logger } from '../../lib/logger.js';
import type { ServicesRepository } from '../catalog/services.repository.js';
import type { AvailabilityService } from '../catalog/availability.service.js';
import { checkSlotRules } from '../catalog/availability.js';
import type { AppointmentsRepository, Cursor } from './appointments.repository.js';

export interface SessionOwnership {
  isOwnedBy(businessId: string, userId: string, sessionId: string): Promise<boolean>;
}

const encodeCursor = (a: AppointmentDto) => Buffer.from(`${a.startsAt}|${a.id}`, 'utf8').toString('base64url');

function decodeCursor(raw: string): Cursor {
  const [startsAt, id] = Buffer.from(raw, 'base64url').toString('utf8').split('|');
  if (!startsAt || !id || Number.isNaN(Date.parse(startsAt)) || !/^[0-9a-f-]{36}$/i.test(id)) {
    throw new ValidationError('Invalid cursor', { cursor: ['Invalid cursor'] });
  }
  return { startsAt, id };
}

/**
 * The ONLY place appointments are created. Both the chat "Confirm" button and the form call it,
 * so every booking goes through the same rules.
 */
export function createAppointmentsService(deps: {
  business: BusinessDto;
  appointments: AppointmentsRepository;
  services: ServicesRepository;
  availability: AvailabilityService;
  chatSessions: SessionOwnership;
  events: EventBus;
  logger: Logger;
  now: () => Date;
}) {
  const { business } = deps;

  return {
    async create(
      userId: string,
      input: CreateAppointmentInput,
      idempotencyKey?: string,
    ): Promise<{ appointment: AppointmentDto; created: boolean }> {
      // A retried request (double click, network retry) returns the original booking.
      if (idempotencyKey) {
        const existing = await deps.appointments.findByIdempotencyKey(business.id, userId, idempotencyKey);
        if (existing) return { appointment: existing, created: false };
      }

      const service = await deps.services.findActive(business.id, input.serviceId);
      if (!service) {
        throw new ValidationError('That service is not available', { serviceId: ['Unknown service'] });
      }
      if (input.chatSessionId) {
        const owned = await deps.chatSessions.isOwnedBy(business.id, userId, input.chatSessionId);
        if (!owned) throw new NotFoundError('Chat session');
      }

      const startsAt = DateTime.fromISO(input.startsAt, { setZone: true }).setZone(business.timezone);
      const problem = checkSlotRules({
        business,
        durationMinutes: service.durationMinutes,
        startsAt,
        now: deps.now(),
      });
      if (problem) throw new BusinessRuleError(problem.code, problem.message);

      const endsAt = startsAt.plus({ minutes: service.durationMinutes });
      let id: string;
      try {
        id = await deps.appointments.insert({
          businessId: business.id,
          userId,
          serviceId: service.id,
          chatSessionId: input.chatSessionId,
          startsAt: startsAt.toJSDate(),
          endsAt: endsAt.toJSDate(),
          source: input.chatSessionId ? 'chat' : 'form',
          notes: input.notes || undefined,
          idempotencyKey,
        });
      } catch (err) {
        // The exclusion constraint is the real guarantee: it wins every race.
        if (pgErrorCode(err) === PG.EXCLUSION_VIOLATION) {
          const alternatives = await deps.availability.alternatives(service, startsAt);
          throw new ConflictError('SLOT_UNAVAILABLE', 'Sorry, that time was just taken', { alternatives });
        }
        if (
          pgErrorCode(err) === PG.UNIQUE_VIOLATION &&
          pgConstraint(err) === 'appointments_idempotency_key' &&
          idempotencyKey
        ) {
          const existing = await deps.appointments.findByIdempotencyKey(business.id, userId, idempotencyKey);
          if (existing) return { appointment: existing, created: false };
        }
        throw err;
      }

      const appointment = (await deps.appointments.findById(business.id, userId, id))!;
      deps.logger.info({ appointmentId: id, userId, source: appointment.source }, 'appointment created');
      deps.events.emit('appointment.created', { userId, appointment, chatSessionId: input.chatSessionId });
      return { appointment, created: true };
    },

    async list(userId: string, query: ListAppointmentsQuery) {
      const items = await deps.appointments.list({
        businessId: business.id,
        userId,
        scope: query.scope,
        limit: query.limit + 1, // fetch one extra to know if there is a next page
        cursor: query.cursor ? decodeCursor(query.cursor) : undefined,
      });
      const hasMore = items.length > query.limit;
      const page = hasMore ? items.slice(0, query.limit) : items;
      return { items: page, nextCursor: hasMore ? encodeCursor(page[page.length - 1]!) : null };
    },

    async get(userId: string, id: string): Promise<AppointmentDto> {
      const appointment = await deps.appointments.findById(business.id, userId, id);
      // 404 (not 403) for other users' appointments, so existence doesn't leak.
      if (!appointment) throw new NotFoundError('Appointment');
      return appointment;
    },

    async cancel(userId: string, id: string): Promise<AppointmentDto> {
      const cancelled = await deps.appointments.cancel(business.id, userId, id);
      const appointment = await deps.appointments.findById(business.id, userId, id);
      if (!appointment) throw new NotFoundError('Appointment');
      if (!cancelled) {
        throw new ConflictError('NOT_CANCELLABLE', 'Only upcoming appointments can be cancelled');
      }
      deps.logger.info({ appointmentId: id, userId }, 'appointment cancelled');
      deps.events.emit('appointment.updated', { userId, appointment });
      return appointment;
    },
  };
}

export type AppointmentsService = ReturnType<typeof createAppointmentsService>;
