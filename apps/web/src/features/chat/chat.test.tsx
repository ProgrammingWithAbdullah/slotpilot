import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { ChatMessageDto } from '@slotpilot/shared';
import { server } from '@/test/server';
import { renderApp } from '@/test/render';
import { appointment, services, session, welcome } from '@/test/fixtures';
import { ChatPanel } from './ChatPanel';

/** A tiny in-memory chat backend: replies appear on the next poll, like a slow AI. */
function chatBackend(reply: (text: string) => Partial<ChatMessageDto>) {
  const messages: ChatMessageDto[] = [welcome];
  let nextId = 2;
  server.use(
    http.get('*/api/v1/chat/sessions', () => HttpResponse.json({ data: [session] })),
    http.get('*/api/v1/chat/sessions/:id/messages', () => HttpResponse.json({ data: [...messages] })),
    http.post('*/api/v1/chat/sessions/:id/messages', async ({ request }) => {
      const { content } = (await request.json()) as { content: string };
      const userMsg: ChatMessageDto = { ...welcome, id: nextId++, role: 'user', content, metadata: {} };
      messages.push(userMsg);
      // The assistant "thinks", then the reply becomes visible to polling.
      setTimeout(() => messages.push({ ...welcome, id: nextId++, metadata: {}, ...reply(content) }), 50);
      return HttpResponse.json({ data: userMsg }, { status: 202 });
    }),
  );
  return messages;
}

const draft = {
  serviceId: services[1]!.id,
  serviceName: 'Cleaning',
  durationMinutes: 45,
  date: '2030-01-08',
  time: '15:00',
  startsAt: '2030-01-08T15:00:00+05:00',
};

