import { z } from 'zod';

export const APPOINTMENT_STATUSES = ['pending', 'confirmed', 'cancelled', 'completed'] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export const createAppointmentInputSchema = z.object({
  serviceId: z.uuid({ message: 'Choose a service' }),
  startsAt: z.iso.datetime({ offset: true, message: 'Choose a valid time' }),
  notes: z.string().trim().max(500, 'Notes are too long').optional(),
  chatSessionId: z.uuid().optional(),
});
export type CreateAppointmentInput = z.infer<typeof createAppointmentInputSchema>;

export const listAppointmentsQuerySchema = z.object({
  scope: z.enum(['upcoming', 'past']).default('upcoming'),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});
export type ListAppointmentsQuery = z.infer<typeof listAppointmentsQuerySchema>;

export const idParamSchema = z.object({ id: z.uuid({ message: 'Invalid id' }) });

export interface AppointmentDto {
  id: string;
  service: { id: string; name: string; durationMinutes: number };
  startsAt: string;
  endsAt: string;
  status: AppointmentStatus;
  source: 'chat' | 'form';
  notes: string | null;
  createdAt: string;
  cancelledAt: string | null;
}
