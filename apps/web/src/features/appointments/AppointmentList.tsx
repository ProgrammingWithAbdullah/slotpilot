import { useState } from 'react';
import { CalendarPlus, CalendarX2 } from 'lucide-react';
import type { AppointmentDto } from '@slotpilot/shared';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert } from '@/components/ui/alert';
import { useBusinessTimezone } from '@/lib/useBusiness';
import { useAppointments } from './api';
import { AppointmentCard } from './AppointmentCard';
import { CancelDialog } from './CancelDialog';
import { useOpenBooking } from './BookingContext';

export function AppointmentList({ scope }: { scope: 'upcoming' | 'past' }) {
  const tz = useBusinessTimezone();
  const query = useAppointments(scope);
  const openBooking = useOpenBooking();
  const [toCancel, setToCancel] = useState<AppointmentDto | null>(null);

  if (query.isPending) {
    return (
      <ul className="space-y-3" aria-busy="true" aria-label="Loading appointments">
        {Array.from({ length: 3 }, (_, i) => (
          <li key={i} className="flex gap-4 rounded-xl border border-border p-4">
            <Skeleton className="h-16 w-14" />
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

  const items = query.data.pages.flatMap((p) => p.items);
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center rounded-xl border border-dashed border-border px-6 py-12 text-center">
        <span className="grid size-12 place-items-center rounded-full bg-surface-muted text-fg-subtle">
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
      <ul className="space-y-3">
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
