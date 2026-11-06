import { cn } from '@/lib/utils';
import { useLanguage } from '@/hooks/useLanguage';

type TodayMode = 'plan' | 'recap';

/**
 * Desktop Plan | Recap switch. It sits in the same spot (the date header) in
 * both modes, so switching back is where switching forward was. Phones use the
 * switch in MobileNavChrome instead.
 */
export function TodayModeToggle({
  mode,
  onChange,
  className,
}: {
  mode: TodayMode;
  onChange: (mode: TodayMode) => void;
  className?: string;
}) {
  const { lang } = useLanguage();
  const options: Array<{ value: TodayMode; label: string }> = [
    { value: 'plan', label: lang === 'zh' ? '计划' : 'Plan' },
    { value: 'recap', label: lang === 'zh' ? '回顾' : 'Recap' },
  ];

  return (
    <div
      role="tablist"
      aria-label={lang === 'zh' ? '今日视图' : 'Today view'}
      className={cn('inline-flex items-center rounded-full border border-border/50 bg-muted/40 p-[3px]', className)}
    >
      {options.map(option => {
        const selected = option.value === mode;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={selected}
            data-testid={`today-mode-toggle-${option.value}`}
            onClick={() => { if (!selected) onChange(option.value); }}
            className={cn(
              'rounded-full px-4 py-1.5 text-[13px] font-semibold tracking-tight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              selected
                ? 'bg-background text-foreground shadow-[0_1px_2px_hsl(var(--foreground)/0.08)]'
                : 'text-foreground/50 hover:text-foreground/80',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
