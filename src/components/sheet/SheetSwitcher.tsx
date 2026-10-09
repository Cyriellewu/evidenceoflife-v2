import { cn } from '@/lib/utils';

export interface SheetSwitcherOption<K extends string> {
  key: K;
  label: string;
}

/**
 * Segmented title used when two related sheets share one nav entry
 * (Notes + Links, Deadlines + Habits). Rendered in place of the sheet title.
 */
export function SheetSwitcher<K extends string>({
  options,
  value,
  onChange,
}: {
  options: SheetSwitcherOption<K>[];
  value: K;
  onChange: (key: K) => void;
}) {
  return (
    <div role="tablist" className="inline-flex items-center gap-0.5 rounded-full border border-border/55 bg-secondary/40 p-0.5">
      {options.map(option => {
        const active = option.key === value;
        return (
          <button
            key={option.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.key)}
            className={cn(
              'rounded-full px-3.5 py-1 text-[15px] font-semibold tracking-[-0.01em] transition-colors',
              active
                ? 'bg-background text-foreground shadow-[0_0_0_1px_hsl(var(--border)/0.35)]'
                : 'text-muted-foreground/70 hover:text-foreground/85',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
