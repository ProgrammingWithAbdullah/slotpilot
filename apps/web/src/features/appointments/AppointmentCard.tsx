import { Clock, MessageSquareText, StickyNote } from 'lucide-react';
import type { AppointmentDto } from '@slotpilot/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { dateParts, formatDate, formatTime } from '@/lib/format';

const statusTone = {
  confirmed: 'success',
  pending: 'warning',
  cancelled: 'danger',
  completed: 'neutral',
} as const;

export function AppointmentCard({
  appointment: a,
  timezone,
  onCancel,
}: {
  appointment: AppointmentDto;
  timezone: string;
  onCancel?: (a: AppointmentDto) => void;
}) {
  const { day, month, weekday } = dateParts(a.startsAt, timezone);
  const cancelled = a.status === 'cancelled';
  return (
    <li
      data-appointment
      className="group flex gap-3 rounded-[14px] border border-border/70 bg-surface p-3 transition-[border-color,box-shadow,translate] duration-200 ease-out hover:-translate-y-px hover:border-border hover:shadow-[var(--shadow-raised)] sm:gap-4 sm:p-4"
    >
      <div
        className={cn(
          'flex w-12 shrink-0 flex-col items-center justify-center rounded-[10px] py-2 tabular-nums sm:w-14',
          cancelled
            ? 'bg-surface-muted text-fg-subtle'
            : 'bg-gradient-to-b from-primary-soft to-primary-soft/60 text-primary-soft-fg ring-1 ring-inset ring-primary/10',
        )}
        aria-hidden="true"
      >
        <span className="text-[10px] font-semibold uppercase tracking-[0.08em] opacity-80">{weekday}</span>
        <span className="my-0.5 text-[22px] font-semibold leading-none tracking-tight">{day}</span>
        <span className="text-[10px] font-medium uppercase tracking-[0.08em] opacity-80">{month}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className={cn('pt-0.5 font-semibold', cancelled && 'text-fg-subtle line-through')}>{a.service.name}</h3>
          {onCancel && (
            <Button
              variant="ghost"
              size="sm"
              className="-mr-1 -mt-0.5 h-7 px-2 text-danger hover:text-danger"
              onClick={() => onCancel(a)}
            >
              Cancel
              <span className="sr-only">
                {' '}
                {a.service.name} on {formatDate(a.startsAt, timezone)}
              </span>
            </Button>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <Badge tone={statusTone[a.status]} className="capitalize">
            {a.status}
          </Badge>
          {a.source === 'chat' && (
            <Badge tone="primary" title="Booked through the assistant">
              <MessageSquareText className="size-3" aria-hidden="true" /> via chat
            </Badge>
          )}
        </div>
        <p className="mt-1.5 flex items-center gap-1.5 text-sm text-fg-muted">
          <Clock className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="sr-only">{formatDate(a.startsAt, timezone)}, </span>
          <span className="tabular-nums">
            {formatTime(a.startsAt, timezone)} to {formatTime(a.endsAt, timezone)}
            <span className="text-fg-subtle"> · {a.service.durationMinutes} min</span>
          </span>
        </p>
        {a.notes && (
          <p className="mt-1 flex items-start gap-1.5 text-sm text-fg-subtle">
            <StickyNote className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" /> {a.notes}
          </p>
        )}
      </div>
    </li>
  );
}
