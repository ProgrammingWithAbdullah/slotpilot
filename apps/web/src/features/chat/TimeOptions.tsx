import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { formatTime, hmIn } from '@/lib/format';

/** How many times are shown before "Show all". Enough for a quick pick without flooding the chat. */
export const COLLAPSED_COUNT = 8;

const PARTS = [
  { label: 'Morning', test: (hm: string) => hm < '12:00' },
  { label: 'Afternoon', test: (hm: string) => hm >= '12:00' && hm < '17:00' },
  { label: 'Evening', test: (hm: string) => hm >= '17:00' },
];

/**
 * Every free time of the chosen day, grouped by part of day. Collapsed it shows the first few;
 * "Show all" expands in place, so the chat stays short but nothing is hidden.
 */
export function TimeOptions({
  times,
  timezone,
  onPick,
  disabled,
}: {
  times: string[];
  timezone: string;
  onPick: (label: string) => void;
  disabled?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? times : times.slice(0, COLLAPSED_COUNT);
  const hidden = times.length - visible.length;
  const groups = PARTS.map((p) => ({ label: p.label, times: visible.filter((t) => p.test(hmIn(t, timezone))) })).filter(
    (g) => g.times.length > 0,
  );

  return (
    <div className="mt-3 rounded-xl border border-border bg-surface p-3" role="group" aria-label="Free times">
      <div className="space-y-2.5">
        {groups.map((g) => (
          <div key={g.label}>
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-fg-subtle">{g.label}</p>
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
              {g.times.map((t) => {
                const label = formatTime(t, timezone);
                return (
                  <button
                    key={t}
                    type="button"
                    disabled={disabled}
                    onClick={() => onPick(label)}
                    className="cursor-pointer rounded-lg border border-primary/40 px-2 py-1.5 text-sm tabular-nums text-primary transition-colors hover:bg-primary-soft disabled:opacity-50"
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {times.length > COLLAPSED_COUNT && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
          className="mt-2.5 inline-flex cursor-pointer items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          {expanded ? (
            <>
              Show fewer <ChevronUp className="size-4" aria-hidden="true" />
            </>
          ) : (
            <>
              Show all {times.length} times ({hidden} more) <ChevronDown className="size-4" aria-hidden="true" />
            </>
          )}
        </button>
      )}
    </div>
  );
}
