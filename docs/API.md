# API and AI integration

## REST API

Base path: `/api/v1`. JSON in, JSON out. The request/response types live in
[`packages/shared`](../packages/shared/src) and are used by both the API (validation) and the web app (forms, types).

### Conventions

- **Auth:** `POST /auth/login` or `/auth/signup` sets an httpOnly cookie `sp_session` (JWT, HS256, 24 h, `SameSite=Lax`,
  `Secure` in production). Browsers send it automatically; with curl use a cookie jar (`-c jar -b jar`).
- **Success:** `{ "data": ... }`, plus `"meta"` for paginated lists.
- **Errors:** always the same shape, with a stable machine-readable `code` (the UI switches on it, never on the text)
  and the `requestId` that also appears in the server logs:

  ```json
  {
    "error": {
      "code": "VALIDATION_ERROR",
      "message": "Some fields are invalid",
      "details": { "email": ["Enter a valid email address"], "password": ["Password is required"] },
      "requestId": "18a9be62-67ae-4e2d-8156-4de00f4a982f"
    }
  }
  ```

- **Times** are ISO-8601. Inputs must carry an offset (`2026-11-11T09:00:00+05:00`); outputs are UTC instants. Dates
  (`YYYY-MM-DD`) and opening hours are in the business's timezone.
- **Request ID:** send `X-Request-Id` to correlate, otherwise one is generated and echoed back.

### Endpoints

