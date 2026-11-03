# Flow diagrams

| Transport                     | Used for                                                                                 |
| ----------------------------- | ---------------------------------------------------------------------------------------- |
| REST over HTTPS (`/api/v1/*`) | Every command and query: log in, list, availability, book, cancel, send a chat message   |
| WebSocket (Socket.IO)         | Server to browser only: typing indicator, the assistant's reply, appointment changes     |
| Polling (every 2 s)           | Fallback for chat replies, only while a reply is pending and the socket is not connected |

The browser never sends commands over the socket, so every change goes through one validated, rate-limited endpoint.

---

## 1. Opening the app and logging in

```mermaid
sequenceDiagram
  autonumber
  actor U as User
  participant B as Browser (React)
  participant S as Express API
  participant DB as PostgreSQL

  U->>B: open the site
  B->>S: GET / (HTML, JS, CSS)
  S-->>B: static React build (SPA fallback to index.html)
  B->>S: GET /api/v1/auth/me (cookie, if any)
  S-->>B: 401 UNAUTHENTICATED (no valid cookie)
  Note over B: RequireAuth redirects to /login
  B->>S: GET /api/v1/business (public)
  S-->>B: name, timezone, opening hours

  U->>B: submit email and password
  B->>S: POST /api/v1/auth/login
  Note over S: auth rate limit (20 per 15 min)<br/>Zod validates the body
  S->>DB: SELECT user by (business, email)
  S->>S: bcrypt.compare (against a dummy hash if no such user)
  alt wrong email or password
    S-->>B: 401 INVALID_CREDENTIALS (same message for both)
  else ok
    S->>S: sign JWT (HS256, 24 h)
    S-->>B: 200 user + Set-Cookie sp_session (httpOnly, Secure, SameSite=Lax)
  end

  Note over B: cache says "authenticated"
  B->>S: WebSocket handshake /socket.io (cookie)
  S-->>B: connected, joined room user:id
  B->>S: GET /appointments?scope=upcoming
  B->>S: GET /chat/sessions (open one, or POST /chat/sessions)
  B->>S: GET /chat/sessions/:id/messages
```

- The session token is a JWT in an `httpOnly`, `SameSite=Lax` cookie (`Secure` in production). The frontend and API share
  one origin, so no CORS is needed.
- `GET /auth/me` decides who is logged in. Its cached result is the auth state, and the route guard waits for it.
- Wrong email and unknown email return the same `401 INVALID_CREDENTIALS`, and a dummy bcrypt comparison keeps timing equal.
- The Socket.IO handshake reuses the cookie and each socket joins only its own room, `user:<id>`.

---

## 2. Manual booking: choosing a service and a day

```mermaid
sequenceDiagram
  autonumber
  actor U as User
  participant B as Browser (React Query)
  participant S as Express API
  participant DB as PostgreSQL

  U->>B: click "Book appointment"
  Note over B: dialog opens, no request yet for the dialog itself
  B->>S: GET /api/v1/services (cached 10 min)
  S->>DB: active services of this business
  S-->>B: name, duration, price per service

  U->>B: pick a service (state only)
  U->>B: pick a day (state only)
  Note over B: both chosen, so the availability query turns on
  B->>S: GET /api/v1/availability?serviceId=...&date=YYYY-MM-DD
  Note over S: requireAuth<br/>Zod checks serviceId is a uuid and date is YYYY-MM-DD
  S->>DB: service exists and is active?
  S->>DB: busy ranges of that day (appointments not cancelled)
  S->>S: openingWindow, then computeSlots<br/>(business timezone)
  S-->>B: 200 slots: list of free start times (ISO)
  Note over B: renders time buttons, cached 15 s

  U->>B: change the service or the day
  B->>S: new GET /availability (new query key, old request aborted)
  S-->>B: 200 new slots
```

`GET /availability` validates the query, loads the service (`404` if unknown) and computes the free start times:

1. Find the opening window for the date in the **business timezone**. A closed weekday gives an empty list.
2. Read the day's busy ranges from `appointments` (pending and confirmed).
3. Step through the window every `slotIntervalMinutes`, keeping a start time only if the whole service fits before
   closing, is not in the past and does not overlap a busy range.

Availability is computed per request, so there is no slot table to keep in sync. The result is a hint; the database
constraint in flow 3 is the real guarantee. Changing the service or day changes the React Query key and fires a new
request (the previous one is aborted). Only REST is used on this screen.

---

## 3. Confirming a booking

