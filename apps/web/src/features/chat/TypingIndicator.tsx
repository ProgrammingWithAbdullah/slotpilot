export function TypingIndicator() {
  return (
    <div className="inline-flex items-center gap-1 rounded-2xl rounded-bl-md bg-surface-muted px-4 py-3" role="status">
      <span className="sr-only">The assistant is typing</span>
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          aria-hidden="true"
          className="size-1.5 animate-typing-dot rounded-full bg-fg-subtle"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </div>
  );
}
