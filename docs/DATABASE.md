# Database

PostgreSQL 16 (Neon in production, Docker locally). The full DDL with comments is
[`db/migrations/001_init.sql`](../db/migrations/001_init.sql); sample data is [`db/seed.sql`](../db/seed.sql).
The ER diagram is in [ARCHITECTURE.md](ARCHITECTURE.md#4-data-model).

## Tables

| Table               | Purpose                                                                                                   |
| ------------------- | --------------------------------------------------------------------------------------------------------- |
| `businesses`        | The tenant: name, slug, IANA timezone, opening hours, open weekdays, slot interval                        |
| `users`             | Customers (and a reserved `admin` role). Email is `citext`, unique **per business**                       |
| `services`          | What can be booked: name, duration, price, active flag                                                    |
| `appointments`      | Bookings: `timestamptz` start/end, status, source (`chat`/`form`), optional chat session, idempotency key |
| `chat_sessions`     | One conversation: state machine, **booking draft** (jsonb), failed-turn counter, reply lock               |
| `chat_messages`     | Messages (`bigint` identity ids, so "everything after id N" is cheap for polling and catch-up)            |
| `ai_interactions`   | One row per LLM call: provider, model, prompt version, status, latency, tokens, raw output, error         |
| `schema_migrations` | Applied migration files (created by the migration runner)                                                 |

## Modeling decisions

- **Multi-tenancy with `business_id` on every tenant-owned table**, and **composite foreign keys**
  (`(business_id, user_id) → users(business_id, id)`, same for services). The database itself guarantees an
  appointment can't reference a user or service from another business, even if application code had a bug. Every
  repository query filters by `business_id` too.
- **Double-booking is impossible at the database level:**

  ```sql
  CONSTRAINT appointments_no_overlap EXCLUDE USING gist (
    business_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  ) WHERE (status IN ('pending', 'confirmed'))
  ```

  Two concurrent requests for overlapping times can't both commit; the loser gets SQLSTATE `23P01`, which the error
  handler maps to `409 SLOT_UNAVAILABLE`. Half-open ranges (`[)`) let a 10:00–10:30 booking sit next to 10:30–11:00.
  Cancelled appointments are excluded, so their time frees up. An integration test fires parallel bookings to prove it.

- **`timestamptz` for instants, business timezone for rules.** Appointments are stored as absolute instants; "open
  9:00–17:00 Mon–Sat" is evaluated in the business's IANA timezone (Luxon), so DST and server timezone can't shift slots.
- **Idempotency:** `UNIQUE (user_id, idempotency_key)`. A retried booking returns the original row (`200`) instead of
  creating a duplicate.
- **CHECK constraints for invariants:** valid states and statuses, `ends_at > starts_at`, `cancelled_at` set if and only
  if status is `cancelled`, text length caps, `open_days` within 1–7, `closes_at > opens_at`.
- **Booking draft as `jsonb`** on the session: structured conversational memory the server owns (service id, date, time,
  notes). Validated in code with Zod before it is used; a CHECK ensures it is a JSON object.
- **AI log as its own append-only table** so prompts can be debugged and costs measured without touching user data.
  `raw_output` is kept for debugging; production would add retention.

## Indexing strategy

Every index exists because of a specific query. Primary keys and UNIQUE constraints already create B-tree indexes and are
not duplicated.

| Index                                                               | Query it serves                                                                           |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `users_business_email_key` UNIQUE `(business_id, email)`            | Login lookup                                                                              |
| `appointments_no_overlap` GiST `(business_id, tstzrange)` partial   | Overlap guard **and** "what's booked that day" for availability                           |
| `appointments_user_starts_idx` `(user_id, starts_at DESC, id DESC)` | "My appointments" with keyset pagination (upcoming ascending, past descending)            |
| `appointments_idempotency_key` UNIQUE `(user_id, idempotency_key)`  | Replay lookup for retried bookings                                                        |
| `chat_sessions_user_recent_idx` `(user_id, last_message_at DESC)`   | The user's current/recent conversation                                                    |
| `chat_messages_session_idx` `(session_id, id)`                      | Load a conversation in order; polling `WHERE session_id = $1 AND id > $2`                 |
| `ai_interactions_session_idx` `(session_id, created_at)`            | Debug one conversation's AI calls                                                         |
| `ai_interactions_created_brin` BRIN `(created_at)`                  | Time-range analytics on an append-only log; BRIN is a few pages instead of a large B-tree |
| `services_active_by_business_idx` `(business_id) WHERE is_active`   | Catalog for the booking form and the AI prompt                                            |

## Performance considerations

- **One connection pool per process** (`pg.Pool`, max 10 by default, `DB_POOL_MAX`), 5 s `statement_timeout` to stop
  runaway queries (skipped on pooled endpoints, which reject it as a startup parameter).
- **Keyset pagination** (`WHERE (starts_at, id) > ($cursor) ORDER BY starts_at, id LIMIT n+1`) instead of `OFFSET`,
  which gets slower the deeper you page. The cursor is an opaque base64url string.
- **No N+1:** list queries join `services` once.
- **Short transactions; never hold a connection during the LLM call.** The chat turn claims the session, releases the
  connection, calls Gemini, then saves the reply in one short transaction.
- **Atomic claim instead of locks held across I/O:** `UPDATE chat_sessions SET reply_pending_since = now() WHERE id = $1
AND (reply_pending_since IS NULL OR reply_pending_since < now() - interval '30 seconds')`. Zero rows → `409
REPLY_IN_PROGRESS`.
- **Scaling path:** partition `chat_messages` and `ai_interactions` by month, add retention for `ai_interactions.raw_output`,
  add Row-Level Security keyed on `current_setting('app.business_id')`, and add `resource_id` to the exclusion constraint
  for multiple staff or rooms.
- **Neon specifics:** the app can use the pooled endpoint (PgBouncer, transaction mode). Migrations and seeding
  automatically switch to the direct endpoint because a session-level advisory lock (used to make concurrent deploys
  safe) doesn't work through a transaction-mode pooler.
