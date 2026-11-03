import { cn } from '@/lib/cn';

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'animate-shimmer rounded-md bg-surface-muted bg-[linear-gradient(90deg,transparent_25%,var(--surface)_50%,transparent_75%)] bg-[length:200%_100%]',
        className,
      )}
    />
  );
}
