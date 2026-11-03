import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import { SERVICES, TUESDAY, at, buildTestApp, resetDatabase, signedInAgent, testPool, type TestApp } from '../helpers.js';
import { attachRealtime } from '../../src/modules/realtime/socket.js';

let t: TestApp;
let server: Server;
let url: string;
let realtime: ReturnType<typeof attachRealtime>;

beforeAll(async () => {
  await resetDatabase(testPool());
  t = await buildTestApp();
  server = createServer(t.app);
  realtime = attachRealtime({ httpServer: server, events: t.container.events, tokens: t.container.tokens, logger: t.container.logger });
  await new Promise<void>((r) => server.listen(0, r));
  url = `http://localhost:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await realtime.close();
  server.close();
});

async function login() {
  const { agent } = await signedInAgent(t.app);
  const res = await agent.get('/api/v1/auth/me');
  const cookie = (await agent.post('/api/v1/auth/login').send({ email: res.body.data.email, password: 'Password123!' })).headers['set-cookie']![0]!.split(';')[0]!;
  return { agent, cookie };
}

function open(cookie?: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const s = connect(url, { transports: ['websocket'], extraHeaders: cookie ? { cookie } : {}, reconnection: false });
    s.on('connect', () => resolve(s));
    s.on('connect_error', (err) => {
      s.close();
      reject(err);
    });
  });
}

const next = <T>(socket: Socket, event: string) => new Promise<T>((r) => socket.once(event, r));

describe('realtime', () => {
  it('rejects connections without a valid session cookie', async () => {
    await expect(open()).rejects.toThrow(/unauthorized/);
    await expect(open('sp_session=forged')).rejects.toThrow(/unauthorized/);
  });

  it('pushes typing, the AI reply and appointment events to the user\'s room only', async () => {
    const me = await login();
    const stranger = await login();
    const mine = await open(me.cookie);
    const theirs = await open(stranger.cookie);
    const leaked: string[] = [];
    theirs.onAny((event) => leaked.push(event));

    const session = await me.agent.post('/api/v1/chat/sessions').expect(201);
    const typing = next<{ isTyping: boolean }>(mine, 'chat:typing');
    const reply = next<{ message: { role: string; metadata: { card?: string } }; state: string }>(mine, 'chat:message');
    await me.agent.post(`/api/v1/chat/sessions/${session.body.data.id}/messages`).send({ content: 'checkup tomorrow at 9am' }).expect(202);

    expect((await typing).isTyping).toBe(true);
    const pushed = await reply;
    expect(pushed.message.role).toBe('assistant');
    expect(pushed.message.metadata.card).toBe('booking_summary');
    expect(pushed.state).toBe('confirming');

    const created = next<{ appointment: { id: string } }>(mine, 'appointment:created');
    const booked = await me.agent
      .post('/api/v1/appointments')
      .send({ serviceId: SERVICES.checkup, startsAt: at(TUESDAY, '09:00') })
      .expect(201);
    expect((await created).appointment.id).toBe(booked.body.data.id);

    await t.container.tasks.idle();
    expect(leaked).toEqual([]);
    mine.close();
    theirs.close();
  });
});