```mermaid
sequenceDiagram
  autonumber
  actor U as User
  participant B as Browser
  participant S as Express API
  participant DB as PostgreSQL
  participant WS as Socket.IO

  U->>B: click "Book"
  B->>S: POST /api/v1/appointments<br/>Idempotency-Key + serviceId, startsAt, notes
  Note over S: booking rate limit (30 per hour per user)<br/>requireAuth, Zod validation
  S->>DB: same Idempotency-Key already used?
  opt retry or double click
    S-->>B: 200 the original appointment (no duplicate)
  end
  S->>DB: service exists and is active?
  S->>S: checkSlotRules: not in the past, open day,<br/>inside opening hours, on the slot grid
  alt rule broken
    S-->>B: 400 IN_THE_PAST or OUTSIDE_BUSINESS_HOURS<br/>(closed day, outside hours, off the grid)
  end
  S->>DB: INSERT appointment
  alt overlaps an existing booking
    DB-->>S: error 23P01 (exclusion constraint)
    S->>DB: find 3 closest free times
    S-->>B: 409 SLOT_UNAVAILABLE + alternatives
    Note over B: shows "just taken", clears the time,<br/>refetches availability, new Idempotency-Key
  else free
    DB-->>S: row inserted
    S-->>B: 201 appointment
    S-)WS: event appointment.created
    WS-)B: appointment:created (to room user:id)
    Note over B: toast, close dialog,<br/>refetch appointments and availability
  end
```

Two users booking the same slot at the same moment:

```mermaid
sequenceDiagram
  participant A as User A
  participant Bb as User B
  participant S as API
  participant DB as PostgreSQL

  A->>S: POST /appointments (10:00)
  Bb->>S: POST /appointments (10:00)
  S->>DB: INSERT (A)
  S->>DB: INSERT (B)
  Note over DB: exclusion constraint: ranges may not overlap<br/>(business, time range) for pending and confirmed
  DB-->>S: A committed
  DB-->>S: B rejected (23P01)
  S-->>A: 201 Created
  S-->>Bb: 409 SLOT_UNAVAILABLE + 3 closest alternatives
```

