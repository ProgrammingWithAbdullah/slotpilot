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

  test('the assistant offers every free time and can find an appointment to cancel', async ({ page }) => {
    await page.goto('/signup');
    await page.getByLabel('Full name').fill('Casey Cancel');
    await page.getByLabel('Email').fill(`e2e-cancel-${Date.now()}@example.com`);
    await page.getByLabel('Password').fill('Password123!');
    await page.getByRole('button', { name: 'Create account' }).click();

    const chat = page.getByLabel('Booking assistant');
    await expect(chat.getByText('Online')).toBeVisible();
    const composer = chat.getByLabel('Message the booking assistant');
    await composer.fill('a checkup next thursday');
    await composer.press('Enter');

    // All free times, compact: a few first, the rest one click away.
    const picker = chat.getByRole('group', { name: 'Free times' });
    await expect(picker).toBeVisible();
    await picker.getByRole('button', { name: /Show all \d+ times/ }).click();
    await picker.getByRole('button', { name: '4:30 PM' }).click();
    await chat.getByLabel('Booking summary').getByRole('button', { name: 'Confirm' }).click();
    const appointment = page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: 'Checkup' }) });
    await expect(appointment).toBeVisible();

    // Cancel through the chat: the assistant lists it, the user confirms.
    await composer.fill('please cancel my checkup');
    await composer.press('Enter');
    const options = chat.getByRole('list', { name: 'Appointments you can cancel' });
    await options.getByRole('button', { name: /Cancel/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel appointment' }).click();
    await expect(options.getByText('Cancelled')).toBeVisible();
    await expect(appointment).toHaveCount(0);
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

  test('booking with the form keeps every appointment in the list visible', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Fill in the demo account' }).click();
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page).toHaveURL('/');
    const cards = page.getByRole('tabpanel').getByRole('listitem');
    await expect(cards.first()).toBeVisible();
    const before = await cards.count();

    for (let n = 0; n < 2; n++) {
      await page.getByRole('button', { name: 'Book appointment' }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByRole('radiogroup', { name: 'Service' }).getByRole('radio').nth(n).click();
      await dialog
        .getByRole('radiogroup', { name: 'Day' })
        .getByRole('radio', { disabled: false })
        .nth(n + 1)
        .click();
      await dialog.getByRole('radiogroup', { name: 'Time' }).getByRole('radio').first().click();
      await dialog.getByRole('button', { name: 'Confirm booking' }).click();
      await expect(dialog).toBeHidden();
      await expect(cards).toHaveCount(before + n + 1);
    }

    // Every card, old and new, must end up visible: none may stay hidden by an entrance animation.
    for (const card of await cards.all()) {
      await card.scrollIntoViewIfNeeded();
      await expect(card).toBeVisible();
      await expect(card).toHaveCSS('opacity', '1');
    }
  });

  test('protected API routes reject anonymous requests with a JSON error', async ({ request }) => {
    const res = await request.get('/api/v1/appointments');
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('UNAUTHENTICATED');
  });
});
