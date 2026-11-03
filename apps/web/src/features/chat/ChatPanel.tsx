import { useEffect, useRef } from 'react';
import { Bot, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/cn';
import { isApiError } from '@/lib/api';
import type { SocketStatus } from '@/lib/socket';
import { useOpenBooking } from '@/features/appointments/BookingContext';
import { useChat } from './useChat';
import { MessageBubble } from './MessageBubble';
import { TypingIndicator } from './TypingIndicator';
import { SuggestionChips } from './SuggestionChips';
import { Composer } from './Composer';
import { draftToInitial } from './draft';

const statusText: Record<SocketStatus, string> = {
  connected: 'Online',
  connecting: 'Connecting',
  disconnected: 'Reconnecting',
};

export function ChatPanel({ compactHeader = false }: { compactHeader?: boolean }) {
  const chat = useChat();
  const openBooking = useOpenBooking();
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const session = chat.session.data;
  const messages = chat.messages.data ?? [];

  // Auto-scroll on new content, unless the user scrolled up to read history.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages.length, chat.typing]);

  // Derived from the messages themselves, so it is correct in polling mode too.
  const latestSummaryIndex = messages.findLastIndex((m) => m.metadata.card === 'booking_summary');
  const summaryStillActive =
    latestSummaryIndex >= 0 &&
    !messages
      .slice(latestSummaryIndex + 1)
      .some((m) => m.role === 'assistant' && (m.metadata.card || m.metadata.draft));
  const activeSummaryId = summaryStillActive ? messages[latestSummaryIndex]!.id : undefined;
  const currentDraft =
    messages.findLast((m) => m.role === 'assistant' && m.metadata.draft)?.metadata.draft ?? session?.draft;
  const last = messages[messages.length - 1];
  const sendError = chat.send.error;

  const send = async (text: string) => {
    stickToBottom.current = true;
    await chat.send.mutateAsync(text);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {!compactHeader && (
        <div className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-full bg-gradient-to-br from-primary-soft to-surface-muted text-primary-soft-fg ring-1 ring-primary/15">
              <Bot className="size-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-[15px] font-semibold leading-tight">Booking assistant</h2>
              <ConnectionStatus status={chat.socketStatus} />
            </div>
          </div>
          <NewChatButton onClick={() => chat.newConversation.mutate()} loading={chat.newConversation.isPending} />
        </div>
      )}
      {compactHeader && (
        <div className="flex items-center justify-between border-b border-border px-4 py-2">
          <ConnectionStatus status={chat.socketStatus} />
          <NewChatButton onClick={() => chat.newConversation.mutate()} loading={chat.newConversation.isPending} />
        </div>
      )}

      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-4"
      >
        {chat.session.isError || chat.messages.isError ? (
          <Alert
            action={
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  void chat.session.refetch();
                  void chat.messages.refetch();
                }}
              >
                Retry
              </Button>
            }
          >
            Couldn't load the conversation.
          </Alert>
        ) : !session || chat.messages.isPending ? (
          <div className="space-y-3" aria-label="Loading conversation">
            <Skeleton className="h-16 w-4/5" />
            <Skeleton className="ml-auto h-10 w-3/5" />
          </div>
        ) : (
          <ol role="log" aria-live="polite" aria-label="Conversation" className="space-y-3">
            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} sessionId={session.id} summaryActive={m.id === activeSummaryId} />
            ))}
            {chat.typing && (
              <li>
                <TypingIndicator />
              </li>
            )}
          </ol>
        )}
        {last?.role === 'assistant' && !chat.awaitingReply && (last.metadata.suggestions?.length ?? 0) > 0 && (
          <SuggestionChips
            suggestions={last.metadata.suggestions!}
            disabled={chat.send.isPending}
            onPick={(s) => void send(s).catch(() => undefined)}
          />
        )}
      </div>

      <div className="space-y-2 border-t border-border/70 bg-surface-muted/30 p-3">
        {chat.timedOut && (
          <Alert
            tone="info"
            action={
              <div className="flex gap-1">
                <Button size="sm" variant="secondary" onClick={chat.refresh}>
                  Check again
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => openBooking(draftToInitial(currentDraft, session?.id))}
                >
                  Use form
                </Button>
              </div>
            }
          >
            This is taking longer than usual.
          </Alert>
        )}
        {sendError && !chat.send.isPending && (
          <Alert className="py-2">
            {isApiError(sendError) ? sendError.message : 'Message not sent. Please try again.'}
          </Alert>
        )}
        <Composer
          disabled={!session || chat.awaitingReply}
          busy={chat.send.isPending}
          onSend={send}
          placeholder={chat.awaitingReply ? 'Waiting for the assistant…' : 'e.g. A cleaning tomorrow at 3pm'}
        />
        <p className="text-center text-xs text-fg-subtle">
          Prefer a form?{' '}
          <button
            type="button"
            className="font-medium text-primary underline decoration-primary/30 underline-offset-4 transition-colors hover:decoration-primary cursor-pointer"
            onClick={() => openBooking(draftToInitial(currentDraft, session?.id))}
          >
            Book manually
          </button>
        </p>
      </div>
    </div>
  );
}

function ConnectionStatus({ status }: { status: SocketStatus }) {
  return (
    <p className="flex items-center gap-1.5 text-xs text-fg-subtle" aria-live="polite">
      <span
        aria-hidden="true"
        className={cn(
          'size-2 rounded-full transition-colors duration-300',
          status === 'connected' ? 'bg-success' : status === 'connecting' ? 'bg-warning' : 'bg-fg-subtle',
        )}
      />
      {statusText[status]}
    </p>
  );
}

function NewChatButton({ onClick, loading }: { onClick: () => void; loading: boolean }) {
  return (
    <Button variant="ghost" size="sm" onClick={onClick} loading={loading} title="Start a new conversation">
      {!loading && <RotateCcw className="size-4" aria-hidden="true" />}
      New chat
    </Button>
  );
}
