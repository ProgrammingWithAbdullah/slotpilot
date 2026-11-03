import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Clock } from 'lucide-react';
import { toast } from 'sonner';
import type { BusinessDto } from '@slotpilot/shared';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/cn';
import { isApiError } from '@/lib/api';
import { formatDate, formatPrice, formatTime, hmIn, timezoneLabel, upcomingDays } from '@/lib/format';
import { useBusiness } from '@/lib/useBusiness';
import { newIdempotencyKey, useAvailability, useCreateAppointment, useServices } from './api';

export interface BookingInitialValues {
  serviceId?: string;
  date?: string; // YYYY-MM-DD
  time?: string; // HH:mm
  notes?: string;
  chatSessionId?: string;
}

const DAYS_AHEAD = 21;

export function BookingDialog({
  open,
  onOpenChange,
  initial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: BookingInitialValues;
}) {
  const { data: business } = useBusiness();
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Book an appointment"
      description={
        initial?.serviceId || initial?.date
          ? "We've filled in what the assistant understood."
          : 'Pick a service, a day and a free time.'
      }
      className="max-w-xl"
    >
      {business ? (
        <BookingForm business={business} initial={initial} onDone={() => onOpenChange(false)} />
      ) : (
        <div className="p-5">
          <Skeleton className="h-40" />
        </div>
      )}
    </Dialog>
  );
}

