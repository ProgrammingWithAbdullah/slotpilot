import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { apiError, server } from '@/test/server';
import { renderApp } from '@/test/render';
import { appointment, services } from '@/test/fixtures';
import { BookingDialog } from './BookingDialog';
import { AppointmentList } from './AppointmentList';

const slots = ['2030-01-08T10:00:00+05:00', '2030-01-08T10:30:00+05:00'];

describe('BookingDialog', () => {
  it('books the selected service and time with an idempotency key', async () => {
    let body: unknown;
    let key: string | null = null;
    server.use(
      http.get('*/api/v1/availability', () =>
        HttpResponse.json({
          data: { date: '2030-01-08', timezone: 'Asia/Karachi', serviceId: services[0]!.id, slots },
        }),
      ),
      http.post('*/api/v1/appointments', async ({ request }) => {
        body = await request.json();
        key = request.headers.get('Idempotency-Key');
        return HttpResponse.json({ data: appointment }, { status: 201 });
      }),
    );
    renderApp(<BookingDialog open onOpenChange={() => undefined} />);
    await userEvent.click(await screen.findByRole('radio', { name: /Checkup/ }));
    await userEvent.click(await screen.findByRole('radio', { name: '10:30 AM' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirm booking' }));
    await waitFor(() => expect(body).toEqual({ serviceId: services[0]!.id, startsAt: slots[1] }));
    expect(key).toMatch(/^form-/);
  });

  it('pre-fills from the assistant draft and handles a taken slot', async () => {
    server.use(
      http.get('*/api/v1/availability', () =>
        HttpResponse.json({
          data: { date: '2030-01-08', timezone: 'Asia/Karachi', serviceId: services[1]!.id, slots },
        }),
      ),
      http.post('*/api/v1/appointments', () => apiError(409, 'SLOT_UNAVAILABLE', 'taken', { alternatives: [] })),
    );
    renderApp(
      <BookingDialog
        open
        onOpenChange={() => undefined}
        initial={{ serviceId: services[1]!.id, date: '2030-01-08', time: '10:00', chatSessionId: 's' }}
      />,
    );
    expect(await screen.findByText(/filled in what the assistant understood/)).toBeInTheDocument();
    expect(await screen.findByRole('radio', { name: '10:00 AM' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: /Cleaning/ })).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Confirm booking' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('that time was just taken');
    expect(screen.getByRole('radio', { name: '10:00 AM' })).toHaveAttribute('aria-checked', 'false');
  });
});

describe('AppointmentList', () => {
  it('shows an empty state with a way to book', async () => {
    renderApp(<AppointmentList scope="upcoming" />);
    expect(await screen.findByText('No upcoming appointments')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Book with the form/ })).toBeInTheDocument();
  });

  it('lists appointments in the business timezone and cancels after confirmation', async () => {
    let cancelled = false;
    server.use(
      http.get('*/api/v1/appointments', () =>
        HttpResponse.json({ data: cancelled ? [] : [appointment], meta: { nextCursor: null } }),
      ),
      http.post('*/api/v1/appointments/:id/cancel', () => {
        cancelled = true;
        return HttpResponse.json({ data: { ...appointment, status: 'cancelled' } });
      }),
    );
    renderApp(<AppointmentList scope="upcoming" />);
    // 10:00Z is 3:00 PM in Karachi (UTC+5)
    expect(await screen.findByText(/3:00 PM to 3:45 PM/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^Cancel Cleaning/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel appointment' }));
    expect(await screen.findByText('No upcoming appointments')).toBeInTheDocument();
  });
});