- Double booking is prevented by a PostgreSQL exclusion constraint on `(business_id, tstzrange(starts_at, ends_at, '[)'))`
  for pending and confirmed rows. The check and the insert are one atomic step, and the loser receives `23P01`, mapped to
  `409 SLOT_UNAVAILABLE` with the closest free alternatives. See [Key decisions](ARCHITECTURE.md#6-key-decisions).
- `Idempotency-Key` makes a retried or double-clicked request return the original booking (`200`) instead of a duplicate.
- Status codes: `201` created, `200` replay, `400` validation or business rule (`IN_THE_PAST`, `OUTSIDE_BUSINESS_HOURS`),
  `401`, `409` slot taken, `429` rate limited.
- The form and the chat's Confirm button call the same endpoint and service, so the rules cannot diverge.
- The `appointment.created` event reaches the user's own room, which keeps their other tabs in sync.

---

## 4. Cancelling an appointment

```mermaid
sequenceDiagram
  autonumber
  actor U as User
  participant B as Browser
  participant S as Express API
  participant DB as PostgreSQL
  participant WS as Socket.IO

  U->>B: click "Cancel" on an upcoming appointment
  Note over B: confirmation dialog opens (no request)
  U->>B: click "Cancel appointment" (or "Keep it")
  B->>S: POST /api/v1/appointments/:id/cancel
  Note over S: requireAuth, Zod checks the id is a uuid
  S->>DB: UPDATE status = 'cancelled', cancelled_at = now()<br/>WHERE id, business, user, status active AND starts_at > now()
  alt 0 rows updated
    S->>DB: load the appointment
    alt not found or belongs to someone else
      S-->>B: 404 NOT_FOUND
    else already cancelled or already started
      S-->>B: 409 NOT_CANCELLABLE
    end
    Note over B: dialog shows the error message
  else 1 row updated
    S-->>B: 200 appointment (status cancelled)
    S-)WS: event appointment.updated
    WS-)B: appointment:updated (user's other tabs)
    Note over B: toast, refetch appointments and availability
  end
```

- Cancelling is a single conditional `UPDATE` (yours, still active, in the future), so there is no read-then-write gap.
  The row is kept with `status = 'cancelled'` for history.
- Another user's appointment returns `404`, so the API does not reveal that the id exists.
- The exclusion constraint only covers pending and confirmed rows, so a cancelled time becomes bookable again.
- The dashboard and the chat use the same confirmation dialog and endpoint.

---

## 5. The AI assistant

### One chat turn

```mermaid
sequenceDiagram
  autonumber
  actor U as User
  participant B as Browser
  participant S as Express API
  participant DB as PostgreSQL
  participant G as Gemini API

  U->>B: types "cleaning tomorrow at 3pm"
  B->>B: show the message immediately (optimistic)
  B->>S: POST /chat/sessions/:id/messages
  Note over S: chat rate limit (20 per min)<br/>text 1 to 1000 chars
  S->>DB: claim the session atomically (reply_pending_since)<br/>and store the user message
  alt a reply is already being produced
    S-->>B: 409 REPLY_IN_PROGRESS
  else claimed
    S-->>B: 202 Accepted (returns now, no waiting for the AI)
  end
  Note over S: the rest runs in the background
  S-)B: socket chat:typing true
  S->>DB: load services, draft, last 10 messages
  S->>G: system prompt (today, timezone, hours, services, draft)<br/>+ messages, JSON mode + schema, temperature 0, 8 s timeout
  G-->>S: intent, fields (service, date, time, notes), reply
  S->>S: validate JSON with Zod, log the call in ai_interactions
  S->>S: business rules decide (next diagram)
  S->>DB: save reply + new draft + state in one transaction, release the claim
  S-)B: socket chat:message (reply, draft, cards, chips)
  Note over B: renders the reply with chips or a card
  opt socket is down while waiting
    B->>S: GET /chat/sessions/:id/messages?after=lastId every 2 s
  end
```

- The POST returns `202` immediately and the reply arrives over the socket, so no HTTP request waits on the model.
- The session is claimed with one atomic `UPDATE ... WHERE reply_pending_since IS NULL OR older than 30 s`; a second
  message in the meantime gets `409 REPLY_IN_PROGRESS`. No lock is held during the model call.
- Memory has two layers: a structured **draft** on the session (service, date, time, notes) owned and validated by the
  server, and the **last 10 messages** sent to the model.
- Gemini is called in JSON mode with a response schema, `temperature: 0` and an 8 s timeout. A second model is tried on
  429, 5xx, 404 or timeout. The output is validated with Zod, and every call is stored in `ai_interactions`.

### Who decides what

The model proposes, the code decides and the user confirms.

```mermaid
flowchart TB
  IN["Gemini output: intent + fields + reply"] --> OK{"Valid JSON that<br/>matches the schema?"}
  OK -- "no, or timeout, or rate limited" --> FB["Hand over to the form<br/>(fallback_form card, draft pre-filled)"]
  OK -- yes --> INT{"Intent?"}

  INT -- "question, smalltalk,<br/>out of scope" --> ANS["Answer (or a polite refusal)<br/>and ask for the next missing detail"]
  INT -- cancel --> CAN["Server lists the user's upcoming<br/>appointments (narrowed by service or day)"]
  CAN --> CANCARD["cancel_options card: Cancel button each<br/>-> same confirm dialog and endpoint as the dashboard"]
  INT -- confirm --> CONF["Re-show the summary<br/>The AI never books"]
  INT -- book --> APPLY["applyExtraction: server validates each field"]

  APPLY --> V1{"Service is real?"}
  V1 -- no --> Q1["Ask, with the list of services as chips"]
  V1 -- yes --> V2{"Date is a real, future,<br/>open day?"}
  V2 -- no --> Q2["Server message, e.g.<br/>We're closed on Sundays"]
  V2 -- yes --> V3{"Time given?"}
  V3 -- "no" --> Q3["timeOptions: every free time of that day<br/>(compact picker, first 8, Show all)"]
  V3 -- yes --> V4{"Inside hours, on the grid<br/>and free?"}
  V4 -- "taken" --> Q4["Closest free times as chips"]
  V4 -- yes --> SUM["Server writes the summary<br/>booking_summary card: Confirm / Edit"]
  SUM --> BTN["User presses Confirm"]
  BTN --> POST["POST /appointments with Idempotency-Key<br/>= same endpoint as the form, DB constraint is the last guard"]

  APPLY --> NP{"Two turns in a row<br/>with no progress?"}
  NP -- yes --> FB
```

Fallback to the booking form (pre-filled with the draft):

| Reason           | Trigger                                               |
| ---------------- | ----------------------------------------------------- |
| `ai_error`       | Timeout, 429 or 5xx on every configured model         |
| `invalid_output` | Not JSON, or does not match the schema                |
| `no_progress`    | Two booking turns in a row that added no valid detail |
| `ai_disabled`    | No `GEMINI_API_KEY`; the app works form-first         |

The browser also offers "Check again" and "Use form" if no reply arrives within 25 s.
