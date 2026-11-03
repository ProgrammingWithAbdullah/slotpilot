export function SuggestionChips({
  suggestions,
  onPick,
  disabled,
}: {
  suggestions: string[];
  onPick: (s: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="mt-3 flex flex-wrap gap-2" aria-label="Suggested replies">
      {suggestions.map((s) => (
        <button
          key={s}
          type="button"
          disabled={disabled}
          onClick={() => onPick(s)}
          className="animate-fade-in rounded-full border border-primary/30 bg-surface px-3.5 py-1.5 text-sm font-medium text-primary shadow-[var(--shadow-card)] transition-[background-color,border-color,scale] duration-150 ease-out hover:border-primary/50 hover:bg-primary-soft enabled:active:scale-[0.96] disabled:opacity-50 cursor-pointer"
        >
          {s}
        </button>
      ))}
    </div>
  );
}
