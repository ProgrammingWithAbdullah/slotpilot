import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { Spinner } from '@/components/ui/spinner';
import { useAuth } from './AuthProvider';

/** Three states: never decides before /auth/me answers, so there's no flash of the login page. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') {
    return (
      <div className="grid min-h-dvh place-items-center text-fg-subtle">
        <Spinner className="size-6" label="Loading your account" />
      </div>
    );
  }
  if (status === 'unauthenticated') {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  return <>{children}</>;
}

/** Login/signup pages: bounce signed-in users to the app. */
export function RedirectIfAuthed({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  if (status === 'authenticated') return <Navigate to="/" replace />;
  return <>{children}</>;
}

export function safeNext(raw: string | null): string {
  // Only allow local paths, never "//evil.com" or absolute URLs (open redirect).
  return raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/';
}
