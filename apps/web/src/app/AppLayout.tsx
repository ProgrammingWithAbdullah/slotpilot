import { useRef } from 'react';
import { Link, Outlet } from 'react-router';
import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/AuthProvider';
import { useBusiness } from '@/lib/useBusiness';
import { ScrollTrigger, useGSAP } from '@/lib/motion';
import { Logo } from './Logo';

export function AppLayout() {
  const { user, logout } = useAuth();
  const { data: business } = useBusiness();
  const headerRef = useRef<HTMLElement>(null);

  // The header lifts off the page once content scrolls under it. This is a state cue
  // (shadow + border), not motion, so it runs with reduced motion too.
  useGSAP(() => {
    const header = headerRef.current;
    if (!header) return;
    ScrollTrigger.create({
      start: 'top -8',
      end: 'max',
      onToggle: (self) => header.toggleAttribute('data-scrolled', self.isActive),
    });
  });
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
      <header
        ref={headerRef}
        className="sticky top-0 z-30 border-b border-transparent bg-bg/70 backdrop-blur-xl backdrop-saturate-150 transition-[border-color,box-shadow,background-color] duration-300 ease-out data-[scrolled]:border-border/70 data-[scrolled]:bg-surface/80 data-[scrolled]:shadow-[var(--shadow-card)]"
      >
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
                className="grid size-8 place-items-center rounded-full bg-gradient-to-br from-primary-soft to-surface-muted text-xs font-semibold tracking-wide text-primary-soft-fg ring-1 ring-primary/15"
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
      <main id="main" className="mx-auto max-w-7xl px-4 pb-28 pt-6 sm:px-6 sm:pt-10 lg:pb-10">
        <Outlet />
      </main>
    </div>
  );
}
