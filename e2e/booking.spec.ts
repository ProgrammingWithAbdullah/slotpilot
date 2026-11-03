import { expect, test } from '@playwright/test';

test.describe('SlotPilot', () => {
  test('a new user books through the chat assistant, sees it live, then cancels it', async ({ page }) => {
    const email = `e2e-${Date.now()}@example.com`;

    // Sign up
    await page.goto('/signup');
    await page.getByLabel('Full name').fill('Erin Example');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill('Password123!');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page).toHaveURL('/');

    // Chat: the assistant extracts the details and shows a summary card. Nothing is booked yet.
    const chat = page.getByLabel('Booking assistant');
    await expect(chat.getByText('Online')).toBeVisible();
    const composer = chat.getByLabel('Message the booking assistant');
    await composer.fill('I want a cleaning next wednesday at 4pm');
    await composer.press('Enter');

    const summary = chat.getByLabel('Booking summary');
    await expect(summary).toBeVisible();
    await expect(summary.getByText('Cleaning')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Cleaning' })).toHaveCount(0);

    // Confirm: the appointment is created and appears in the list (pushed over the socket).
    await summary.getByRole('button', { name: 'Confirm' }).click();
    await expect(chat.getByText(/booked/i).last()).toBeVisible();
    const appointment = page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: 'Cleaning' }) });
    await expect(appointment).toBeVisible();
    await expect(appointment.getByText('via chat')).toBeVisible();
    await expect(appointment.getByText('confirmed')).toBeVisible();

    // The booking survives a reload (it is in the database, not just in memory).
    await page.reload();
    await expect(appointment).toBeVisible();

    // Cancel it.
    await appointment.getByRole('button', { name: /Cancel/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel appointment' }).click();
    await expect(page.getByText('Appointment cancelled')).toBeVisible();
  });

  test('the demo account can sign in and sees its seeded appointments', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);
    await page.getByRole('button', { name: 'Fill in the demo account' }).click();
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page).toHaveURL('/');
    await expect(
      page
        .getByRole('heading', { name: 'Whitening' })
        .or(page.getByRole('heading', { name: 'Cleaning' }))
        .first(),
    ).toBeVisible();
  });

  test('protected API routes reject anonymous requests with a JSON error', async ({ request }) => {
    const res = await request.get('/api/v1/appointments');
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('UNAUTHENTICATED');
  });
});
