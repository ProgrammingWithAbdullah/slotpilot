import { useState } from 'react';
import type { AppointmentDto } from '@slotpilot/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatShortDate, formatTime } from '@/lib/format';
import { useBusinessTimezone } from '@/lib/useBusiness';
import { CancelDialog } from '@/features/appointments/CancelDialog';

/**
 * Appointments the user asked to cancel, found by the assistant. Cancelling still goes through the
 * same confirmation dialog and endpoint as the dashboard: the assistant itself never cancels.
 */
export function CancelOptionsCard({ appointments }: { appointments: AppointmentDto[] }) {
  const tz = useBusinessTimezone();
  const [target, setTarget] = useState<AppointmentDto | null>(null);
  const [cancelled, setCancelled] = useState<Set<string>>(() => new Set());

  return (
    <>
      <ul
        className="mt-2 w-full max-w-[88%] divide-y divide-border rounded-xl border border-border bg-surface shadow-[var(--shadow-card)]"
        aria-label="Appointments you can cancel"
      >
        {appointments.map((a) => {
          const done = cancelled.has(a.id);
          return (
            <li key={a.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
              <div className="min-w-0">
                <p className={done ? 'font-medium text-fg-subtle line-through' : 'font-medium'}>{a.service.name}</p>
                <p className="text-sm tabular-nums text-fg-muted">
                  {formatShortDate(a.startsAt, tz)}, {formatTime(a.startsAt, tz)}
                </p>
              </div>
              {done ? (
                <Badge>Cancelled</Badge>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0 text-danger hover:text-danger"
                  onClick={() => setTarget(a)}
                >
                  Cancel
                  <span className="sr-only">
                    {' '}
                    {a.service.name} on {formatShortDate(a.startsAt, tz)}
                  </span>
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      <CancelDialog
        appointment={target}
        timezone={tz}
        onClose={() => setTarget(null)}
        onCancelled={(a) => setCancelled((s) => new Set(s).add(a.id))}
      />
    </>
  );
}
