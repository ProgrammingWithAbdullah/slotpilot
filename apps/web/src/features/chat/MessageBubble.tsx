import { CheckCircle2, ClipboardList } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { useOpenBooking } from '@/features/appointments/BookingContext';
import type { UiMessage } from './useChat';
import { BookingSummaryCard } from './BookingSummaryCard';
import { draftToInitial } from './draft';

export function MessageBubble({
  message: m,
  sessionId,
  summaryActive,
}: {
  message: UiMessage;
  sessionId: string;
  summaryActive: boolean;
}) {
  const openBooking = useOpenBooking();
  const mine = m.role === 'user';
  const card = m.metadata.card;

  return (
    <li className={cn('flex animate-fade-in flex-col', mine ? 'items-end' : 'items-start')}>
      <span className="sr-only">{mine ? 'You said:' : 'Assistant said:'}</span>
      <div
        className={cn(
          'max-w-[88%] whitespace-pre-wrap break-words px-3.5 py-2.5 text-[15px] leading-snug',
          mine
            ? 'rounded-2xl rounded-br-md bg-primary text-primary-fg shadow-[var(--shadow-button)]'
            : 'rounded-2xl rounded-bl-md bg-surface-muted text-fg',
          card === 'booked' && 'border border-success/30 bg-success-soft',
          m.pending && 'opacity-70',
        )}
      >
        {card === 'booked' && <CheckCircle2 className="mb-1 size-5 text-success" aria-hidden="true" />}
        {m.content}
      </div>

      {card === 'booking_summary' && m.metadata.draft && (
        <BookingSummaryCard messageId={m.id} draft={m.metadata.draft} sessionId={sessionId} active={summaryActive} />
      )}

      {card === 'fallback_form' && (
        <Button
          variant="soft"
          size="sm"
          className="mt-2"
          onClick={() => openBooking(draftToInitial(m.metadata.draft, sessionId))}
        >
          <ClipboardList className="size-4" aria-hidden="true" /> Open the booking form
        </Button>
      )}
    </li>
  );
}
