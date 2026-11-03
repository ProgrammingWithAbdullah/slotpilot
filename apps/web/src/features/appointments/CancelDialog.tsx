import { toast } from 'sonner';
import type { AppointmentDto } from '@slotpilot/shared';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { isApiError } from '@/lib/api';
import { formatDate, formatTime } from '@/lib/format';
import { useCancelAppointment } from './api';

export function CancelDialog({
  appointment,
  timezone,
  onClose,
}: {
  appointment: AppointmentDto | null;
  timezone: string;
  onClose: () => void;
}) {
  const cancel = useCancelAppointment();
  return (
    <Dialog
      open={Boolean(appointment)}
      onOpenChange={(o) => {
        if (!o) {
          cancel.reset();
          onClose();
        }
      }}
      title="Cancel this appointment?"
      description="The time will be released for other customers."
      className="max-w-md"
    >
      {appointment && (
        <div className="space-y-4 p-5">
          <p className="rounded-lg bg-surface-muted px-4 py-3">
            <span className="font-medium">{appointment.service.name}</span>
            <br />
            <span className="text-fg-muted">
              {formatDate(appointment.startsAt, timezone)} at {formatTime(appointment.startsAt, timezone)}
            </span>
          </p>
          {cancel.isError && (
            <Alert>{isApiError(cancel.error) ? cancel.error.message : 'Could not cancel. Please try again.'}</Alert>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              Keep it
            </Button>
            <Button
              variant="danger"
              loading={cancel.isPending}
              onClick={async () => {
                await cancel.mutateAsync(appointment.id);
                toast.success('Appointment cancelled');
                onClose();
              }}
            >
              Cancel appointment
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
