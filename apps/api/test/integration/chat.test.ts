import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ChatMessageDto } from '@slotpilot/shared';
import {
  SERVICES,
  TUESDAY,
  at,
  buildTestApp,
  resetDatabase,
  signedInAgent,
  testPool,
  type TestApp,
} from '../helpers.js';
import type { LlmProvider } from '../../src/modules/ai/llm-provider.js';
import { LlmError } from '../../src/modules/ai/llm-provider.js';

let t: TestApp;
beforeAll(async () => {
  await resetDatabase(testPool());
  t = await buildTestApp(); // MockProvider: deterministic, offline
});
beforeEach(async () => {
  await resetDatabase(testPool());
});

type Agent = Awaited<ReturnType<typeof signedInAgent>>['agent'];

async function startChat(app: TestApp) {
  const { agent, user } = await signedInAgent(app.app);
  const res = await agent.post('/api/v1/chat/sessions').expect(201);
  return { agent, user, sessionId: res.body.data.id as string };
}

/** Sends a message, waits for the background AI turn, returns the assistant reply. */
async function say(app: TestApp, agent: Agent, sessionId: string, content: string): Promise<ChatMessageDto> {
  const res = await agent.post(`/api/v1/chat/sessions/${sessionId}/messages`).send({ content });
  expect(res.status).toBe(202);
  expect(res.body.data).toMatchObject({ role: 'user', content });
  await app.container.tasks.idle();
  const msgs = await agent.get(`/api/v1/chat/sessions/${sessionId}/messages?after=${res.body.data.id}`).expect(200);
  expect(msgs.body.data).toHaveLength(1);
  return msgs.body.data[0];
}

const fakeProvider = (complete: LlmProvider['complete']): LlmProvider => ({
  name: 'fake',
  defaultModel: 'fake-1',
  complete,
});

