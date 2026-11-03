import { useState } from 'react';
import { MessageSquareText } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { useMediaQuery } from '@/lib/useMediaQuery';
import { ChatPanel } from './ChatPanel';

/**
 * The assistant is EMBEDDED in the dashboard: a docked side panel on large screens,
 * and a floating launcher that opens a bottom sheet on phones.
 */
export function ChatWidget() {
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const [open, setOpen] = useState(false);

  if (isDesktop) {
    return (
      <Card
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
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-30 flex items-center gap-2 rounded-full bg-primary px-5 py-3.5 font-medium text-primary-fg shadow-[var(--shadow-pop)] transition-transform hover:scale-[1.03] cursor-pointer"
      >
        <MessageSquareText className="size-5" aria-hidden="true" />
        Chat to book
      </button>
      <Dialog open={open} onOpenChange={setOpen} title="Booking assistant" variant="sheet">
        <div className="flex h-full flex-col">
          <ChatPanel compactHeader />
        </div>
      </Dialog>
    </>
  );
}