| Method | Path                                | Auth | Rate limit       | Description                                                                            |
| ------ | ----------------------------------- | ---- | ---------------- | -------------------------------------------------------------------------------------- |
| GET    | `/health`                           |      |                  | Liveness (outside `/api/v1`)                                                           |
| GET    | `/health/ready`                     |      |                  | Readiness: checks the database; `503 {status:"unavailable"}` if not                    |
| POST   | `/auth/signup`                      |      | 20 / 15 min / IP | `{ fullName, email, password }` → `201 { user }` + cookie. `409 EMAIL_TAKEN`           |
| POST   | `/auth/login`                       |      | 20 / 15 min / IP | `{ email, password }` → `200 { user }` + cookie. `401 INVALID_CREDENTIALS`             |
| POST   | `/auth/logout`                      |      |                  | Clears the cookie → `204`                                                              |
| GET    | `/auth/me`                          | ✓    |                  | Current user. `401 UNAUTHENTICATED` without a valid cookie                             |
| GET    | `/business`                         |      |                  | Tenant info: name, timezone, opening hours, open days, slot interval                   |
| GET    | `/services`                         | ✓    |                  | Active services (name, duration, price)                                                |
| GET    | `/availability?serviceId&date`      | ✓    |                  | Free start times for that service on that day                                          |
| POST   | `/appointments`                     | ✓    | 30 / hour / user | Book. Optional `Idempotency-Key` header. `201` created, `200` replayed                 |
| GET    | `/appointments?scope&limit&cursor`  | ✓    |                  | `scope=upcoming\|past`, keyset pagination via `meta.nextCursor`                        |
| GET    | `/appointments/:id`                 | ✓    |                  | One of **your** appointments (others' → `404`, never `403`, to avoid leaking ids)      |
| POST   | `/appointments/:id/cancel`          | ✓    |                  | Cancel an upcoming appointment. `409 NOT_CANCELLABLE` if past or already cancelled     |
| POST   | `/chat/sessions`                    | ✓    |                  | Start a new conversation (closes the previous open one) → `201`                        |
| GET    | `/chat/sessions`                    | ✓    |                  | Your recent conversations                                                              |
| GET    | `/chat/sessions/:id`                | ✓    |                  | Session with state (`collecting\|confirming\|booked\|closed`) and booking draft        |
| GET    | `/chat/sessions/:id/messages?after` | ✓    |                  | Messages in order; `after=<id>` returns only newer ones (polling fallback)             |
| POST   | `/chat/sessions/:id/messages`       | ✓    | 20 / min / user  | `{ content }` (1 to 1000 chars) → `202 { userMessage }`; reply arrives over the socket |

A global limit of 600 requests / 15 min / IP applies to everything under `/api/v1`. All limits are configurable via
environment variables and return `429 RATE_LIMITED` with `RateLimit-*` headers.

### Error codes

| HTTP | Code                     | When                                                                            |
| ---- | ------------------------ | ------------------------------------------------------------------------------- |
| 400  | `VALIDATION_ERROR`       | Body/query/params fail the Zod schema; `details` maps field → messages          |
| 400  | `OUTSIDE_BUSINESS_HOURS` | Closed day, before opening, or ends after closing                               |
| 400  | `IN_THE_PAST`            | Start time is not in the future                                                 |
| 401  | `UNAUTHENTICATED`        | Missing, invalid or expired session                                             |
| 401  | `INVALID_CREDENTIALS`    | Wrong email or password (same message for both)                                 |
| 404  | `NOT_FOUND`              | Unknown route, or a resource that isn't yours                                   |
| 409  | `EMAIL_TAKEN`            | Signup with an existing email (per business)                                    |
| 409  | `SLOT_UNAVAILABLE`       | Overlaps another booking; `details.alternatives` lists the closest free times   |
| 409  | `NOT_CANCELLABLE`        | Appointment already cancelled or in the past                                    |
| 409  | `REPLY_IN_PROGRESS`      | A chat message was sent while the assistant is still answering the previous one |
| 413  | `PAYLOAD_TOO_LARGE`      | Body over 16 KB                                                                 |
| 429  | `RATE_LIMITED`           | Too many requests                                                               |
| 500  | `INTERNAL_ERROR`         | Anything unexpected; details are logged with the `requestId`, never sent        |

### Real-time events (Socket.IO)

Connect to the same origin (`/socket.io`). The handshake is authenticated with the same cookie; each user joins the
room `user:<id>`, so every tab and device of that user receives:

| Event                 | Payload                                | Used for                                        |
| --------------------- | -------------------------------------- | ----------------------------------------------- |
| `chat:typing`         | `{ sessionId, isTyping }`              | Typing indicator while the AI is working        |
| `chat:message`        | `{ sessionId, message, draft, state }` | Assistant replies (with summary/fallback cards) |
| `appointment:created` | `{ appointment }`                      | Refresh the list (also from other tabs)         |
| `appointment:updated` | `{ appointment }`                      | Cancellation                                    |

Clients never emit events: every command is a REST call.

## AI integration

### Principle: the LLM proposes, the code decides, the user confirms

The model does one job: turn messy text into structured booking fields plus a friendly sentence. Everything with
consequences (is the service real, is the day open, is the slot free, should we book) is decided by deterministic,
unit-tested code. The model has no tools, never touches the database and can't book anything. A booking only happens
when the user presses **Confirm** on a summary the server wrote.

### Components

```
apps/api/src/modules/ai/                     (knows prompts and JSON; nothing about booking rules)
  llm-provider.ts        LlmProvider interface: complete({ system, messages, responseSchema, temperature, maxOutputTokens })
  gemini.provider.ts     REST call to generativelanguage.googleapis.com, timeout, model fallback, error classification
  mock.provider.ts       deterministic offline parser used by tests, CI, e2e and local dev without a key
  booking-extractor.ts   builds the prompt, calls the provider, parses + validates with Zod, logs every call
  prompts/booking-system.ts   the versioned system prompt (PROMPT_VERSION = "booking-v2")

apps/api/src/modules/chat/                   (knows booking rules; nothing about Gemini)
  booking-draft.ts       pure functions: applyExtraction, resolveService, missingFields  (unit-tested)
  booking-assistant.ts   one conversational turn: extract → validate → availability → reply / summary / fallback
  chat.service.ts        HTTP-facing: claim the session, store the message, run the turn in the background
```

An ESLint rule enforces the boundary: files in `modules/ai` can't import other modules or repositories.

### One turn, step by step

1. `POST /chat/sessions/:id/messages` validates the text (1–1000 chars), applies the per-user rate limit, and
   **atomically claims** the session (`reply_pending_since`), so two messages can't be processed at once
   (`409 REPLY_IN_PROGRESS`). It stores the user message and returns **202**. The browser shows a typing indicator
   (`chat:typing` event).
2. In the background the extractor builds the request:
   - **System prompt** with today's date, weekday and local time **in the business timezone** (so "tomorrow" and "next
     Friday" resolve correctly), opening hours, the active services with durations, and the current booking draft.
   - **The last 10 messages** of the conversation.
   - `temperature: 0`, `maxOutputTokens: 512`, `responseMimeType: application/json` and a **response schema**.
3. The model returns `{ intent, fields: { service, date, time, notes }, reply }`. The extractor parses it and validates
   it with **Zod** (`extractionSchema`). Every call is logged to `ai_interactions` and the structured log: provider,
   model, prompt version, status (`ok`, `invalid_output`, `timeout`, `rate_limited`, `provider_error`), latency,
   tokens, raw output, error.
4. **Business validation (no AI):**
   - `service` text → a real service (exact, then case-insensitive/partial match). Unknown → ask with the list of options.
   - `date`/`time` → real calendar values, not in the past, open weekday, inside opening hours, on the slot grid.
   - Date known but no time → **every free time of that day** is sent as `timeOptions`; the chat shows them as a
     compact picker (grouped by morning/afternoon, first 8 visible, "Show all" expands in place).
   - Complete draft → **availability check**. Taken → the closest free times are offered as suggestion chips.
5. **Reply:**
   - Missing details → the model's follow-up question (it is good at natural phrasing), or a server message when
     something was rejected ("We're closed on Sundays. We're open Mon to Sat, 9 AM to 5 PM.").
   - Complete and free → the server writes the summary itself and attaches a `booking_summary` card (Confirm / Edit).
   - A model reply that claims "booked/confirmed/reserved/cancelled" is discarded (`CLAIMS_BOOKING` guard).
   - Intent `cancel` ("cancel my cleaning on Friday") → the server lists the user's upcoming appointments, narrowed by
     the service/date the model extracted, in a `cancel_options` card. Each has a Cancel button that opens the same
     confirmation dialog and endpoint as the dashboard. The assistant never cancels anything itself.
6. The reply, new draft and state are saved in one transaction, the claim is released, and `chat:message` is pushed to
   the user's socket room.
7. **Confirm** calls the same `POST /appointments` endpoint as the form, with an `Idempotency-Key` derived from the
   message, and the exclusion constraint as the last line of defense. The booked appointment links back to the chat
   (`chatSessionId`) and the assistant posts a "You're booked" message.

### Multi-turn memory: two layers

- **Structured memory:** the booking draft on `chat_sessions` (service, date, time, notes). It is server-owned and
  validated, so facts survive even after old messages leave the window.
- **Conversational memory:** the last 10 messages, so the model understands follow-ups like "make it 4 instead".
  Bounded to keep latency and cost predictable.

### Fallback to the structured form

The chat always shows "Prefer a form? Book manually". The assistant actively hands over with a `fallback_form` card
(button opens the booking form **pre-filled with the draft**) when:

| Reason           | Trigger                                                                                      |
| ---------------- | -------------------------------------------------------------------------------------------- |
| `ai_error`       | Timeout, rate limit or provider error on every configured model                              |
| `invalid_output` | The response isn't JSON or doesn't match the schema                                          |
| `no_progress`    | Two booking turns in a row that added no valid detail (the conversation is going in circles) |
| `ai_disabled`    | `AI_PROVIDER=gemini` without a `GEMINI_API_KEY`: the app still works, form-first             |

### Gemini provider details

- REST (`fetch`), no SDK: `POST /v1beta/models/{model}:generateContent` with the key in the `x-goog-api-key` header.
- `systemInstruction` for the rules, `contents` for the history (`assistant` → `model` role), `generationConfig` with
  JSON mime type and schema. "Thought" parts are ignored.
- **Model fallback:** `GEMINI_MODELS=gemini-3.5-flash-lite,gemini-flash-lite-latest`. On `429`, `5xx`, `404` (model retired
  or not available to the key) or timeout the next model is tried; with a single model it retries once after a short
  backoff. Other `4xx` errors (bad key, bad request) are not retried.
- `AI_TIMEOUT_MS` (default 8000) per attempt via `AbortSignal.timeout`.
- Swapping providers means implementing one interface (`LlmProvider`); the prompt, schema and validation are shared.

### Guardrails

Input length cap · per-user rate limit · bounded history · JSON mode + response schema + Zod · temperature 0 · timeout
and limited retries · prompt states that customer text is data, not instructions, and limits the assistant to booking ·
model reply length cap, rendered as plain text · "booked" claims stripped · no tools or DB access for the model ·
explicit user confirmation · full server-side revalidation at booking time · every call logged.
