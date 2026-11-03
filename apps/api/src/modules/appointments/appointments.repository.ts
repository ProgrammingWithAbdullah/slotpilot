import type { AppointmentDto, AppointmentStatus } from '@slotpilot/shared';
import type { Queryable } from '../../db/pool.js';
import type { BusyRange } from '../catalog/availability.js';

interface AppointmentRow {
  id: string;
  service_id: string;
  service_name: string;
  duration_minutes: number;
  starts_at: Date;
  ends_at: Date;
  status: AppointmentStatus;
  source: 'chat' | 'form';
  notes: string | null;
  created_at: Date;
  cancelled_at: Date | null;
}

const toDto = (r: AppointmentRow): AppointmentDto => ({
  id: r.id,
  service: { id: r.service_id, name: r.service_name, durationMinutes: r.duration_minutes },
  startsAt: r.starts_at.toISOString(),
  endsAt: r.ends_at.toISOString(),
  status: r.status,
  source: r.source,
  notes: r.notes,
  createdAt: r.created_at.toISOString(),
  cancelledAt: r.cancelled_at?.toISOString() ?? null,
});

// One query with a join: no N+1 when listing.
const SELECT = `
  SELECT a.id, a.service_id, s.name AS service_name, s.duration_minutes, a.starts_at, a.ends_at,
         a.status, a.source, a.notes, a.created_at, a.cancelled_at
  FROM appointments a
  JOIN services s ON s.id = a.service_id`;

const ACTIVE = `a.status IN ('pending', 'confirmed') AND a.ends_at > now()`;

export interface Cursor {
  startsAt: string;
  id: string;
}

export function createAppointmentsRepository(db: Queryable) {
  return {
    async insert(
      input: {
        businessId: string;
        userId: string;
        serviceId: string;
        chatSessionId?: string;
        startsAt: Date;
        endsAt: Date;
        source: 'chat' | 'form';
        notes?: string;
        idempotencyKey?: string;
      },
      q: Queryable = db,
    ): Promise<string> {
      const { rows } = await q.query<{ id: string }>(
        `INSERT INTO appointments
           (business_id, user_id, service_id, chat_session_id, starts_at, ends_at, status, source, notes, idempotency_key)
         VALUES ($1, $2, $3, $4, $5, $6, 'confirmed', $7, $8, $9)
         RETURNING id`,
        [
          input.businessId,
          input.userId,
          input.serviceId,
          input.chatSessionId ?? null,
          input.startsAt,
          input.endsAt,
          input.source,
          input.notes ?? null,
          input.idempotencyKey ?? null,
        ],
      );
      return rows[0]!.id;
    },

    async findById(businessId: string, userId: string, id: string, q: Queryable = db) {
      const { rows } = await q.query<AppointmentRow>(
        `${SELECT} WHERE a.business_id = $1 AND a.user_id = $2 AND a.id = $3`,
        [businessId, userId, id],
      );
      return rows[0] ? toDto(rows[0]) : null;
    },

    async findByIdempotencyKey(businessId: string, userId: string, key: string) {
      const { rows } = await db.query<AppointmentRow>(
        `${SELECT} WHERE a.business_id = $1 AND a.user_id = $2 AND a.idempotency_key = $3`,
        [businessId, userId, key],
      );
      return rows[0] ? toDto(rows[0]) : null;
    },

    /**
     * Keyset pagination on (starts_at, id): stable and fast at any depth, unlike OFFSET.
     * Upcoming = active and not yet over, soonest first. Past = everything else, newest first.
     */
    async list(args: {
      businessId: string;
      userId: string;
      scope: 'upcoming' | 'past';
      limit: number;
      cursor?: Cursor;
    }): Promise<AppointmentDto[]> {
      const upcoming = args.scope === 'upcoming';
      const params: unknown[] = [args.businessId, args.userId];
      let where = `a.business_id = $1 AND a.user_id = $2 AND ${upcoming ? ACTIVE : `NOT (${ACTIVE})`}`;
      if (args.cursor) {
        params.push(args.cursor.startsAt, args.cursor.id);
        where += upcoming
          ? ` AND (a.starts_at, a.id) > ($3::timestamptz, $4::uuid)`
          : ` AND (a.starts_at, a.id) < ($3::timestamptz, $4::uuid)`;
      }
      params.push(args.limit);
      const order = upcoming ? 'a.starts_at ASC, a.id ASC' : 'a.starts_at DESC, a.id DESC';
      const { rows } = await db.query<AppointmentRow>(
        `${SELECT} WHERE ${where} ORDER BY ${order} LIMIT $${params.length}`,
        params,
      );
      return rows.map(toDto);
    },

    /** Atomic: only cancels if it is still active and in the future. */
    async cancel(businessId: string, userId: string, id: string): Promise<boolean> {
      const { rowCount } = await db.query(
        `UPDATE appointments SET status = 'cancelled', cancelled_at = now()
         WHERE business_id = $1 AND user_id = $2 AND id = $3
           AND status IN ('pending', 'confirmed') AND starts_at > now()`,
        [businessId, userId, id],
      );
      return rowCount === 1;
    },

    /** Active appointments overlapping [from, to) for the whole business (served by the GiST index). */
    async busyRanges(businessId: string, from: Date, to: Date): Promise<BusyRange[]> {
      const { rows } = await db.query<{ starts_at: Date; ends_at: Date }>(
        `SELECT starts_at, ends_at FROM appointments
         WHERE business_id = $1 AND status IN ('pending', 'confirmed')
           AND tstzrange(starts_at, ends_at, '[)') && tstzrange($2, $3, '[)')`,
        [businessId, from, to],
      );
      return rows.map((r) => ({ startsAt: r.starts_at, endsAt: r.ends_at }));
    },
  };
}

export type AppointmentsRepository = ReturnType<typeof createAppointmentsRepository>;
