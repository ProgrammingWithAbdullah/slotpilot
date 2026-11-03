import type { BusinessDto } from '@slotpilot/shared';
import type { Queryable } from '../../db/pool.js';

interface BusinessRow {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  opens_at: string; // "09:00:00"
  closes_at: string;
  open_days: number[];
  slot_interval_minutes: number;
}

export function createBusinessRepository(db: Queryable) {
  return {
    async findBySlug(slug: string): Promise<BusinessDto | null> {
      const { rows } = await db.query<BusinessRow>(
        `SELECT id, name, slug, timezone, opens_at::text, closes_at::text, open_days, slot_interval_minutes
         FROM businesses WHERE slug = $1`,
        [slug],
      );
      const r = rows[0];
      if (!r) return null;
      return {
        id: r.id,
        name: r.name,
        slug: r.slug,
        timezone: r.timezone,
        opensAt: r.opens_at.slice(0, 5),
        closesAt: r.closes_at.slice(0, 5),
        openDays: r.open_days.map(Number),
        slotIntervalMinutes: r.slot_interval_minutes,
      };
    },
  };
}

export type BusinessRepository = ReturnType<typeof createBusinessRepository>;
