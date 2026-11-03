# Architecture

## 1. System context

The browser talks only to one Node process. That process is the only component that talks to the database and to Gemini, which is behind a swappable provider interface.

```mermaid
flowchart TB
  U(["Customer in browser"])
  subgraph Render["Render web service (one Docker container, one origin)"]
    STATIC["Static React build<br/>(index.html, JS, CSS)"]
    API["Express REST API<br/>/api/v1/*"]
    WS["Socket.IO<br/>/socket.io"]
  end
  DB[("PostgreSQL<br/>Neon")]
  LLM["Google Gemini API<br/>gemini-3.5-flash-lite"]
  U -- "1. page load" --> STATIC
  U -- "2. REST commands & queries<br/>(httpOnly JWT cookie)" --> API
  U <-- "3. WebSocket: server pushes events<br/>(typing, messages, appointments)" --> WS
  API -. "domain events" .-> WS
  API -- "parameterized SQL (pg pool)" --> DB
  API -- "JSON mode + schema, 8s timeout,<br/>fallback model on 429/5xx" --> LLM
```

## 2. Backend layers

Every request passes the same middleware, then route, service and repository. Middleware handles security, logging and validation, so route handlers stay thin. Services hold the business rules. Repositories are the only place with SQL, and every repository method takes a `businessId`.

```mermaid
flowchart TB
  R["HTTP request"] --> H["helmet"] --> RID["requestId"] --> LOG["pino-http logger"] --> BODY["json body (16kb) + cookies"]
  BODY --> GRL["global rate limit"] --> RRL["route rate limit"] --> AUTH["requireAuth (JWT cookie)"] --> VAL["validate (Zod: body/params/query)"]
  VAL --> C["Route handler<br/>HTTP in/out only"]
  C --> S["Service<br/>business rules"]
  S --> REPO["Repository<br/>SQL, tenant-scoped"]
  REPO --> PG[("PostgreSQL")]
  S -- "emit domain event" --> BUS["Event bus"] --> RT["Realtime module<br/>Socket.IO rooms"]
  S -. "AI module (extraction only)" .-> AI["BookingExtractor -> LlmProvider"]
  C -- "throws AppError" --> EH["errorHandler<br/>maps to status + {error:{code,message,requestId}}"]
```

## 3. Chat session states

Each chat session has a state stored in the database. The server, not the model, moves between states.

```mermaid
stateDiagram-v2
  [*] --> collecting: session created
  collecting --> collecting: field missing / invalid<br/>(ask follow-up)
  collecting --> confirming: service + date + time all valid & slot free
  confirming --> collecting: user changes a detail
  confirming --> booked: user clicks Confirm<br/>(POST /appointments 201)
  confirming --> collecting: 409 slot taken<br/>(offer alternatives)
  booked --> collecting: user starts another booking
  collecting --> closed: user starts new conversation
  booked --> closed
```

## 4. Data model

Every tenant-owned table carries `business_id`, and composite foreign keys ensure related rows belong to the same business. Details in [DATABASE.md](DATABASE.md).

```mermaid
erDiagram
  BUSINESSES ||--o{ USERS : has
  BUSINESSES ||--o{ SERVICES : offers
  BUSINESSES ||--o{ APPOINTMENTS : schedules
  BUSINESSES ||--o{ CHAT_SESSIONS : hosts
  USERS ||--o{ APPOINTMENTS : books
  USERS ||--o{ CHAT_SESSIONS : starts
  SERVICES ||--o{ APPOINTMENTS : "booked as"
  CHAT_SESSIONS ||--o{ CHAT_MESSAGES : contains
  CHAT_SESSIONS |o--o{ APPOINTMENTS : "resulted in"
  CHAT_SESSIONS |o--o{ AI_INTERACTIONS : logs
  BUSINESSES {
    uuid id PK
    text slug UK
    text timezone
    time opens_at
    time closes_at
    smallint_array open_days
    smallint slot_interval_minutes
  }
  USERS {
    uuid id PK
    uuid business_id FK
    citext email "UK with business_id"
    text password_hash
    text full_name
    text role
  }
  SERVICES {
    uuid id PK
    uuid business_id FK
    text name "UK with business_id"
    smallint duration_minutes
    int price_cents
    bool is_active
  }
  APPOINTMENTS {
    uuid id PK
    uuid business_id FK
    uuid user_id FK
    uuid service_id FK
    uuid chat_session_id FK
    timestamptz starts_at
    timestamptz ends_at
    text status
    text source
    text idempotency_key
  }
  CHAT_SESSIONS {
    uuid id PK
    uuid business_id FK
    uuid user_id FK
    text state
    jsonb booking_draft
    smallint failed_turns
    timestamptz reply_pending_since
    timestamptz last_message_at
  }
  CHAT_MESSAGES {
    bigint id PK
    uuid session_id FK
    text role
    text content
    jsonb metadata
  }
  AI_INTERACTIONS {
    bigint id PK
    uuid session_id FK
    text model
    text status
    int latency_ms
    int prompt_tokens
    text raw_output
  }
```

