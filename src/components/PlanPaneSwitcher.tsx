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
        'inline-flex items-center rounded-full bg-[hsl(var(--surface-soft))] p-0.5',
        className,
      )}
    >
      <button
        type="button"
        role="tab"
        aria-selected={pane === 'list'}
        onClick={() => writePlanMobilePane('list')}
        className={cn(
          'rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors',
          pane === 'list'
            ? 'bg-[hsl(var(--surface-contrast))] text-foreground shadow-[0_0_0_1px_hsl(var(--border)/0.35)]'
            : 'text-muted-foreground/75 hover:text-foreground/90',
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
          'rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors',
          pane === 'timeline'
            ? 'bg-[hsl(var(--surface-contrast))] text-foreground shadow-[0_0_0_1px_hsl(var(--border)/0.35)]'
            : 'text-muted-foreground/75 hover:text-foreground/90',
        )}
      >
        {lang === 'zh' ? '时间轴' : 'Timeline'}
      </button>
    </div>
  );
}
