import type { ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Info } from 'lucide-react';
import { cn } from '@/lib/cn';

const tones = {
  danger: { cls: 'bg-danger-soft text-danger', Icon: AlertCircle },
  success: { cls: 'bg-success-soft text-success', Icon: CheckCircle2 },
  info: { cls: 'bg-primary-soft text-primary-soft-fg', Icon: Info },
};

export function Alert({
  tone = 'danger',
  children,
  action,
  className,
}: {
  tone?: keyof typeof tones;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const { cls, Icon } = tones[tone];
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn('flex items-start gap-2.5 rounded-lg px-3 py-2.5 text-sm', cls, className)}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="flex-1">{children}</div>
      {action}
    </div>
  );
}
