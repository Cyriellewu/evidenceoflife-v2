import { useState } from 'react';
import { ArrowRight, CheckCircle2, ChevronDown, Circle, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FirstRunSteps } from '@/lib/firstRun';

interface FirstRunChecklistProps {
  steps: FirstRunSteps;
  lang: string;
  onAddTask: () => void;
  onLogMoment: () => void;
  onSeeRecap: () => void;
  onDismiss: () => void;
}

/**
 * Compact first-run checklist shown at the top of the Plan list for new
 * accounts. Each row *does* the step (focus the composer / open capture), so
 * it works on phones where the Capture button lives on the timeline pane.
 */
export function FirstRunChecklist({ steps, lang, onAddTask, onLogMoment, onSeeRecap, onDismiss }: FirstRunChecklistProps) {
  const zh = lang === 'zh';
  // Collapse to one line once the first step is done, unless reopened.
  const [expanded, setExpanded] = useState(false);
  const collapsed = steps.task && !steps.allRequiredDone && !expanded;
  const counter = `${steps.doneCount}/${steps.requiredCount}`;

  const dismissButton = (
    <button
      type="button"
      onClick={onDismiss}
      aria-label={zh ? '隐藏引导' : 'Hide guide'}
      className="-mr-2 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-muted-foreground/50 transition-colors hover:bg-secondary hover:text-foreground/80"
    >
      <X size={14} strokeWidth={2} />
    </button>
  );

  const shell = 'mb-2 rounded-2xl border border-border/50 bg-card/45 px-3.5 animate-fade-in';

  if (steps.allRequiredDone) {
    return (
      <div data-testid="first-run-checklist" className={cn(shell, 'flex items-center gap-2 py-2.5')}>
        <CheckCircle2 size={14} strokeWidth={2} className="flex-shrink-0 text-primary/80" />
        <p className="min-w-0 flex-1 text-[13px] font-medium text-foreground/85">
          {zh ? '你的一天开始了。' : "You've started your day."}
        </p>
        <button
          type="button"
          onClick={onSeeRecap}
          className="inline-flex flex-shrink-0 items-center gap-1 text-[12.5px] font-medium text-primary hover:underline"
        >
          {zh ? '看看今天的回顾' : "See today's recap"}
          <ArrowRight size={13} strokeWidth={2} />
        </button>
        {dismissButton}
      </div>
    );
  }

  if (collapsed) {
    return (
      <div data-testid="first-run-checklist" className={cn(shell, 'flex items-center gap-2 py-1')}>
        <button
          type="button"
          onClick={onLogMoment}
          className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left text-[12.5px] text-muted-foreground/75 hover:text-foreground/85"
        >
          <span className="tabular-nums text-foreground/70">{counter}</span>
          <span className="text-muted-foreground/40">·</span>
          <span className="truncate">{zh ? '下一步：记录此刻' : 'Next: log a moment'}</span>
          <ArrowRight size={13} strokeWidth={2} className="flex-shrink-0" />
        </button>
        <button
          type="button"
          onClick={() => setExpanded(true)}
          aria-label={zh ? '展开引导' : 'Show steps'}
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-muted-foreground/50 hover:bg-secondary hover:text-foreground/80"
        >
          <ChevronDown size={14} strokeWidth={2} />
        </button>
        {dismissButton}
      </div>
    );
  }

  const rows: { key: string; done: boolean; label: string; optional?: boolean; onClick?: () => void }[] = [
    { key: 'task', done: steps.task, label: zh ? '加一件今天要做的事' : 'Add one thing to do today', onClick: onAddTask },
    { key: 'timer', done: steps.timer, label: zh ? '可选 · 点任务上的 ▶ 开始计时' : 'Optional · tap ▶ on a task to time it', optional: true },
    { key: 'moment', done: steps.moment, label: zh ? '记录此刻' : 'Log a moment', onClick: onLogMoment },
  ];

  return (
    <div data-testid="first-run-checklist" className={cn(shell, 'pb-1.5 pt-1.5')}>
      <div className="flex items-center gap-2">
        <p className="flex-1 text-[13px] font-medium text-foreground/85">{zh ? '开始使用' : 'Get started'}</p>
        <span className="text-[12px] tabular-nums text-muted-foreground/60">{counter}</span>
        {dismissButton}
      </div>
      <ul>
        {rows.map(row => {
          const Icon = row.done ? CheckCircle2 : Circle;
          const content = (
            <>
              <Icon
                size={14}
                strokeWidth={2}
                className={cn('flex-shrink-0', row.done ? 'text-primary/80' : 'text-muted-foreground/40')}
              />
              <span
                className={cn(
                  'min-w-0 flex-1 truncate text-[12.5px]',
                  row.done
                    ? 'text-muted-foreground/45 line-through'
                    : row.optional
                      ? 'text-muted-foreground/55'
                      : 'text-muted-foreground/80',
                )}
              >
                {row.label}
              </span>
            </>
          );
          return (
            <li key={row.key}>
              {row.onClick && !row.done ? (
                <button
                  type="button"
                  onClick={row.onClick}
                  className="flex h-8 w-full items-center gap-2 rounded-lg text-left transition-colors hover:text-foreground"
                >
                  {content}
                </button>
              ) : (
                <div className="flex h-8 items-center gap-2">{content}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
