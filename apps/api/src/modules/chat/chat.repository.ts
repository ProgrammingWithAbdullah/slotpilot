import type pg from 'pg';
import type { BookingDraft, ChatMessageDto, ChatSessionDto, ChatState, MessageMetadata } from '@slotpilot/shared';
import { withTransaction, type Queryable } from '../../db/pool.js';

interface SessionRow {
  id: string;
  title: string | null;
  state: ChatState;
  booking_draft: BookingDraft;
  failed_turns: number;
  reply_pending_since: Date | null;
  last_message_at: Date;
  created_at: Date;
}

interface MessageRow {
  id: number;
  session_id: string;
  role: 'user' | 'assistant';
  content: string;
  metadata: MessageMetadata;
  created_at: Date;
}

export interface SessionRecord extends ChatSessionDto {
  failedTurns: number;
}

/** A reply claim older than this is considered abandoned (e.g. the process crashed mid-reply). */
export const STALE_CLAIM_SECONDS = 30;

const SESSION_COLUMNS =
  'id, title, state, booking_draft, failed_turns, reply_pending_since, last_message_at, created_at';

const toSession = (r: SessionRow): SessionRecord => ({
  id: r.id,
  title: r.title,
  state: r.state,
  draft: r.booking_draft,
  failedTurns: r.failed_turns,
  replyPending:
    r.reply_pending_since !== null && Date.now() - r.reply_pending_since.getTime() < STALE_CLAIM_SECONDS * 1000,
  lastMessageAt: r.last_message_at.toISOString(),
  createdAt: r.created_at.toISOString(),
});

export const toPublicSession = ({ failedTurns: _f, ...dto }: SessionRecord): ChatSessionDto => dto;

const toMessage = (r: MessageRow): ChatMessageDto => ({
  id: r.id,
  sessionId: r.session_id,
  role: r.role,
  content: r.content,
  metadata: r.metadata,
  createdAt: r.created_at.toISOString(),
});

async function insertMessage(
  q: Queryable,
  sessionId: string,
  role: 'user' | 'assistant',
  content: string,
  metadata: MessageMetadata = {},
): Promise<ChatMessageDto> {
  const { rows } = await q.query<MessageRow>(
    `INSERT INTO chat_messages (session_id, role, content, metadata) VALUES ($1, $2, $3, $4)
     RETURNING id, session_id, role, content, metadata, created_at`,
    [sessionId, role, content, JSON.stringify(metadata)],
  );
  return toMessage(rows[0]!);
}