describe('chat sessions', () => {
  it('starts with a welcome message and suggestions', async () => {
    const { agent, sessionId } = await startChat(t);
    const res = await agent.get(`/api/v1/chat/sessions/${sessionId}/messages`).expect(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({ role: 'assistant' });
    expect(res.body.data[0].metadata.suggestions.length).toBeGreaterThan(0);
    const session = await agent.get(`/api/v1/chat/sessions/${sessionId}`).expect(200);
    expect(session.body.data).toMatchObject({ state: 'collecting', draft: {}, replyPending: false });
  });

  it('keeps conversations private: other users get 404', async () => {
    const { sessionId } = await startChat(t);
    const { agent: other } = await signedInAgent(t.app);
    await other.get(`/api/v1/chat/sessions/${sessionId}`).expect(404);
    await other.get(`/api/v1/chat/sessions/${sessionId}/messages`).expect(404);
    await other.post(`/api/v1/chat/sessions/${sessionId}/messages`).send({ content: 'hi' }).expect(404);
  });

  it('validates message content', async () => {
    const { agent, sessionId } = await startChat(t);
    await agent.post(`/api/v1/chat/sessions/${sessionId}/messages`).send({ content: '   ' }).expect(400);
    await agent
      .post(`/api/v1/chat/sessions/${sessionId}/messages`)
      .send({ content: 'x'.repeat(1001) })
      .expect(400);
  });
});

describe('booking through conversation', () => {
  it('collects service, date and time over several turns, then books on Confirm', async () => {
    const { agent, sessionId } = await startChat(t);

    const r1 = await say(t, agent, sessionId, "I'd like a cleaning");
    expect(r1.content).toMatch(/what day/i);

    const r2 = await say(t, agent, sessionId, 'tomorrow');
    expect(r2.content).toMatch(/what time/i);
    // Every free time of the day, for the compact time picker (45 min cleaning: 9:00 to 16:00).
    expect(r2.metadata.timeOptions).toHaveLength(15);
    expect(r2.metadata.timeOptions?.[0]).toBe(at(TUESDAY, '09:00'));
    expect(r2.metadata.timeOptions?.at(-1)).toBe(at(TUESDAY, '16:00'));

    const r3 = await say(t, agent, sessionId, 'at 3pm please');
    expect(r3.metadata.card).toBe('booking_summary');
    expect(r3.content).toMatch(/Cleaning on Tuesday 8 January at 3:00 PM/);
    expect(r3.metadata.draft).toMatchObject({ serviceId: SERVICES.cleaning, startsAt: at(TUESDAY, '15:00') });

    const session = await agent.get(`/api/v1/chat/sessions/${sessionId}`).expect(200);
    expect(session.body.data.state).toBe('confirming');

    // Nothing is booked until the user presses Confirm (a normal POST /appointments).
    const before = await testPool().query('SELECT count(*)::int AS n FROM appointments');
    expect(before.rows[0].n).toBe(0);

    const booked = await agent
      .post('/api/v1/appointments')
      .send({ serviceId: SERVICES.cleaning, startsAt: r3.metadata.draft!.startsAt, chatSessionId: sessionId })
      .expect(201);
    expect(booked.body.data.source).toBe('chat');

    await t.container.tasks.idle();
    const after = await agent.get(`/api/v1/chat/sessions/${sessionId}/messages?after=${r3.id}`).expect(200);
    expect(after.body.data[0]).toMatchObject({
      role: 'assistant',
      metadata: { card: 'booked', appointmentId: booked.body.data.id },
    });
    const done = await agent.get(`/api/v1/chat/sessions/${sessionId}`).expect(200);
    expect(done.body.data).toMatchObject({ state: 'booked', draft: {} });
  });

  it('understands everything in one message', async () => {
    const { agent, sessionId } = await startChat(t);
    const r = await say(t, agent, sessionId, 'Checkup tomorrow at 10:30 am');
    expect(r.metadata.card).toBe('booking_summary');
    expect(r.metadata.draft?.startsAt).toBe(at(TUESDAY, '10:30'));
  });

  it('offers the closest free times when the requested slot is taken', async () => {
    const { agent: other } = await signedInAgent(t.app);
    await other
      .post('/api/v1/appointments')
      .send({ serviceId: SERVICES.cleaning, startsAt: at(TUESDAY, '15:00') })
      .expect(201);

    const { agent, sessionId } = await startChat(t);
    const r = await say(t, agent, sessionId, 'cleaning tomorrow at 3pm');
    expect(r.content).toMatch(/already taken/);
    expect(r.metadata.card).toBeUndefined();
    expect(r.metadata.alternatives).toHaveLength(3);
    expect(r.metadata.suggestions?.[0]).toMatch(/Tuesday 8 January at/);
    expect(r.metadata.draft).toMatchObject({ serviceId: SERVICES.cleaning, date: TUESDAY });
    expect(r.metadata.draft?.time).toBeUndefined();
  });

  it('explains why a requested day is not possible', async () => {
    const { agent, sessionId } = await startChat(t);
    const r = await say(t, agent, sessionId, 'whitening on sunday at 10am');
    expect(r.content).toMatch(/closed on Sundays/);
  });

  it('never books from "yes": it re-shows the summary for the user to Confirm', async () => {
    const { agent, sessionId } = await startChat(t);
    await say(t, agent, sessionId, 'checkup tomorrow at 9am');
    const r = await say(t, agent, sessionId, 'yes');
    expect(r.metadata.card).toBe('booking_summary');
    expect(r.content).toMatch(/tap Confirm/i);
    const { rows } = await testPool().query('SELECT count(*)::int AS n FROM appointments');
    expect(rows[0].n).toBe(0);
  });

  it('hands over to the form after two turns without progress', async () => {
    const { agent, sessionId } = await startChat(t);
    const r1 = await say(t, agent, sessionId, 'hmm let me think');
    expect(r1.metadata.card).toBeUndefined();
    const r2 = await say(t, agent, sessionId, 'not sure really');
    expect(r2.metadata).toMatchObject({ card: 'fallback_form', fallbackReason: 'no_progress' });
  });

  it('logs every AI interaction', async () => {
    const { agent, sessionId } = await startChat(t);
    await say(t, agent, sessionId, 'checkup tomorrow');
    const { rows } = await testPool().query('SELECT provider, status, session_id, input_excerpt FROM ai_interactions');
    expect(rows).toEqual([
      { provider: 'mock', status: 'ok', session_id: sessionId, input_excerpt: 'checkup tomorrow' },
    ]);
  });
});

describe('cancelling through conversation', () => {
  async function book(agent: Agent, serviceId: string, startsAt: string) {
    const res = await agent.post('/api/v1/appointments').send({ serviceId, startsAt }).expect(201);
    return res.body.data.id as string;
  }

  it('lists upcoming appointments with a Cancel button, narrowed by what the user said, and cancels nothing itself', async () => {
    const { agent, sessionId } = await startChat(t);
    const checkup = await book(agent, SERVICES.checkup, at(TUESDAY, '10:00'));
    const cleaning = await book(agent, SERVICES.cleaning, at(TUESDAY, '14:00'));

    const all = await say(t, agent, sessionId, 'I want to cancel an appointment');
    expect(all.metadata.card).toBe('cancel_options');
    expect(all.metadata.appointments?.map((a) => a.id)).toEqual([checkup, cleaning]);
    expect(all.content).toMatch(/Tap Cancel/);

    const one = await say(t, agent, sessionId, 'cancel my cleaning');
    expect(one.metadata.appointments?.map((a) => a.id)).toEqual([cleaning]);

    const { rows } = await testPool().query("SELECT count(*)::int AS n FROM appointments WHERE status = 'confirmed'");
    expect(rows[0].n).toBe(2);
  });

  it("only lists the user's own appointments", async () => {
    const { agent: other } = await signedInAgent(t.app);
    await book(other, SERVICES.checkup, at(TUESDAY, '10:00'));
    const { agent, sessionId } = await startChat(t);
    const r = await say(t, agent, sessionId, 'cancel my appointment');
    expect(r.metadata.card).toBeUndefined();
    expect(r.content).toMatch(/don't have any upcoming appointments/);
  });
});

describe('AI failures and guardrails', () => {
  it('falls back to the pre-filled form when the provider fails', async () => {
    const failing = await buildTestApp({
      llmProvider: fakeProvider(async () => {
        throw new LlmError('timeout', 'timed out', true, 'fake-1');
      }),
    });
    const { agent, sessionId } = await startChat(failing);
    const r = await say(failing, agent, sessionId, 'cleaning tomorrow');
    expect(r.metadata).toMatchObject({ card: 'fallback_form', fallbackReason: 'ai_error' });
    expect(r.content).toMatch(/booking form/);
    const { rows } = await testPool().query('SELECT status FROM ai_interactions');
    expect(rows[0].status).toBe('timeout');
    // The session is released, so the user can keep going.
    const session = await agent.get(`/api/v1/chat/sessions/${sessionId}`).expect(200);
    expect(session.body.data.replyPending).toBe(false);
  });

  it('falls back when the model returns something that is not valid JSON', async () => {
    const garbage = await buildTestApp({
      llmProvider: fakeProvider(async () => ({ model: 'fake-1', text: 'Sure! Booked.' })),
    });
    const { agent, sessionId } = await startChat(garbage);
    const r = await say(garbage, agent, sessionId, 'cleaning tomorrow');
    expect(r.metadata).toMatchObject({ card: 'fallback_form', fallbackReason: 'invalid_output' });
  });

  it('does not let the model claim something was booked', async () => {
    const liar = await buildTestApp({
      llmProvider: fakeProvider(async () => ({
        model: 'fake-1',
        text: JSON.stringify({ intent: 'question', fields: {}, reply: "Done, you're booked for tomorrow!" }),
      })),
    });
    const { agent, sessionId } = await startChat(liar);
    const r = await say(liar, agent, sessionId, 'book me in for anything');
    expect(r.content).not.toMatch(/booked/i);
    expect(r.content).toMatch(/Which service/);
  });

  it('ignores fields for unknown services and lists the real ones', async () => {
    const odd = await buildTestApp({
      llmProvider: fakeProvider(async () => ({
        model: 'fake-1',
        text: JSON.stringify({ intent: 'book', fields: { service: 'Free root canal' }, reply: 'ok' }),
      })),
    });
    const { agent, sessionId } = await startChat(odd);
    const r = await say(odd, agent, sessionId, 'free root canal please');
    expect(r.content).toMatch(/don't offer "Free root canal"/);
    expect(r.metadata.suggestions).toEqual(['Checkup', 'Cleaning', 'Whitening']);
  });

  it('allows only one AI reply at a time per conversation (409 REPLY_IN_PROGRESS)', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const slow = await buildTestApp({
      llmProvider: fakeProvider(async () => {
        await gate;
        return { model: 'fake-1', text: JSON.stringify({ intent: 'smalltalk', fields: {}, reply: 'Hello!' }) };
      }),
    });
    const { agent, sessionId } = await startChat(slow);
    await agent.post(`/api/v1/chat/sessions/${sessionId}/messages`).send({ content: 'hi' }).expect(202);
    const second = await agent.post(`/api/v1/chat/sessions/${sessionId}/messages`).send({ content: 'hello?' });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('REPLY_IN_PROGRESS');
    const pending = await agent.get(`/api/v1/chat/sessions/${sessionId}`).expect(200);
    expect(pending.body.data.replyPending).toBe(true);
    release();
    await slow.container.tasks.idle();
    await agent.post(`/api/v1/chat/sessions/${sessionId}/messages`).send({ content: 'thanks' }).expect(202);
    await slow.container.tasks.idle();
  });

  it('runs in form-first mode when no AI provider is configured', async () => {
    const offline = await buildTestApp({ env: { AI_PROVIDER: 'gemini' } }); // no GEMINI_API_KEY in tests
    const { agent, sessionId } = await startChat(offline);
    const r = await say(offline, agent, sessionId, 'cleaning tomorrow');
    expect(r.metadata).toMatchObject({ card: 'fallback_form', fallbackReason: 'ai_disabled' });
  });
});
