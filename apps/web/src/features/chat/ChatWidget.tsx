import { useRef, useState } from 'react';
import { MessageSquareText } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { useMediaQuery } from '@/lib/useMediaQuery';
import { ScrollTrigger, useGSAP } from '@/lib/motion';
import { ChatPanel } from './ChatPanel';

/**
 * The assistant is EMBEDDED in the dashboard: a docked side panel on large screens,
 * and a floating launcher that opens a bottom sheet on phones.
 */
export function ChatWidget() {
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const [open, setOpen] = useState(false);
  const launcherRef = useRef<HTMLButtonElement>(null);

  // On phones the launcher tucks down to its icon while scrolling down the list and
  // shows its label again on the way up, so it never covers the content being read.
  useGSAP(
    () => {
      const launcher = launcherRef.current;
      if (!launcher) return;
      ScrollTrigger.create({
        start: 'top -64',
        end: 'max',
        onUpdate: (self) => launcher.toggleAttribute('data-compact', self.direction === 1),
        onLeaveBack: () => launcher.removeAttribute('data-compact'),
      });
    },
    { dependencies: [isDesktop], revertOnUpdate: true },
  );

  if (isDesktop) {
    return (
      <Card
        data-reveal
        className="sticky top-24 flex h-[calc(100dvh-8rem)] min-h-[520px] flex-col overflow-hidden"
        aria-label="Booking assistant"
      >
        <ChatPanel />
      </Card>
    );
  }

  return (
    <>
      <button
        ref={launcherRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Chat to book"
        className="group fixed bottom-5 right-5 z-30 flex h-14 items-center rounded-full bg-primary pl-[18px] pr-5 font-medium text-primary-fg shadow-[var(--shadow-button),var(--shadow-pop)] transition-[padding,scale,background-color] duration-300 ease-out hover:bg-primary-hover active:scale-[0.96] data-[compact]:pr-[18px] cursor-pointer"
      >
        <MessageSquareText className="size-5 shrink-0" aria-hidden="true" />
        <span
          aria-hidden="true"
          className="grid grid-cols-[1fr] opacity-100 transition-[grid-template-columns,opacity] duration-300 ease-out group-data-[compact]:grid-cols-[0fr] group-data-[compact]:opacity-0"
        >
          <span className="overflow-hidden whitespace-nowrap pl-2">Chat to book</span>
        </span>
      </button>
      <Dialog open={open} onOpenChange={setOpen} title="Booking assistant" variant="sheet">
        <div className="flex h-full flex-col">
          <ChatPanel compactHeader />
        </div>
      </Dialog>
    </>
  );
}
