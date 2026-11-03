import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <>
      <Loader2 className={cn('animate-spin', className)} aria-hidden="true" />
      {label && <span className="sr-only">{label}</span>}
    </>
  );
}
