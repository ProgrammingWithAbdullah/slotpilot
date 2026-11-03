import type { UserDto } from '@slotpilot/shared';
import type { Queryable } from '../../db/pool.js';

interface UserRow {
  id: string;
  email: string;
  full_name: string;
  role: 'customer' | 'admin';
  created_at: Date;
}

const toDto = (r: UserRow): UserDto => ({
  id: r.id,
  email: r.email,
  fullName: r.full_name,
  role: r.role,
  createdAt: r.created_at.toISOString(),
});

const PUBLIC_COLUMNS = 'id, email, full_name, role, created_at';

/** All queries are scoped by business_id. password_hash never leaves this file except for verification. */
export function createUsersRepository(db: Queryable) {
  return {
    async create(input: {
      businessId: string;
      email: string;
      fullName: string;
      passwordHash: string;
    }): Promise<UserDto> {
      const { rows } = await db.query<UserRow>(
        `INSERT INTO users (business_id, email, full_name, password_hash)
         VALUES ($1, $2, $3, $4)
         RETURNING ${PUBLIC_COLUMNS}`,
        [input.businessId, input.email, input.fullName, input.passwordHash],
      );
      return toDto(rows[0]!);
    },

    async findCredentials(businessId: string, email: string): Promise<{ user: UserDto; passwordHash: string } | null> {
      const { rows } = await db.query<UserRow & { password_hash: string }>(
        `SELECT ${PUBLIC_COLUMNS}, password_hash FROM users WHERE business_id = $1 AND email = $2`,
        [businessId, email],
      );
      const row = rows[0];
      return row ? { user: toDto(row), passwordHash: row.password_hash } : null;
    },

    async findById(businessId: string, id: string): Promise<UserDto | null> {
      const { rows } = await db.query<UserRow>(
        `SELECT ${PUBLIC_COLUMNS} FROM users WHERE business_id = $1 AND id = $2`,
        [businessId, id],
      );
      return rows[0] ? toDto(rows[0]) : null;
    },
  };
}

export type UsersRepository = ReturnType<typeof createUsersRepository>;
