import { cn } from '@/lib/cn';

export function Logo({ inverted = false }: { inverted?: boolean }) {
  return (
    <span
      className={cn('inline-flex items-center gap-2 font-semibold tracking-tight', inverted ? 'text-white' : 'text-fg')}
    >
      <svg viewBox="0 0 32 32" className="size-7" aria-hidden="true">
        <rect width="32" height="32" rx="8" className={inverted ? 'fill-white/15' : 'fill-primary'} />
        <path d="M9 11h14M9 16h14M9 21h8" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="22" cy="21" r="3" fill="#5eead4" />
      </svg>
      <span className="text-[17px]">SlotPilot</span>
    </span>
  );
}
