import { useState, useMemo, useRef, useEffect, KeyboardEvent } from 'react';
import { format, subDays } from 'date-fns';
import { Plus, MoreHorizontal, Trash2, Flame } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useDues, type DueWithStats } from '@/hooks/useDues';
import { useDueReminders } from '@/hooks/useDueReminders';
import { useLanguage } from '@/hooks/useLanguage';
import { cn, isImeComposing } from '@/lib/utils';
import { showUndoToast } from '@/lib/undoToast';
import { SheetHeader, SheetEmptyState } from '@/components/sheet/SheetShell';
import { DueCard } from '@/components/views/dues/DueCard';

const HUES = ['peach', 'sage', 'cream', 'lavender', 'rose', 'dusty'] as const;
type Hue = typeof HUES[number];

const CATEGORY_HUE: Record<string, Hue> = {
  Health: 'sage',
  Learning: 'cream',
  Life: 'rose',
  Uncategorized: 'lavender',
};

const HUE_CLASSES: Record<Hue, { metBg: string; metBorder: string; ring: string; doneBar: string }> = {
  peach: {
    metBg: 'bg-[hsl(var(--habit-hue-peach)/0.12)]',
    metBorder: 'border-[hsl(var(--habit-hue-peach)/0.30)]',
    ring: 'ring-[hsl(var(--habit-hue-peach)/0.55)]',
    doneBar: 'bg-[hsl(var(--habit-hue-peach)/0.70)]',
  },
  sage: {
    metBg: 'bg-[hsl(var(--habit-hue-sage)/0.12)]',
    metBorder: 'border-[hsl(var(--habit-hue-sage)/0.30)]',
    ring: 'ring-[hsl(var(--habit-hue-sage)/0.55)]',
    doneBar: 'bg-[hsl(var(--habit-hue-sage)/0.70)]',
  },
  cream: {
    metBg: 'bg-[hsl(var(--habit-hue-cream)/0.12)]',
    metBorder: 'border-[hsl(var(--habit-hue-cream)/0.30)]',
    ring: 'ring-[hsl(var(--habit-hue-cream)/0.55)]',
    doneBar: 'bg-[hsl(var(--habit-hue-cream)/0.70)]',
  },
  lavender: {
    metBg: 'bg-[hsl(var(--habit-hue-lavender)/0.12)]',
    metBorder: 'border-[hsl(var(--habit-hue-lavender)/0.30)]',
    ring: 'ring-[hsl(var(--habit-hue-lavender)/0.55)]',
    doneBar: 'bg-[hsl(var(--habit-hue-lavender)/0.70)]',
  },
  rose: {
    metBg: 'bg-[hsl(var(--habit-hue-rose)/0.12)]',
    metBorder: 'border-[hsl(var(--habit-hue-rose)/0.30)]',
    ring: 'ring-[hsl(var(--habit-hue-rose)/0.55)]',
    doneBar: 'bg-[hsl(var(--habit-hue-rose)/0.70)]',
  },
  dusty: {
    metBg: 'bg-[hsl(var(--habit-hue-dusty)/0.12)]',
    metBorder: 'border-[hsl(var(--habit-hue-dusty)/0.30)]',
    ring: 'ring-[hsl(var(--habit-hue-dusty)/0.55)]',
    doneBar: 'bg-[hsl(var(--habit-hue-dusty)/0.70)]',
  },
};

function hueFor(cat: string | null): Hue {
  if (!cat) return 'lavender';
  const preset = CATEGORY_HUE[cat];
  if (preset) return preset;
  let h = 0;
  for (let i = 0; i < cat.length; i++) h = (h * 31 + cat.charCodeAt(i)) >>> 0;
  return HUES[h % HUES.length];
}