describe('ChatPanel', () => {
  it('sends a message and shows the reply via the polling fallback when the socket is down', async () => {
    chatBackend(() => ({ content: 'What day suits you?' }));
    renderApp(<ChatPanel />);
    expect(await screen.findByText("Hi! I'm the booking assistant.")).toBeInTheDocument();
    expect(screen.getByText(/Connecting|Reconnecting/)).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Message the booking assistant'), 'I need a clening{Enter}');
    const log = screen.getByRole('log');
    expect(await within(log).findByText('I need a clening')).toBeInTheDocument();
    expect(screen.getByLabelText('Message the booking assistant')).toBeDisabled(); // waiting for reply
    expect(await within(log).findByText('What day suits you?', {}, { timeout: 5000 })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Message the booking assistant')).toBeEnabled());
  });

  it('sends a suggestion when its chip is clicked', async () => {
    const messages = chatBackend(() => ({ content: 'We offer Checkup and Cleaning.' }));
    renderApp(<ChatPanel />);
    await userEvent.click(await screen.findByRole('button', { name: 'What services do you offer?' }));
    await waitFor(() =>
      expect(messages.some((m) => m.role === 'user' && m.content === 'What services do you offer?')).toBe(true),
    );
  });

  it('books only when the user presses Confirm on the summary card', async () => {
    let booked: unknown;
    chatBackend(() => ({ content: 'Here is your booking.', metadata: { card: 'booking_summary', draft } }));
    server.use(
      http.post('*/api/v1/appointments', async ({ request }) => {
        booked = { body: await request.json(), key: request.headers.get('Idempotency-Key') };
        return HttpResponse.json({ data: appointment }, { status: 201 });
      }),
    );
    renderApp(<ChatPanel />);
    await screen.findByText("Hi! I'm the booking assistant.");
    await waitFor(() => expect(screen.getByLabelText('Message the booking assistant')).toBeEnabled());
    await userEvent.type(screen.getByLabelText('Message the booking assistant'), 'cleaning tomorrow at 3pm{Enter}');
    const card = await screen.findByLabelText('Booking summary', {}, { timeout: 5000 });
    expect(within(card).getByText('Cleaning')).toBeInTheDocument();
    expect(booked).toBeUndefined();
    await userEvent.click(within(card).getByRole('button', { name: 'Confirm' }));
    await waitFor(() =>
      expect(booked).toEqual({
        body: { serviceId: draft.serviceId, startsAt: draft.startsAt, chatSessionId: session.id },
        key: expect.stringMatching(/^chat-/),
      }),
    );
  });

  it('hands over to the pre-filled form when the assistant falls back', async () => {
    chatBackend(() => ({
      content: "Sorry, I'm having trouble. You can finish in the booking form.",
      metadata: { card: 'fallback_form', fallbackReason: 'ai_error', draft: { serviceId: services[1]!.id } },
    }));
    server.use(
      http.get('*/api/v1/availability', () =>
        HttpResponse.json({ data: { date: '', timezone: 'Asia/Karachi', serviceId: '', slots: [] } }),
      ),
    );
    renderApp(<ChatPanel />);
    await screen.findByText("Hi! I'm the booking assistant.");
    await waitFor(() => expect(screen.getByLabelText('Message the booking assistant')).toBeEnabled());
    await userEvent.type(screen.getByLabelText('Message the booking assistant'), 'cleaning{Enter}');
    await userEvent.click(await screen.findByRole('button', { name: /Open the booking form/ }, { timeout: 5000 }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('radio', { name: /Cleaning/ })).toHaveAttribute('aria-checked', 'true');
  });
  it('shows every free time compactly, expands on demand, and sends the picked time', async () => {
    // 9:00 to 16:00 every 30 minutes in Asia/Karachi (UTC+5).
    const times = Array.from({ length: 15 }, (_, i) =>
      new Date(Date.UTC(2030, 0, 8, 4, 0) + i * 30 * 60_000).toISOString(),
    );
    const messages = chatBackend(() => ({
      content: 'What time on Tuesday 8 January?',
      metadata: { timeOptions: times },
    }));
    renderApp(<ChatPanel />);
    await screen.findByText("Hi! I'm the booking assistant.");
    await waitFor(() => expect(screen.getByLabelText('Message the booking assistant')).toBeEnabled());
    await userEvent.type(screen.getByLabelText('Message the booking assistant'), 'cleaning tomorrow{Enter}');

    const picker = await screen.findByRole('group', { name: 'Free times' }, { timeout: 5000 });
    expect(within(picker).getAllByRole('button', { name: /AM|PM/ })).toHaveLength(8);
    await userEvent.click(within(picker).getByRole('button', { name: /Show all 15 times/ }));
    expect(within(picker).getAllByRole('button', { name: /AM|PM/ })).toHaveLength(15);
    expect(within(picker).getByText('Afternoon')).toBeInTheDocument();

    await userEvent.click(within(picker).getByRole('button', { name: '4:00 PM' }));
    await waitFor(() => expect(messages.some((m) => m.role === 'user' && m.content === '4:00 PM')).toBe(true));
  });

  it('lists appointments to cancel and cancels only after the user confirms', async () => {
    let cancelledId: string | undefined;
    chatBackend(() => ({
      content: "Here is your upcoming appointment. Tap Cancel on the one you'd like to cancel.",
      metadata: { card: 'cancel_options', appointments: [appointment] },
    }));
    server.use(
      http.post('*/api/v1/appointments/:id/cancel', ({ params }) => {
        cancelledId = params.id as string;
        return HttpResponse.json({ data: { ...appointment, status: 'cancelled' } });
      }),
    );
    renderApp(<ChatPanel />);
    await screen.findByText("Hi! I'm the booking assistant.");
    await waitFor(() => expect(screen.getByLabelText('Message the booking assistant')).toBeEnabled());
    await userEvent.type(screen.getByLabelText('Message the booking assistant'), 'cancel my appointment{Enter}');

    const list = await screen.findByRole('list', { name: 'Appointments you can cancel' }, { timeout: 5000 });
    await userEvent.click(within(list).getByRole('button', { name: /Cancel/ }));
    expect(cancelledId).toBeUndefined();
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel appointment' }),
    );
    await waitFor(() => expect(cancelledId).toBe(appointment.id));
    expect(await within(list).findByText('Cancelled')).toBeInTheDocument();
  });
});