export function createChatRepository(pool: pg.Pool) {
  return {
    async createSession(
      businessId: string,
      userId: string,
      welcome: { content: string; metadata: MessageMetadata },
    ): Promise<SessionRecord> {
      return withTransaction(pool, async (tx) => {
        // Only one open conversation per user: older ones are closed.
        await tx.query(
          `UPDATE chat_sessions SET state = 'closed'
           WHERE business_id = $1 AND user_id = $2 AND state <> 'closed'`,
          [businessId, userId],
        );
        const { rows } = await tx.query<SessionRow>(
          `INSERT INTO chat_sessions (business_id, user_id) VALUES ($1, $2) RETURNING ${SESSION_COLUMNS}`,
          [businessId, userId],
        );
        await insertMessage(tx, rows[0]!.id, 'assistant', welcome.content, welcome.metadata);
        return toSession(rows[0]!);
      });
    },

    async listSessions(businessId: string, userId: string, limit: number): Promise<SessionRecord[]> {
      const { rows } = await pool.query<SessionRow>(
        `SELECT ${SESSION_COLUMNS} FROM chat_sessions
         WHERE business_id = $1 AND user_id = $2
         ORDER BY last_message_at DESC LIMIT $3`,
        [businessId, userId, limit],
      );
      return rows.map(toSession);
    },

    async findSession(businessId: string, userId: string, id: string): Promise<SessionRecord | null> {
      const { rows } = await pool.query<SessionRow>(
        `SELECT ${SESSION_COLUMNS} FROM chat_sessions WHERE business_id = $1 AND user_id = $2 AND id = $3`,
        [businessId, userId, id],
      );
      return rows[0] ? toSession(rows[0]) : null;
    },

    async isOwnedBy(businessId: string, userId: string, id: string): Promise<boolean> {
      const { rowCount } = await pool.query(
        'SELECT 1 FROM chat_sessions WHERE business_id = $1 AND user_id = $2 AND id = $3',
        [businessId, userId, id],
      );
      return rowCount === 1;
    },

    /**
     * Atomically claims the session for one AI reply and stores the user's message.
     * Returns null if another reply is still in progress (no locks are held during the LLM call).
     */
    async claimAndAddUserMessage(
      businessId: string,
      userId: string,
      sessionId: string,
      content: string,
    ): Promise<ChatMessageDto | null> {
      return withTransaction(pool, async (tx) => {
        const { rowCount } = await tx.query(
          `UPDATE chat_sessions
           SET reply_pending_since = now(), last_message_at = now(),
               title = COALESCE(title, left($4, 60)),
               state = CASE WHEN state = 'closed' THEN 'collecting' ELSE state END
           WHERE business_id = $1 AND user_id = $2 AND id = $3
             AND (reply_pending_since IS NULL
                  OR reply_pending_since < now() - make_interval(secs => ${STALE_CLAIM_SECONDS}))`,
          [businessId, userId, sessionId, content],
        );
        if (rowCount !== 1) return null;
        return insertMessage(tx, sessionId, 'user', content);
      });
    },

    async recentMessages(sessionId: string, limit: number): Promise<ChatMessageDto[]> {
      const { rows } = await pool.query<MessageRow>(
        `SELECT * FROM (
           SELECT id, session_id, role, content, metadata, created_at FROM chat_messages
           WHERE session_id = $1 ORDER BY id DESC LIMIT $2
         ) recent ORDER BY id ASC`,
        [sessionId, limit],
      );
      return rows.map(toMessage);
    },

    /** Messages after a given id: used for the initial load, the polling fallback and reconnect catch-up. */
    async listMessages(sessionId: string, afterId = 0, limit = 200): Promise<ChatMessageDto[]> {
      const { rows } = await pool.query<MessageRow>(
        `SELECT id, session_id, role, content, metadata, created_at FROM chat_messages
         WHERE session_id = $1 AND id > $2 ORDER BY id ASC LIMIT $3`,
        [sessionId, afterId, limit],
      );
      return rows.map(toMessage);
    },

    /** Stores the assistant reply, the new draft/state, and releases the claim, in one transaction. */
    async completeTurn(
      sessionId: string,
      update: {
        draft: BookingDraft;
        state: ChatState;
        failedTurns: number;
        content: string;
        metadata: MessageMetadata;
      },
    ): Promise<ChatMessageDto> {
      return withTransaction(pool, async (tx) => {
        const message = await insertMessage(tx, sessionId, 'assistant', update.content, update.metadata);
        await tx.query(
          `UPDATE chat_sessions
           SET booking_draft = $2, state = $3, failed_turns = $4, reply_pending_since = NULL, last_message_at = now()
           WHERE id = $1`,
          [sessionId, JSON.stringify(update.draft), update.state, Math.min(update.failedTurns, 100)],
        );
        return message;
      });
    },

    async releaseClaim(sessionId: string): Promise<void> {
      await pool.query('UPDATE chat_sessions SET reply_pending_since = NULL WHERE id = $1', [sessionId]);
    },

    /** After a booking from this conversation: reset the draft and add a confirmation message. */
    async markBooked(sessionId: string, content: string, metadata: MessageMetadata): Promise<ChatMessageDto> {
      return withTransaction(pool, async (tx) => {
        await tx.query(
          `UPDATE chat_sessions
           SET state = 'booked', booking_draft = '{}', failed_turns = 0, last_message_at = now()
           WHERE id = $1`,
          [sessionId],
        );
        return insertMessage(tx, sessionId, 'assistant', content, metadata);
      });
    },
  };
}

export type ChatRepository = ReturnType<typeof createChatRepository>;
