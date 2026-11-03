-- =============================================================================
-- Sample data. Safe to re-run: it wipes the demo tenant first.
-- Demo login: demo@slotpilot.dev / Password123!
-- =============================================================================
BEGIN;

DELETE FROM businesses WHERE slug = 'bright-smile-dental';

-- Tenant
INSERT INTO businesses (id, name, slug, timezone, opens_at, closes_at, open_days, slot_interval_minutes)
VALUES ('6f1c2a3b-0000-4000-8000-000000000001', 'Bright Smile Dental', 'bright-smile-dental',
        'Asia/Karachi', '09:00', '17:00', '{1,2,3,4,5,6}', 30);

-- Catalog
INSERT INTO services (id, business_id, name, description, duration_minutes, price_cents) VALUES
  ('6f1c2a3b-0000-4000-8000-000000000101', '6f1c2a3b-0000-4000-8000-000000000001',
   'Checkup', 'Routine dental examination', 30, 3000),
  ('6f1c2a3b-0000-4000-8000-000000000102', '6f1c2a3b-0000-4000-8000-000000000001',
   'Cleaning', 'Scale and polish', 45, 5000),
  ('6f1c2a3b-0000-4000-8000-000000000103', '6f1c2a3b-0000-4000-8000-000000000001',
   'Whitening', 'In-chair teeth whitening', 60, 12000),
  ('6f1c2a3b-0000-4000-8000-000000000104', '6f1c2a3b-0000-4000-8000-000000000001',
   'Consultation', 'Talk through a treatment plan', 15, 0);

-- Users (bcrypt cost 12 hash of "Password123!")
INSERT INTO users (id, business_id, email, password_hash, full_name, role) VALUES
  ('6f1c2a3b-0000-4000-8000-000000000201', '6f1c2a3b-0000-4000-8000-000000000001',
   'demo@slotpilot.dev', '$2b$12$hkzDxmUNbA1xgz0rm6WNsegZnV2vndoBF29P6O3WpS6YkLqSneyFi', 'Demo Customer', 'customer'),
  ('6f1c2a3b-0000-4000-8000-000000000202', '6f1c2a3b-0000-4000-8000-000000000001',
   'sara@example.com', '$2b$12$hkzDxmUNbA1xgz0rm6WNsegZnV2vndoBF29P6O3WpS6YkLqSneyFi', 'Sara Khan', 'customer');

-- A finished conversation that produced a booking
INSERT INTO chat_sessions (id, business_id, user_id, title, state, booking_draft, last_message_at)
VALUES ('6f1c2a3b-0000-4000-8000-000000000301', '6f1c2a3b-0000-4000-8000-000000000001',
        '6f1c2a3b-0000-4000-8000-000000000201', 'Cleaning next week', 'booked', '{}', now() - interval '2 days');

INSERT INTO chat_messages (session_id, role, content, metadata, created_at) VALUES
  ('6f1c2a3b-0000-4000-8000-000000000301', 'user', 'Hi, I need a cleaning next week', '{}', now() - interval '2 days 5 minutes'),
  ('6f1c2a3b-0000-4000-8000-000000000301', 'assistant', 'Sure! Which day and time suit you?', '{}', now() - interval '2 days 4 minutes'),
  ('6f1c2a3b-0000-4000-8000-000000000301', 'user', 'Wednesday at 11am please', '{}', now() - interval '2 days 3 minutes'),
  ('6f1c2a3b-0000-4000-8000-000000000301', 'assistant', 'You''re booked for a Cleaning. See you then!', '{"card":"booked"}', now() - interval '2 days 2 minutes');

-- Appointments: one upcoming (from chat), one past, one cancelled.
-- Times are computed relative to "today" in the business timezone so the demo always looks fresh.
INSERT INTO appointments (business_id, user_id, service_id, chat_session_id, starts_at, ends_at, status, source, notes, cancelled_at)
VALUES
  ('6f1c2a3b-0000-4000-8000-000000000001', '6f1c2a3b-0000-4000-8000-000000000201', '6f1c2a3b-0000-4000-8000-000000000102',
   '6f1c2a3b-0000-4000-8000-000000000301',
   ((current_date + 7)::timestamp + time '11:00') AT TIME ZONE 'Asia/Karachi',
   ((current_date + 7)::timestamp + time '11:45') AT TIME ZONE 'Asia/Karachi',
   'confirmed', 'chat', NULL, NULL),
  ('6f1c2a3b-0000-4000-8000-000000000001', '6f1c2a3b-0000-4000-8000-000000000201', '6f1c2a3b-0000-4000-8000-000000000101',
   NULL,
   ((current_date - 14)::timestamp + time '10:00') AT TIME ZONE 'Asia/Karachi',
   ((current_date - 14)::timestamp + time '10:30') AT TIME ZONE 'Asia/Karachi',
   'completed', 'form', 'First visit', NULL),
  ('6f1c2a3b-0000-4000-8000-000000000001', '6f1c2a3b-0000-4000-8000-000000000201', '6f1c2a3b-0000-4000-8000-000000000103',
   NULL,
   ((current_date + 3)::timestamp + time '14:00') AT TIME ZONE 'Asia/Karachi',
   ((current_date + 3)::timestamp + time '15:00') AT TIME ZONE 'Asia/Karachi',
   'cancelled', 'form', NULL, now() - interval '1 day');

-- One logged AI call
INSERT INTO ai_interactions (business_id, user_id, session_id, provider, model, prompt_version, status,
                             latency_ms, prompt_tokens, completion_tokens, input_excerpt, raw_output, parsed_output)
VALUES ('6f1c2a3b-0000-4000-8000-000000000001', '6f1c2a3b-0000-4000-8000-000000000201',
        '6f1c2a3b-0000-4000-8000-000000000301', 'gemini', 'gemini-3.5-flash-lite', 'booking-v1', 'ok',
        840, 512, 48, 'Wednesday at 11am please',
        '{"intent":"book","fields":{"service":null,"date":"2026-11-11","time":"11:00","notes":null},"reply":"Great"}',
        '{"intent":"book","fields":{"service":null,"date":"2026-11-11","time":"11:00","notes":null},"reply":"Great"}');

COMMIT;