export function HabitsView() {
  const { lang } = useLanguage();
  const {
    dues,
    addDue,
    addToToday,
    deleteDue,
    updateDue,
    addStep,
    toggleStep,
    deleteStep,
    incrementHabitCount,
    setHabitCount,
    refetch,
  } = useDues();
  const { getRemindersForDue, upsertReminder, removeReminder, toggleReminder } = useDueReminders();

  const [draft, setDraft] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const draftRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') refetch();
    }, 60000);
    return () => clearInterval(interval);
  }, [refetch]);

  const habits = useMemo(
    () => dues.filter(d => d.habit_category !== null && !d.is_completed),
    [dues],
  );

  const todayKey = format(new Date(), 'yyyy-MM-dd');
  const doneToday = habits.filter(h => (h.dailyCounts?.[todayKey] || 0) >= Math.max(1, h.targetCount || 1)).length;
  const weekBars = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const key = format(subDays(new Date(), 6 - i), 'yyyy-MM-dd');
      const total = habits.length || 1;
      const done = habits.filter(h => (h.dailyCounts?.[key] || 0) >= Math.max(1, h.targetCount || 1)).length;
      return { key, ratio: done / total, isToday: i === 6 };
    });
  }, [habits, todayKey]);

  const getRemindersForDueTree = (due: DueWithStats) => {
    const ids = [due.id, ...due.steps.map(s => s.id)];
    return ids.flatMap(id => getRemindersForDue(id));
  };

  const handleAdd = async () => {
    const title = draft.trim();
    if (!title) return;
    setDraft('');
    await addDue(title, undefined, 'Uncategorized');
    draftRef.current?.focus();
  };

  const handleDelete = (due: DueWithStats) => {
    deleteDue(due.id);
    if (expandedId === due.id) setExpandedId(null);
    showUndoToast({
      description: lang === 'zh' ? `已删除“${due.title}”` : `Deleted "${due.title}"`,
      undoLabel: lang === 'zh' ? '撤销' : 'Undo',
      onUndo: () => {
        void addDue(due.title, undefined, due.habit_category || 'Uncategorized');
      },
    });
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <SheetHeader
        title={lang === 'zh' ? '习惯' : 'Habits'}
        subtitle={
          habits.length === 0
            ? undefined
            : lang === 'zh'
              ? `今日 ${doneToday} / ${habits.length}`
              : `${doneToday} of ${habits.length} today`
        }
      />

      <div className="flex-1 overflow-y-auto px-5 pb-4 pt-4">
        {habits.length === 0 ? (
          <SheetEmptyState
            className="mt-16"
            title={lang === 'zh' ? '还没有习惯' : 'No habits yet'}
            hint={
              lang === 'zh'
                ? '在下方输入想坚持的小事,比如"喝水"。'
                : 'Type something repeatable below, like "drink water".'
            }
          />
        ) : (
          <>
            <SummaryHero
              lang={lang}
              doneToday={doneToday}
              total={habits.length}
              weekBars={weekBars}
            />

            <div className="mt-3 grid grid-cols-2 gap-2.5">
              {habits.map(habit => {
                const hue = hueFor(habit.habit_category);
                const isExpanded = expandedId === habit.id;
                return (
                  <HabitTile
                    key={habit.id}
                    habit={habit}
                    hue={hue}
                    expanded={isExpanded}
                    onToggleExpand={() =>
                      setExpandedId(prev => (prev === habit.id ? null : habit.id))
                    }
                    onIncrement={() => incrementHabitCount(habit.id)}
                    onRename={(nextTitle) => {
                      const trimmed = nextTitle.trim();
                      if (trimmed && trimmed !== habit.title) {
                        void updateDue(habit.id, { title: trimmed });
                      }
                    }}
                    onDelete={() => handleDelete(habit)}
                  />
                );
              })}
            </div>

            {expandedId && (() => {
              const expanded = habits.find(h => h.id === expandedId);
              if (!expanded) return null;
              return (
                <div className="mt-3">
                  <DueCard
                    due={expanded}
                    bare
                    onUpdate={updateDue}
                    onDelete={(id) => {
                      setExpandedId(null);
                      deleteDue(id);
                    }}
                    onAddToToday={addToToday}
                    justAdded={false}
                    dueReminders={getRemindersForDueTree(expanded)}
                    onUpsertReminder={upsertReminder}
                    onRemoveReminder={removeReminder}
                    onToggleReminder={toggleReminder}
                    onAddStep={addStep}
                    onToggleStep={toggleStep}
                    onDeleteStep={deleteStep}
                    onIncrementHabitCount={incrementHabitCount}
                    onSetHabitCount={setHabitCount}
                  />
                </div>
              );
            })()}
          </>
        )}

        <div className="mt-4 flex items-center gap-2.5">
          <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[hsl(var(--surface-soft))] text-muted-foreground/60">
            <Plus size={14} />
          </span>
          <input
            ref={draftRef}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
              const native = e.nativeEvent as unknown as globalThis.KeyboardEvent;
              if (e.key === 'Enter') {
                if (isImeComposing(native)) return;
                void handleAdd();
              }
            }}
            placeholder={lang === 'zh' ? '新习惯…' : 'New habit…'}
            className="min-w-0 flex-1 bg-transparent text-[14px] font-medium text-foreground placeholder:text-muted-foreground/45 focus:outline-none"
          />
        </div>
      </div>
    </div>
  );
}

