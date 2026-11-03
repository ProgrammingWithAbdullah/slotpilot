import type { ServiceDto } from '@slotpilot/shared';
import type { Queryable } from '../../db/pool.js';

interface ServiceRow {
  id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  price_cents: number | null;
}

const toDto = (r: ServiceRow): ServiceDto => ({
  id: r.id,
  name: r.name,
  description: r.description,
  durationMinutes: r.duration_minutes,
  priceCents: r.price_cents,
});

export function createServicesRepository(db: Queryable) {
  return {
    async listActive(businessId: string): Promise<ServiceDto[]> {
      const { rows } = await db.query<ServiceRow>(
        `SELECT id, name, description, duration_minutes, price_cents
         FROM services WHERE business_id = $1 AND is_active ORDER BY name`,
        [businessId],
      );
      return rows.map(toDto);
    },

    async findActive(businessId: string, id: string): Promise<ServiceDto | null> {
      const { rows } = await db.query<ServiceRow>(
        `SELECT id, name, description, duration_minutes, price_cents
         FROM services WHERE business_id = $1 AND id = $2 AND is_active`,
        [businessId, id],
      );
      return rows[0] ? toDto(rows[0]) : null;
    },
  };
}

export type ServicesRepository = ReturnType<typeof createServicesRepository>;
