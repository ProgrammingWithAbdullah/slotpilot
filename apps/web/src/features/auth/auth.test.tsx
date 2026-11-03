import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Route, Routes } from 'react-router';
import { AppLayout } from '@/app/AppLayout';
import { RequireAuth } from './RequireAuth';
import { apiError, server } from '@/test/server';
import { renderApp } from '@/test/render';
import { user } from '@/test/fixtures';
import { LoginPage } from './LoginPage';
import { SignupPage } from './SignupPage';

const loggedOut = () =>
  server.use(http.get('*/api/v1/auth/me', () => apiError(401, 'UNAUTHENTICATED', 'Please log in')));

describe('LoginPage', () => {
  it('validates fields before calling the API', async () => {
    loggedOut();
    renderApp(<LoginPage />, { route: '/login' });
    await userEvent.click(await screen.findByRole('button', { name: 'Log in' }));
    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
  });

  it('shows the server error for wrong credentials', async () => {
    loggedOut();
    server.use(
      http.post('*/api/v1/auth/login', () => apiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password')),
    );
    renderApp(<LoginPage />, { route: '/login' });
    await userEvent.click(await screen.findByRole('button', { name: 'Fill in the demo account' }));
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
  });

  it('logs in and goes to the requested page', async () => {
    loggedOut();
    server.use(http.post('*/api/v1/auth/login', () => HttpResponse.json({ data: user })));
    renderApp(
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/somewhere" element={<p>Arrived</p>} />
      </Routes>,
      { route: '/login?next=/somewhere' },
    );
    await userEvent.type(await screen.findByLabelText('Email'), 'demo@slotpilot.dev');
    await userEvent.type(screen.getByLabelText('Password'), 'Password123!');
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByText('Arrived')).toBeInTheDocument();
  });
});

describe('log out', () => {
  it('sends a signed-in user to the login page', async () => {
    server.use(http.post('*/api/v1/auth/logout', () => new HttpResponse(null, { status: 204 })));
    renderApp(
      <Routes>
        <Route
          element={
            <RequireAuth>
              <AppLayout />
            </RequireAuth>
          }
        >
          <Route path="/" element={<p>Dashboard</p>} />
        </Route>
        <Route path="/login" element={<LoginPage />} />
      </Routes>,
    );
    expect(await screen.findByText('Dashboard')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Log out' }));
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
  });
});

describe('SignupPage', () => {
  it('shows EMAIL_TAKEN under the email field', async () => {
    loggedOut();
    server.use(http.post('*/api/v1/auth/signup', () => apiError(409, 'EMAIL_TAKEN', 'taken')));
    renderApp(<SignupPage />, { route: '/signup' });
    await userEvent.type(await screen.findByLabelText('Full name'), 'Ali');
    await userEvent.type(screen.getByLabelText('Email'), 'ali@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'Password123!');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    await waitFor(() => expect(screen.getByText(/already exists/)).toBeInTheDocument());
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
  });
});