function SummaryHero({
  lang,
  doneToday,
  total,
  weekBars,
}: {
  lang: 'zh' | 'en';
  doneToday: number;
  total: number;
  weekBars: { key: string; ratio: number; isToday: boolean }[];
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-border/60 bg-[hsl(var(--surface-soft))] px-5 py-4">
      <div className="min-w-0">
        <div className="flex items-baseline gap-1.5 leading-none">
          <span className="text-[34px] font-semibold tabular-nums tracking-[-0.03em] text-foreground">
            {doneToday}
          </span>
          <span className="text-[13px] font-medium text-muted-foreground">
            / {total} {lang === 'zh' ? '已打卡' : 'today'}
          </span>
        </div>
        <p className="mt-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
          {lang === 'zh' ? '本周节奏' : 'This week'}
        </p>
      </div>
      <div className="flex h-11 w-40 items-end gap-1.5">
        {weekBars.map(({ key, ratio, isToday }) => (
          <div
            key={key}
            className={cn(
              'flex-1 rounded-[3px] transition-colors',
              isToday
                ? 'bg-[hsl(var(--habit-hue-peach)/0.75)]'
                : 'bg-foreground/12',
            )}
            style={{ height: `${Math.max(12, ratio * 100)}%` }}
          />
        ))}
      </div>
    </div>
  );
}