## 5. Deployment and CI/CD

From a push to the live URL.

```mermaid
flowchart LR
  Dev["git push"] --> GH["GitHub (public repo)"]
  GH --> CI["GitHub Actions<br/>lint, typecheck, tests (Postgres service),<br/>build, Playwright, docker build"]
  GH -- "push to main" --> R["Render: docker build"]
  R --> RUN["Container: migrate -> seed if empty -> node dist/server.js"]
  RUN --> NEON[("Neon Postgres")]
  RUN --> MIS["Gemini API"]
  RUN --> URL["https://slotpilot.onrender.com"]
```

## 6. Key decisions

**1. Monorepo with a shared Zod contract.** Frontend and backend need the same request shapes, validation rules, error
codes and event names. npm workspaces hold `apps/web`, `apps/api` and `packages/shared`, which contains the Zod schemas
and types used by the API for validation and by the web app for forms. The apps never import each other (ESLint
enforces it) and talk only over HTTP and WebSocket. _Trade-off:_ both apps release together, which suits a single deploy.

**2. The LLM extracts, code validates, the user confirms.** Booking has consequences, and models misread dates and invent
services. Gemini only returns `{ intent, fields, reply }` (JSON mode, response schema, temperature 0, validated with Zod).
Deterministic code checks service, day, hours and availability and writes the summary, and nothing is booked until the
user presses Confirm. Provider errors, invalid output or a stalled conversation hand over to the pre-filled form.
_Trade-off:_ less agentic. Function calling fits once the assistant has many actions.

**3. REST for commands, Socket.IO for events, polling fallback.** A chat reply depends on an LLM call that can take
seconds, and holding a request open for it is fragile. Every client action is a REST call, and sending a chat message
returns `202`. The server pushes `chat:message`, `chat:typing` and `appointment:*` events to the room `user:<id>`, and the
chat polls every 2 s if the socket is down. _Trade-off:_ the background turn runs in-process, so a crash mid-turn loses that
reply, and multiple instances need the Socket.IO Redis adapter.

**4. Double booking is prevented by a Postgres exclusion constraint.** Checking availability in code and then inserting is
a race. The constraint `EXCLUDE USING gist (business_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&) WHERE
status IN ('pending', 'confirmed')` makes the database the final authority, and a violation maps to `409 SLOT_UNAVAILABLE`
with alternatives. An `Idempotency-Key` makes retries safe, and an integration test books in parallel to prove it.
_Trade-off:_ needs `btree_gist`, and multiple staff would add `resource_id` to the constraint.

**5. JWT in an httpOnly cookie, single-origin deployment.** Tokens in `localStorage` can be stolen through XSS, and separate
origins need CORS and cross-origin WebSockets. The JWT (HS256, 24 h) lives in an `httpOnly`, `SameSite=Lax`, `Secure`
cookie that also authenticates the socket handshake. Express serves the built React app, so the browser sees one origin.
Passwords use bcrypt (cost 12). _Trade-off:_ tokens cannot be revoked before they expire. A token version or refresh
rotation would fix that.

**6. Raw SQL with a small migration runner instead of an ORM.** The model relies on exclusion constraints, range types,
composite tenant foreign keys, partial and BRIN indexes and `citext`, which ORMs handle poorly. Migrations are plain SQL
files run by a small runner (ordered, one transaction per file, advisory lock). Repositories use parameterized `pg` queries
scoped by `business_id`. _Trade-off:_ more mapping code and no compile-time SQL checking. Kysely would add typed queries.
