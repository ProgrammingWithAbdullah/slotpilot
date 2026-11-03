import { useRef, useState } from 'react';
import { CalendarPlus, CalendarX2 } from 'lucide-react';
import type { AppointmentDto } from '@slotpilot/shared';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert } from '@/components/ui/alert';
import { useBusinessTimezone } from '@/lib/useBusiness';
import { EASE_OUT, gsap, ScrollTrigger, useMotion } from '@/lib/motion';
import { useAppointments } from './api';
import { AppointmentCard } from './AppointmentCard';
import { CancelDialog } from './CancelDialog';
import { useOpenBooking } from './BookingContext';

export function AppointmentList({ scope }: { scope: 'upcoming' | 'past' }) {
  const tz = useBusinessTimezone();
  const query = useAppointments(scope);
  const openBooking = useOpenBooking();
  const [toCancel, setToCancel] = useState<AppointmentDto | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];

  // Cards rise in as they scroll into view, a few at a time. Cards that already
  // played keep their place when the list updates (a new booking, "Show more").
  useMotion(
    () => {
      if (!listRef.current) return;
      const fresh = gsap.utils.toArray<HTMLElement>('[data-appointment]:not([data-revealed])', listRef.current);
      if (fresh.length === 0) return;
      gsap.set(fresh, { autoAlpha: 0, y: 18 });
      ScrollTrigger.batch(fresh, {
        start: 'top 95%',
        once: true,
        onEnter: (batch) => {
          batch.forEach((el) => el.setAttribute('data-revealed', ''));
          gsap.to(batch, { autoAlpha: 1, y: 0, duration: 0.8, ease: EASE_OUT, stagger: 0.06, overwrite: true });
        },
      });
    },
    { scope: listRef, dependencies: [items.map((a) => a.id).join()] },
  );

  if (query.isPending) {
    return (
      <ul className="space-y-3" aria-busy="true" aria-label="Loading appointments">
        {Array.from({ length: 3 }, (_, i) => (
          <li key={i} className="flex gap-4 rounded-xl border border-border/70 p-4">
            <Skeleton className="h-16 w-14 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-56" />
            </div>
          </li>
        ))}
      </ul>
    );
  }

  if (query.isError) {
    return (
      <Alert
        action={
          <Button size="sm" variant="secondary" onClick={() => void query.refetch()}>
            Retry
          </Button>
        }
      >
        Couldn't load your appointments.
      </Alert>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center rounded-xl border border-dashed border-border bg-surface-muted/40 px-6 py-14 text-center">
        <span className="grid size-12 place-items-center rounded-2xl bg-surface text-primary shadow-[var(--shadow-card)] ring-1 ring-border/70">
          <CalendarX2 className="size-6" aria-hidden="true" />
        </span>
        <h3 className="mt-4 font-semibold">{scope === 'upcoming' ? 'No upcoming appointments' : 'Nothing here yet'}</h3>
        <p className="mt-1 max-w-xs text-sm text-fg-muted">
          {scope === 'upcoming'
            ? 'Ask the assistant, for example "a checkup next Monday at 10am", or use the form.'
            : 'Past and cancelled appointments will show up here.'}
        </p>
        {scope === 'upcoming' && (
          <Button variant="soft" className="mt-5" onClick={() => openBooking()}>
            <CalendarPlus className="size-4" aria-hidden="true" /> Book with the form
          </Button>
        )}
      </div>
    );
  }

  return (
    <>
      <ul ref={listRef} className="space-y-3">
        {items.map((a) => (
          <AppointmentCard
            key={a.id}
            appointment={a}
            timezone={tz}
            onCancel={scope === 'upcoming' ? setToCancel : undefined}
          />
        ))}
      </ul>
      {query.hasNextPage && (
        <div className="mt-4 flex justify-center">
          <Button variant="secondary" loading={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
            Show more
          </Button>
        </div>
      )}
      <CancelDialog appointment={toCancel} timezone={tz} onClose={() => setToCancel(null)} />
    </>
  );
}
