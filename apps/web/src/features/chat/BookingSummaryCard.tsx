import { useState } from 'react';
import { CalendarClock, Clock, Stethoscope } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import type { BookingDraft } from '@slotpilot/shared';
import { Button } from '@/components/ui/button';
import { isApiError } from '@/lib/api';
import { formatDate, formatTime } from '@/lib/format';
import { queryKeys } from '@/lib/queryKeys';
import { useBusinessTimezone } from '@/lib/useBusiness';
import { useOpenBooking } from '@/features/appointments/BookingContext';
import { useCreateAppointment } from '@/features/appointments/api';
import { draftToInitial } from './draft';

/**
 * The only way a chat booking happens: the user presses Confirm, which calls the same
 * POST /appointments endpoint (and rules) as the form. The AI never books by itself.
 */
export function BookingSummaryCard({
  messageId,
  draft,
  sessionId,
  active,
}: {
  messageId: number;
  draft: BookingDraft;
  sessionId: string;
  active: boolean;
}) {
  const tz = useBusinessTimezone();
  const qc = useQueryClient();
  const openBooking = useOpenBooking();
  const create = useCreateAppointment();
  const [conflict, setConflict] = useState(false);
  if (!draft.startsAt) return null;

  async function confirm() {
    setConflict(false);
    try {
      await create.mutateAsync({
        input: { serviceId: draft.serviceId!, startsAt: draft.startsAt!, notes: draft.notes, chatSessionId: sessionId },
        // Stable per card: pressing Confirm twice can never create two bookings.
        idempotencyKey: `chat-${sessionId}-${messageId}`,
      });
      toast.success('Appointment booked');
      // The confirmation message is pushed over the socket; this covers polling mode.
      setTimeout(() => void qc.invalidateQueries({ queryKey: queryKeys.chat.all }), 1000);
    } catch (err) {
      if (isApiError(err, 'SLOT_UNAVAILABLE')) setConflict(true);
      else toast.error(isApiError(err) ? err.message : 'Could not book. Please try again.');
    }
  }

  return (
    <div
      className="mt-2 w-full max-w-[88%] rounded-xl border border-border bg-surface p-3.5 shadow-[var(--shadow-card)]"
      aria-label="Booking summary"
    >
      <dl className="space-y-1.5 text-sm">
        <Row icon={<Stethoscope className="size-4" />} label="Service" value={draft.serviceName} />
        <Row
          icon={<CalendarClock className="size-4" />}
          label="When"
          value={`${formatDate(draft.startsAt, tz)}, ${formatTime(draft.startsAt, tz)}`}
        />
        <Row icon={<Clock className="size-4" />} label="Duration" value={`${draft.durationMinutes} min`} />
      </dl>
      {conflict ? (
        <div className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">
          Someone just took this time.{' '}
          <button
            type="button"
            className="font-medium underline cursor-pointer"
            onClick={() => openBooking({ serviceId: draft.serviceId, date: draft.date, chatSessionId: sessionId })}
          >
            Pick another time
          </button>
        </div>
      ) : active ? (
        <div className="mt-3 flex gap-2">
          <Button size="sm" className="flex-1" loading={create.isPending} onClick={() => void confirm()}>
            Confirm
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={create.isPending}
            onClick={() => openBooking(draftToInitial(draft, sessionId))}
          >
            Edit
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value?: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-fg-subtle" aria-hidden="true">
        {icon}
      </span>
      <dt className="sr-only">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