function BookingForm({
  business,
  initial,
  onDone,
}: {
  business: BusinessDto;
  initial?: BookingInitialValues;
  onDone: () => void;
}) {
  const tz = business.timezone;
  const services = useServices();
  const days = useMemo(() => upcomingDays(tz, DAYS_AHEAD), [tz]);
  const firstOpenDay = days.find((d) => business.openDays.includes(d.isoWeekday))?.date;

  const [serviceId, setServiceId] = useState(initial?.serviceId);
  const [date, setDate] = useState(initial?.date ?? firstOpenDay);
  const [startsAt, setStartsAt] = useState<string | undefined>();
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  // One key per dialog: a double-click or retry can't create two bookings.
  const idempotencyKey = useRef(newIdempotencyKey('form'));

  const availability = useAvailability(serviceId, date);
  const create = useCreateAppointment();
  const slots = availability.data?.slots ?? [];

  // Pre-select the time the assistant understood, if it's still free.
  const preselected = useRef(false);
  useEffect(() => {
    if (preselected.current || !initial?.time || !availability.data) return;
    preselected.current = true;
    const match = availability.data.slots.find((s) => hmIn(s, tz) === initial.time);
    if (match) setStartsAt(match);
  }, [availability.data, initial?.time, tz]);

  const service = services.data?.find((s) => s.id === serviceId);
  const canSubmit = Boolean(service && startsAt) && !create.isPending;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (!serviceId || !startsAt) return;
    setError(null);
    try {
      await create.mutateAsync({
        input: { serviceId, startsAt, notes: notes.trim() || undefined, chatSessionId: initial?.chatSessionId },
        idempotencyKey: idempotencyKey.current,
      });
      toast.success(`Booked: ${service!.name}, ${formatDate(startsAt, tz)} at ${formatTime(startsAt, tz)}`);
      onDone();
    } catch (err) {
      if (isApiError(err, 'SLOT_UNAVAILABLE')) {
        setError('Sorry, that time was just taken. Please pick another one.');
        setStartsAt(undefined);
        idempotencyKey.current = newIdempotencyKey('form');
        void availability.refetch();
      } else {
        setError(isApiError(err) ? err.message : 'Could not book. Please try again.');
      }
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex h-full flex-col">
      <div className="space-y-6 px-5 py-5">
        {error && <Alert>{error}</Alert>}

        <fieldset className="min-w-0">
          <legend className="mb-2 text-sm font-medium">Service</legend>
          {services.isPending ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          ) : services.isError ? (
            <Alert
              action={
                <Button size="sm" variant="secondary" onClick={() => void services.refetch()}>
                  Retry
                </Button>
              }
            >
              Couldn't load services.
            </Alert>
          ) : (
            <div role="radiogroup" aria-label="Service" className="grid gap-2 sm:grid-cols-2">
              {services.data.map((s) => {
                const selected = s.id === serviceId;
                return (
                  <button
                    key={s.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => {
                      setServiceId(s.id);
                      setStartsAt(undefined);
                    }}
                    className={cn(
                      'rounded-xl border px-3.5 py-3 text-left transition-colors cursor-pointer',
                      selected
                        ? 'border-primary bg-primary-soft ring-1 ring-primary'
                        : 'border-border hover:bg-surface-muted',
                    )}
                  >
                    <span className="flex items-center justify-between font-medium">
                      {s.name}
                      {selected && <CheckCircle2 className="size-4 text-primary" aria-hidden="true" />}
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5 text-sm text-fg-subtle">
                      <Clock className="size-3.5" aria-hidden="true" /> {s.durationMinutes} min
                      {formatPrice(s.priceCents) && <span>· {formatPrice(s.priceCents)}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          {submitted && !serviceId && <p className="mt-1.5 text-sm text-danger">Choose a service</p>}
        </fieldset>

        <fieldset className="min-w-0">
          <legend className="mb-2 text-sm font-medium">Day</legend>
          <div
            role="radiogroup"
            aria-label="Day"
            className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:thin]"
          >
            {days.map((d) => {
              const closed = !business.openDays.includes(d.isoWeekday);
              const selected = d.date === date;
              return (
                <button
                  key={d.date}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={`${d.label} ${d.day} ${d.month}${closed ? ' (closed)' : ''}`}
                  disabled={closed}
                  onClick={() => {
                    setDate(d.date);
                    setStartsAt(undefined);
                  }}
                  className={cn(
                    'flex w-14 shrink-0 flex-col items-center rounded-xl border py-2 text-sm transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-40',
                    selected ? 'border-primary bg-primary text-primary-fg' : 'border-border hover:bg-surface-muted',
                  )}
                >
                  <span className={cn('text-xs', selected ? 'text-primary-fg/80' : 'text-fg-subtle')}>{d.label}</span>
                  <span className="text-base font-semibold">{d.day}</span>
                  <span className={cn('text-xs', selected ? 'text-primary-fg/80' : 'text-fg-subtle')}>{d.month}</span>
                </button>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="min-w-0">
          <legend className="mb-2 flex w-full items-baseline justify-between text-sm font-medium">
            Time <span className="text-xs font-normal text-fg-subtle">{timezoneLabel(tz)}</span>
          </legend>
          {!serviceId ? (
            <p className="rounded-lg bg-surface-muted px-3 py-3 text-sm text-fg-subtle">
              Choose a service to see free times.
            </p>
          ) : availability.isPending ? (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {Array.from({ length: 8 }, (_, i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : availability.isError ? (
            <Alert
              action={
                <Button size="sm" variant="secondary" onClick={() => void availability.refetch()}>
                  Retry
                </Button>
              }
            >
              Couldn't load free times.
            </Alert>
          ) : slots.length === 0 ? (
            <p className="rounded-lg bg-surface-muted px-3 py-3 text-sm text-fg-subtle">
              No free times on this day. Try another day.
            </p>
          ) : (
            <div role="radiogroup" aria-label="Time" className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {slots.map((s) => {
                const selected = s === startsAt;
                return (
                  <button
                    key={s}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setStartsAt(s)}
                    className={cn(
                      'h-10 rounded-lg border text-sm font-medium tabular-nums transition-colors cursor-pointer',
                      selected
                        ? 'border-primary bg-primary text-primary-fg'
                        : 'border-border hover:border-primary hover:text-primary',
                    )}
                  >
                    {formatTime(s, tz)}
                  </button>
                );
              })}
            </div>
          )}
          {submitted && serviceId && !startsAt && <p className="mt-1.5 text-sm text-danger">Choose a time</p>}
        </fieldset>

        <div className="space-y-1.5">
          <label htmlFor="booking-notes" className="text-sm font-medium">
            Notes <span className="font-normal text-fg-subtle">(optional)</span>
          </label>
          <Textarea
            id="booking-notes"
            maxLength={500}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Anything we should know?"
          />
        </div>
      </div>

      <div className="sticky bottom-0 mt-auto flex items-center justify-between gap-3 border-t border-border bg-surface px-5 py-4">
        <p className="min-w-0 truncate text-sm text-fg-muted" aria-live="polite">
          {service && startsAt ? (
            <>
              <span className="font-medium text-fg">{service.name}</span> · {formatDate(startsAt, tz)},{' '}
              {formatTime(startsAt, tz)}
            </>
          ) : (
            'Nothing selected yet'
          )}
        </p>
        <Button type="submit" disabled={!canSubmit && submitted} loading={create.isPending}>
          Confirm booking
        </Button>
      </div>
    </form>
  );
}
