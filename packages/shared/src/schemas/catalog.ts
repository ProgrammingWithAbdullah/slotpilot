import { z } from 'zod';

export interface BusinessDto {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  opensAt: string; // "09:00"
  closesAt: string; // "17:00"
  openDays: number[]; // ISO weekday, 1 = Monday
  slotIntervalMinutes: number;
}

export interface ServiceDto {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  priceCents: number | null;
}

export const isoDateSchema = z.iso.date({ message: 'Use the format YYYY-MM-DD' });

export const availabilityQuerySchema = z.object({
  serviceId: z.uuid({ message: 'Invalid service id' }),
  date: isoDateSchema,
});
export type AvailabilityQuery = z.infer<typeof availabilityQuerySchema>;

export interface AvailabilityDto {
  date: string;
  timezone: string;
  serviceId: string;
  /** Free start times as ISO-8601 instants with the business's UTC offset. */
  slots: string[];
}