function HabitTile({
  habit,
  hue,
  expanded,
  onToggleExpand,
  onIncrement,
  onRename,
  onDelete,
}: {
  habit: DueWithStats;
  hue: Hue;
  expanded: boolean;
  onToggleExpand: () => void;
  onIncrement: () => void;
  onRename: (nextTitle: string) => void;
  onDelete: () => void;
}) {
  const todayKey = format(new Date(), 'yyyy-MM-dd');
  const todayCount = habit.dailyCounts?.[todayKey] || 0;
  const targetCount = Math.max(1, habit.targetCount || 1);
  const met = todayCount >= targetCount;
  const streak = habit.currentStreak;

  const [menuOpen, setMenuOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(habit.title);

  useEffect(() => {
    if (!isEditing) setDraft(habit.title);
  }, [habit.title, isEditing]);

  const commit = () => {
    if (draft.trim() && draft.trim() !== habit.title) onRename(draft);
    else setDraft(habit.title);
    setIsEditing(false);
  };

  const inkVar = `var(--habit-hue-${hue})`;
  const hueCls = HUE_CLASSES[hue];
  const bar = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const key = format(subDays(new Date(), 6 - i), 'yyyy-MM-dd');
      const done = (habit.dailyCounts?.[key] || 0) >= targetCount;
      return { key, done, isToday: i === 6 };
    });
  }, [habit.dailyCounts, targetCount]);

  return (
    <div
      className={cn(
        'group relative flex min-h-[152px] flex-col justify-between overflow-hidden rounded-2xl border p-3.5 transition-colors',
        met
          ? `${hueCls.metBg} ${hueCls.metBorder}`
          : 'bg-[hsl(var(--surface-soft))] border-border/60 hover:border-border',
        expanded && `ring-1 ${hueCls.ring}`,
      )}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-25 blur-2xl"
        style={{ background: `hsl(${inkVar})` }}
      />

      {streak >= 2 && (
        <span
          className="absolute right-3 top-3 z-[1] inline-flex items-center gap-1 rounded-full bg-foreground/[0.06] px-1.5 py-0.5 text-[10.5px] font-semibold leading-none backdrop-blur-sm"
          style={{ color: `hsl(${inkVar})` }}
        >
          <Flame size={10} strokeWidth={2.5} />
          {streak}d
        </span>
      )}

      <div className="relative min-w-0">
        <Popover open={menuOpen} onOpenChange={setMenuOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="More"
              className={cn(
                'absolute -left-1 -top-1 flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground/55 opacity-0 transition-opacity hover:bg-foreground/5 hover:text-foreground',
                'group-hover:opacity-100 focus-visible:opacity-100',
                menuOpen && 'opacity-100',
              )}
            >
              <MoreHorizontal size={14} />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" side="bottom" className="w-40 p-1">
            <button
              type="button"
              onClick={() => { setMenuOpen(false); onToggleExpand(); }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] font-medium text-foreground/85 transition-colors hover:bg-foreground/5"
            >
              {expanded
                ? (habit.title && '收起') || 'Collapse'
                : 'Edit details'}
            </button>
            <button
              type="button"
              onClick={() => { setMenuOpen(false); onDelete(); }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] font-medium text-destructive transition-colors hover:bg-destructive/10"
            >
              <Trash2 size={14} />
              Delete
            </button>
          </PopoverContent>
        </Popover>

        {isEditing ? (
          <input
            autoFocus
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              const ne = e.nativeEvent as unknown as globalThis.KeyboardEvent;
              if (e.key === 'Enter') {
                if (isImeComposing(ne)) return;
                commit();
              }
              if (e.key === 'Escape') {
                setDraft(habit.title);
                setIsEditing(false);
              }
            }}
            className="mt-4 block w-full bg-transparent text-[14.5px] font-semibold leading-tight tracking-[-0.005em] text-foreground focus:outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="mt-4 block w-full pr-14 text-left"
          >
            <p className="truncate text-[14.5px] font-semibold leading-tight tracking-[-0.005em] text-foreground">
              {habit.title}
            </p>
          </button>
        )}
        {habit.habit_category && habit.habit_category !== 'Uncategorized' && (
          <p className="mt-1 text-[11px] leading-none text-muted-foreground/70">
            {habit.habit_category}
          </p>
        )}
      </div>

      <div className="relative">
        <div className="flex items-center justify-between">
          <div className="flex items-baseline gap-0.5 leading-none">
            {met ? (
              <span
                className="text-[22px] font-semibold tabular-nums tracking-[-0.02em]"
                style={{ color: `hsl(${inkVar})` }}
              >
                ✓
              </span>
            ) : (
              <>
                <span className="text-[22px] font-semibold tabular-nums tracking-[-0.02em] text-foreground">
                  {todayCount}
                </span>
                {targetCount > 1 && (
                  <span className="text-[12px] font-medium text-muted-foreground/70">
                    /{targetCount}
                  </span>
                )}
              </>
            )}
          </div>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onIncrement(); }}
            aria-label={`Check in: ${habit.title}`}
            className={cn(
              'flex h-9 w-9 items-center justify-center rounded-full text-[16px] font-semibold transition-transform',
              'hover:scale-[1.06] active:scale-[0.94]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            )}
            style={{
              background: `hsl(${inkVar})`,
              color: 'hsl(var(--background))',
              boxShadow: `0 4px 14px hsl(${inkVar} / 0.28)`,
            }}
          >
            {met ? '✓' : '+'}
          </button>
        </div>
        <div className="mt-2.5 flex gap-1">
          {bar.map(({ key, done, isToday }) => (
            <span
              key={key}
              className={cn(
                'h-[3px] flex-1 rounded-full',
                done ? 'opacity-70' : 'bg-foreground/[0.08]',
                isToday && !done && 'bg-foreground/[0.18]',
              )}
              style={done ? { background: `hsl(${inkVar})` } : undefined}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
