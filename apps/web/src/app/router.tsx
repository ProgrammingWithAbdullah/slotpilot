import { createBrowserRouter } from 'react-router';
import { RedirectIfAuthed, RequireAuth } from '@/features/auth/RequireAuth';
import { LoginPage } from '@/features/auth/LoginPage';
import { SignupPage } from '@/features/auth/SignupPage';
import { DashboardPage } from '@/features/appointments/DashboardPage';
import { AppLayout } from './AppLayout';
import { NotFoundPage } from './NotFoundPage';

export const router = createBrowserRouter([
  {
    path: '/login',
    element: (
      <RedirectIfAuthed>
        <LoginPage />
      </RedirectIfAuthed>
    ),
  },
  {
    path: '/signup',
    element: (
      <RedirectIfAuthed>
        <SignupPage />
      </RedirectIfAuthed>
    ),
  },
  {
    element: (
      <RequireAuth>
        <AppLayout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <DashboardPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
