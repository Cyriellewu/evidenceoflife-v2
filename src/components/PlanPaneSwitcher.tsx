import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/hooks/useLanguage';

const PLAN_MOBILE_PANE_KEY = 'plan-mobile-pane';
export const PLAN_MOBILE_PANE_EVENT = 'plan-mobile-pane-change';

export type PlanMobilePane = 'list' | 'timeline';

export function readPlanMobilePane(): PlanMobilePane {
  if (typeof window === 'undefined') return 'list';
  return localStorage.getItem(PLAN_MOBILE_PANE_KEY) === 'timeline' ? 'timeline' : 'list';
}

export function writePlanMobilePane(pane: PlanMobilePane) {
  localStorage.setItem(PLAN_MOBILE_PANE_KEY, pane);
  window.dispatchEvent(new CustomEvent(PLAN_MOBILE_PANE_EVENT, { detail: pane }));
}

/**
 * Centered Chat|Work-style pill for phone Plan — lives in the top chrome
 * so sidebar stays a drawer and content stays full-bleed.
 */
export function PlanPaneSwitcher({ className }: { className?: string }) {
  const { lang } = useLanguage();
  const [pane, setPane] = useState<PlanMobilePane>(() => readPlanMobilePane());

  useEffect(() => {
    const onChange = (event: Event) => {
      const next = (event as CustomEvent<PlanMobilePane>).detail;
      if (next === 'list' || next === 'timeline') setPane(next);
    };
    window.addEventListener(PLAN_MOBILE_PANE_EVENT, onChange);
    return () => window.removeEventListener(PLAN_MOBILE_PANE_EVENT, onChange);
  }, []);

  return (
    <div
      role="tablist"
      aria-label={lang === 'zh' ? '计划视图' : 'Plan view'}
      className={cn(
        // Strong track + border so BOTH labels stay readable in light mode
        // (inactive used to wash out into the header and look like a lone "Tasks" chip).
        'inline-flex w-full max-w-[240px] items-center rounded-full border border-border/55 bg-muted/55 p-[3px]',
        className,
      )}
    >
      <button
        type="button"
        role="tab"
        aria-selected={pane === 'list'}
        onClick={() => writePlanMobilePane('list')}
        className={cn(
          'min-w-0 flex-1 rounded-full px-3 py-1.5 text-[13px] font-semibold transition-colors',
          pane === 'list'
            ? 'bg-background text-foreground shadow-[0_1px_2px_hsl(var(--foreground)/0.08)]'
            : 'text-foreground/55 hover:text-foreground/85',
        )}
      >
        {lang === 'zh' ? '任务' : 'Tasks'}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={pane === 'timeline'}
        onClick={() => writePlanMobilePane('timeline')}
        className={cn(
          'min-w-0 flex-1 rounded-full px-3 py-1.5 text-[13px] font-semibold transition-colors',
          pane === 'timeline'
            ? 'bg-background text-foreground shadow-[0_1px_2px_hsl(var(--foreground)/0.08)]'
            : 'text-foreground/55 hover:text-foreground/85',
        )}
      >
        {lang === 'zh' ? '时间轴' : 'Timeline'}
      </button>
    </div>
  );
}
