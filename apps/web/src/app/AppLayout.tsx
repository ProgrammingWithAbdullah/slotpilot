import { Link, Outlet } from 'react-router';
import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/AuthProvider';
import { useBusiness } from '@/lib/useBusiness';
import { Logo } from './Logo';

export function AppLayout() {
  const { user, logout } = useAuth();
  const { data: business } = useBusiness();
  const initials = user?.fullName
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="min-h-dvh">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-30 border-b border-border bg-surface/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Link to="/" aria-label="SlotPilot home">
              <Logo />
            </Link>
            {business && (
              <span className="hidden truncate border-l border-border pl-3 text-sm text-fg-subtle sm:inline">
                {business.name}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2.5">
              <span
                aria-hidden="true"
                className="grid size-8 place-items-center rounded-full bg-primary-soft text-xs font-semibold text-primary-soft-fg"
              >
                {initials}
              </span>
              <span className="hidden text-sm font-medium sm:inline">{user?.fullName}</span>
            </div>
            <Button variant="ghost" size="sm" onClick={() => void logout()} aria-label="Log out">
              <LogOut className="size-4" aria-hidden="true" />
              <span className="hidden sm:inline">Log out</span>
            </Button>
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <Outlet />
      </main>
    </div>
  );
}
