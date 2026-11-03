-- =============================================================================
-- SlotPilot initial schema
-- PostgreSQL 16. Multi-tenant: every tenant-owned row carries business_id, and
-- composite foreign keys guarantee that related rows belong to the same tenant.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS citext;      -- case-insensitive email
CREATE EXTENSION IF NOT EXISTS btree_gist;  -- "=" on uuid inside a GiST exclusion constraint

-- Keeps updated_at correct without relying on application code.
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- -----------------------------------------------------------------------------
-- businesses: the tenant. Opening hours are local times in the business timezone.
-- -----------------------------------------------------------------------------
CREATE TABLE businesses (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  slug                  text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]{2,60}$'),
  timezone              text NOT NULL DEFAULT 'UTC',
  opens_at              time NOT NULL DEFAULT '09:00',
  closes_at             time NOT NULL DEFAULT '17:00',
  open_days             smallint[] NOT NULL DEFAULT '{1,2,3,4,5,6}',  -- ISO weekday, 1 = Monday
  slot_interval_minutes smallint NOT NULL DEFAULT 30 CHECK (slot_interval_minutes IN (15, 30, 60)),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CHECK (closes_at > opens_at),
  CHECK (open_days <@ ARRAY[1,2,3,4,5,6,7]::smallint[])
);
CREATE TRIGGER businesses_updated_at BEFORE UPDATE ON businesses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------
-- users: authentication + profile, scoped to a business.
-- -----------------------------------------------------------------------------
CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  email         citext NOT NULL CHECK (char_length(email) <= 254),
  password_hash text NOT NULL,
  full_name     text NOT NULL CHECK (char_length(full_name) BETWEEN 1 AND 100),
  role          text NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'admin')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_business_email_key UNIQUE (business_id, email),  -- login lookup
  CONSTRAINT users_business_id_key UNIQUE (business_id, id)         -- target for composite FKs
);
CREATE TRIGGER users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------
-- services: what can be booked and how long it takes.
-- -----------------------------------------------------------------------------
CREATE TABLE services (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id      uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name             text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  description      text CHECK (char_length(description) <= 500),
  duration_minutes smallint NOT NULL CHECK (duration_minutes BETWEEN 5 AND 480),
  price_cents      integer CHECK (price_cents >= 0),
  is_active        boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT services_business_name_key UNIQUE (business_id, name),
  CONSTRAINT services_business_id_key UNIQUE (business_id, id)
);
CREATE INDEX services_active_by_business_idx ON services (business_id) WHERE is_active;

-- -----------------------------------------------------------------------------
-- chat_sessions: conversation metadata + the assistant's structured memory.
-- -----------------------------------------------------------------------------
CREATE TABLE chat_sessions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id         uuid NOT NULL,
  user_id             uuid NOT NULL,
  title               text CHECK (char_length(title) <= 120),
  state               text NOT NULL DEFAULT 'collecting'
                      CHECK (state IN ('collecting', 'confirming', 'booked', 'closed')),
  booking_draft       jsonb NOT NULL DEFAULT '{}'::jsonb,
  failed_turns        smallint NOT NULL DEFAULT 0 CHECK (failed_turns >= 0),
  reply_pending_since timestamptz,          -- non-null while an AI reply is being produced
  last_message_at     timestamptz NOT NULL DEFAULT now(),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chat_sessions_user_fk FOREIGN KEY (business_id, user_id)
    REFERENCES users (business_id, id) ON DELETE CASCADE,
  CHECK (jsonb_typeof(booking_draft) = 'object')
);
CREATE INDEX chat_sessions_user_recent_idx ON chat_sessions (user_id, last_message_at DESC);
CREATE TRIGGER chat_sessions_updated_at BEFORE UPDATE ON chat_sessions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------
-- chat_messages: one row per message. bigint identity => monotonic "after=<id>" cursor.
-- -----------------------------------------------------------------------------
CREATE TABLE chat_messages (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id  uuid NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role        text NOT NULL CHECK (role IN ('user', 'assistant')),
  content     text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 4000),
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX chat_messages_session_idx ON chat_messages (session_id, id);

-- -----------------------------------------------------------------------------
-- appointments: scheduling data + status.
-- -----------------------------------------------------------------------------
CREATE TABLE appointments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id      uuid NOT NULL,
  user_id          uuid NOT NULL,
  service_id       uuid NOT NULL,
  chat_session_id  uuid REFERENCES chat_sessions(id) ON DELETE SET NULL,
  starts_at        timestamptz NOT NULL,
  ends_at          timestamptz NOT NULL,
  status           text NOT NULL DEFAULT 'confirmed'
                   CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed')),
  source           text NOT NULL CHECK (source IN ('chat', 'form')),
  notes            text CHECK (char_length(notes) <= 500),
  idempotency_key  text CHECK (char_length(idempotency_key) <= 100),
  cancelled_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at),
  CHECK ((status = 'cancelled') = (cancelled_at IS NOT NULL)),
  CONSTRAINT appointments_user_fk FOREIGN KEY (business_id, user_id)
    REFERENCES users (business_id, id) ON DELETE CASCADE,
  CONSTRAINT appointments_service_fk FOREIGN KEY (business_id, service_id)
    REFERENCES services (business_id, id),
  CONSTRAINT appointments_idempotency_key UNIQUE (user_id, idempotency_key),
  -- The double-booking guard: no two active appointments of one business may overlap.
  -- '[)' = half-open range, so 09:00-09:30 and 09:30-10:00 do not conflict.
  CONSTRAINT appointments_no_overlap EXCLUDE USING gist (
    business_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  ) WHERE (status IN ('pending', 'confirmed'))
);
CREATE INDEX appointments_user_starts_idx ON appointments (user_id, starts_at DESC, id DESC);
CREATE TRIGGER appointments_updated_at BEFORE UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------
-- ai_interactions: audit/debug log of every LLM call.
-- -----------------------------------------------------------------------------
CREATE TABLE ai_interactions (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  business_id       uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id           uuid REFERENCES users(id) ON DELETE SET NULL,
  session_id        uuid REFERENCES chat_sessions(id) ON DELETE SET NULL,
  provider          text NOT NULL,
  model             text NOT NULL,
  prompt_version    text NOT NULL,
  status            text NOT NULL
                    CHECK (status IN ('ok', 'invalid_output', 'timeout', 'provider_error', 'rate_limited')),
  latency_ms        integer NOT NULL CHECK (latency_ms >= 0),
  prompt_tokens     integer,
  completion_tokens integer,
  input_excerpt     text,
  raw_output        text,
  parsed_output     jsonb,
  error_message     text,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_interactions_session_idx ON ai_interactions (session_id, created_at);
CREATE INDEX ai_interactions_created_brin ON ai_interactions USING brin (created_at);
