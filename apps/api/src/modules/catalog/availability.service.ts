import { DateTime } from 'luxon';
import type { AvailabilityDto, BusinessDto, ServiceDto } from '@slotpilot/shared';
import { NotFoundError } from '../../lib/errors.js';
import type { AppointmentsRepository } from '../appointments/appointments.repository.js';
import type { ServicesRepository } from './services.repository.js';
import { computeSlots, openingWindow } from './availability.js';

export function createAvailabilityService(deps: {
  business: BusinessDto;
  services: ServicesRepository;
  appointments: AppointmentsRepository;
  now: () => Date;
}) {
  const { business } = deps;

  async function slotsFor(service: ServiceDto, date: string): Promise<string[]> {
    const window = openingWindow(business, date);
    if (!window?.start || !window.end) return [];
    const busy = await deps.appointments.busyRanges(
      business.id,
      window.start.toJSDate(),
      window.end.toJSDate(),
    );
    return computeSlots({ business, durationMinutes: service.durationMinutes, date, busy, now: deps.now() });
  }

  return {
    slotsFor,

    async getAvailability(serviceId: string, date: string): Promise<AvailabilityDto> {
      const service = await deps.services.findActive(business.id, serviceId);
      if (!service) throw new NotFoundError('Service');
      return { date, timezone: business.timezone, serviceId, slots: await slotsFor(service, date) };
    },

    async isFree(service: ServiceDto, startsAt: DateTime): Promise<boolean> {
      const local = startsAt.setZone(business.timezone);
      const slots = await slotsFor(service, local.toISODate()!);
      return slots.some((s) => DateTime.fromISO(s).toMillis() === local.toMillis());
    },

    /** Up to `count` free start times closest to the requested one (same day first, then following days). */
    async alternatives(service: ServiceDto, requested: DateTime, count = 3): Promise<string[]> {
      const local = requested.setZone(business.timezone);
      const sameDay = (await slotsFor(service, local.toISODate()!))
        .map((s) => ({ s, d: Math.abs(DateTime.fromISO(s).toMillis() - local.toMillis()) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, count)
        .map((x) => x.s)
        .sort();
      const result = [...sameDay];
      for (let i = 1; result.length < count && i <= 7; i++) {
        const next = await slotsFor(service, local.plus({ days: i }).toISODate()!);
        result.push(...next.slice(0, count - result.length));
      }
      return result;
    },
  };
}

export type AvailabilityService = ReturnType<typeof createAvailabilityService>;
