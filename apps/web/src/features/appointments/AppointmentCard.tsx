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
    <li className="flex animate-fade-in gap-3 rounded-xl border border-border bg-surface p-3 transition-shadow hover:shadow-[var(--shadow-card)] sm:gap-4 sm:p-4">
      <div
        className={cn(
          'flex w-12 shrink-0 flex-col items-center justify-center rounded-lg py-2 sm:w-14',
          cancelled ? 'bg-surface-muted text-fg-subtle' : 'bg-primary-soft text-primary-soft-fg',
        )}
        aria-hidden="true"
      >
        <span className="text-[11px] font-medium uppercase">{weekday}</span>
        <span className="text-xl font-semibold leading-none">{day}</span>
        <span className="text-[11px] uppercase">{month}</span>
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
          <span>
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
