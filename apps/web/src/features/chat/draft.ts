import type { BookingDraft } from '@slotpilot/shared';
import type { BookingInitialValues } from '@/features/appointments/BookingDialog';

/** Maps the assistant's draft to the booking form's initial values (the fallback hand-over). */
export function draftToInitial(draft?: BookingDraft, chatSessionId?: string): BookingInitialValues | undefined {
  if (!draft) return chatSessionId ? { chatSessionId } : undefined;
  return {
    serviceId: draft.serviceId,
    date: draft.date,
    time: draft.time,
    notes: draft.notes,
    chatSessionId,
  };
}
