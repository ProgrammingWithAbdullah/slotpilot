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
          className="rounded-full border border-primary/40 bg-surface px-3 py-1.5 text-sm text-primary transition-colors hover:bg-primary-soft disabled:opacity-50 cursor-pointer"
        >
          {s}
        </button>
      ))}
    </div>
  );
}
