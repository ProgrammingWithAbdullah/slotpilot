import type { ReactNode } from 'react';
import * as D from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';

/** Accessible modal (focus trap, ESC, aria) from Radix, styled with our tokens. */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
  variant = 'center',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  /** "sheet" slides up from the bottom on small screens (used for the mobile chat). */
  variant?: 'center' | 'sheet';
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="animate-overlay fixed inset-0 z-40 bg-slate-950/45 backdrop-blur-[3px]" />
        <D.Content
          className={cn(
            'fixed z-50 flex flex-col bg-surface shadow-[var(--shadow-pop)] focus:outline-none',
            variant === 'center'
              ? 'animate-dialog left-1/2 top-1/2 max-h-[92vh] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-2xl'
              : 'animate-sheet inset-x-0 bottom-0 h-[92dvh] rounded-t-3xl',
            className,
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div>
              <D.Title className="text-[17px] font-semibold tracking-tight">{title}</D.Title>
              {description ? (
                <D.Description className="mt-0.5 text-sm text-fg-subtle">{description}</D.Description>
              ) : (
                <D.Description className="sr-only">{title}</D.Description>
              )}
            </div>
            <D.Close
              className="-m-2 grid size-10 shrink-0 place-items-center rounded-lg text-fg-subtle transition-colors hover:bg-surface-muted hover:text-fg cursor-pointer"
              aria-label="Close"
            >
              <X className="size-5" aria-hidden="true" />
            </D.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">{children}</div>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
