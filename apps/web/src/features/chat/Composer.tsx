import { useRef, useState } from 'react';
import { SendHorizontal } from 'lucide-react';
import { MAX_MESSAGE_LENGTH } from '@slotpilot/shared';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';

export function Composer({
  onSend,
  disabled,
  busy,
  placeholder,
}: {
  onSend: (text: string) => Promise<unknown>;
  disabled?: boolean;
  busy?: boolean;
  placeholder?: string;
}) {
  const [text, setText] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);
  const trimmed = text.trim();
  const tooLong = text.length > MAX_MESSAGE_LENGTH;
  const canSend = Boolean(trimmed) && !tooLong && !disabled && !busy;

  async function submit() {
    if (!canSend) return;
    setText('');
    if (ref.current) ref.current.style.height = 'auto';
    try {
      await onSend(trimmed);
    } catch {
      setText(trimmed); // give the text back so nothing is lost
    }
    ref.current?.focus();
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="flex items-end gap-2"
    >
      <label htmlFor="chat-input" className="sr-only">
        Message the booking assistant
      </label>
      <div className="relative flex-1">
        <textarea
          id="chat-input"
          ref={ref}
          rows={1}
          value={text}
          disabled={disabled}
          placeholder={placeholder}
          aria-invalid={tooLong}
          onChange={(e) => {
            setText(e.target.value);
            e.target.style.height = 'auto';
            e.target.style.height = `${Math.min(e.target.scrollHeight, 128)}px`;
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void submit();
            }
          }}
          className={cn(
            'block max-h-32 min-h-11 w-full resize-none rounded-xl border border-border bg-surface px-3.5 py-2.5 text-[15px] placeholder:text-fg-subtle focus-visible:border-ring focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/20 disabled:opacity-60',
            tooLong && 'border-danger',
          )}
        />
        {text.length > MAX_MESSAGE_LENGTH - 100 && (
          <span className={cn('absolute bottom-1 right-2 text-[11px]', tooLong ? 'text-danger' : 'text-fg-subtle')}>
            {text.length}/{MAX_MESSAGE_LENGTH}
          </span>
        )}
      </div>
      <Button
        type="submit"
        size="icon"
        className="size-11 rounded-xl"
        disabled={!canSend}
        loading={busy}
        aria-label="Send message"
      >
        {!busy && <SendHorizontal className="size-5" aria-hidden="true" />}
      </Button>
    </form>
  );
}
