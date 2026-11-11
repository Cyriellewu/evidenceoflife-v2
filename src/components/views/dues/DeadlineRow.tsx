import { cn } from '@/lib/utils';
import { DEADLINE_TONES, describeDeadline, pickDeadlineIcon } from '@/lib/deadlineDisplay';
import type { DueWithStats } from '@/hooks/useDues';

/**
 * Compact deadline row (icon circle, title, time left, check). Tapping the row
 * opens the full DueCard, so steps / reminders / links stay one tap away.
 */
export function DeadlineRow({
  due,
  lang,
  expanded,
  onToggleExpand,
  onComplete,
  completed = false,
}: {
  due: DueWithStats;
  lang: string;
  expanded: boolean;
  onToggleExpand: () => void;
  /** Marks done, or — for a completed row — brings it back. */
  onComplete: () => void;
  completed?: boolean;
}) {
  const { emoji, tone } = pickDeadlineIcon(due.title);
  const info = due.due_date ? describeDeadline(due.due_date, lang) : null;
  const steps = due.steps?.length ?? 0;
  const stepsDone = due.steps?.filter(s => s.is_completed).length ?? 0;

  return (
    <div className="flex items-center gap-3 px-3.5 py-2.5">
      <button
        type="button"
        onClick={onToggleExpand}
        aria-expanded={expanded}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span aria-hidden className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[19px]', DEADLINE_TONES[tone], completed && 'opacity-50')}>
          {emoji}
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn('block truncate text-[15px] font-semibold', completed ? 'text-muted-foreground line-through decoration-muted-foreground/50' : 'text-foreground')}>{due.title}</span>
          <span className={cn('block truncate text-[13px]', !completed && info?.urgent ? 'text-[hsl(var(--deadline))]' : 'text-muted-foreground')}>
            {completed ? (lang === 'zh' ? '已完成' : 'Done') : info ? info.text : (lang === 'zh' ? '没有日期' : 'No date')}
            {steps > 0 && <span className="text-muted-foreground"> · {stepsDone}/{steps}</span>}
          </span>
        </span>
      </button>
      <button
        type="button"
        onClick={onComplete}
        aria-label={completed
          ? (lang === 'zh' ? `把「${due.title}」标为未完成` : `Mark “${due.title}” not done`)
          : (lang === 'zh' ? `完成「${due.title}」` : `Complete “${due.title}”`)}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {completed ? (
          <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-[hsl(var(--habit))] text-[12px] font-bold text-background">✓</span>
        ) : (
          <span className="h-[22px] w-[22px] rounded-full border-2 border-muted-foreground/35 transition-colors hover:border-[hsl(var(--deadline))]" />
        )}
      </button>
    </div>
  );
}
