import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { addDays, format, parseISO, startOfWeek, subDays } from 'date-fns';
import { Check, Clock3, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/hooks/useLanguage';
import { Moment, TodayMode } from '@/types';
import { ImportedEvent } from '@/hooks/useImportedEvents';
import { DueLink, DueWithStats } from '@/hooks/useDues';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import {
  buildTimerSpanISO,
  getImportedEventEffectiveStart,
  getImportedEventEffectiveEnd,
  parseSubtitleDetail,
  buildLocalLifeReplay,
} from './todayHelpers';

export const recapTimeInputClassName = "min-h-8 w-[64px] rounded-lg border border-border/35 bg-[hsl(var(--surface-soft))] px-2 py-1 text-center font-mono text-[15px] tabular-nums tracking-[-0.03em] text-foreground shadow-[inset_0_1px_0_hsl(var(--surface-contrast)/0.65)] focus:outline-none focus:ring-1 focus:ring-primary/35";

export function DailyHabitTracker({
  habits,
  selectedDateStr,
  onIncrement,
  onSetCount,
  onUpdateHabit,
  onAddHabit,
}: {
  habits: DueWithStats[];
  selectedDateStr: string;
  onIncrement: (habitId: string, dateStr: string) => void;
  onSetCount: (habitId: string, nextCount: number, dateStr: string) => void;
  onUpdateHabit: (habitId: string, updates: { title?: string; progress?: number; show_in_recap_daily?: boolean; links?: DueLink[] }) => void;
  onAddHabit: (title: string) => void;
}) {
  const [titleEditingId, setTitleEditingId] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState('');
  const [newHabitTitle, setNewHabitTitle] = useState('');
  const [showHistory, setShowHistory] = useState(false);

  const summary = useMemo(() => {
    const done = habits.filter(h => (h.dailyCounts[selectedDateStr] || 0) >= h.targetCount).length;
    return { done, total: habits.length };
  }, [habits, selectedDateStr]);

  const handleAddHabit = () => {
    const nextTitle = newHabitTitle.trim();
    if (!nextTitle) return;
    onAddHabit(nextTitle);
    setNewHabitTitle('');
  };

  const handleOpenHabitLink = (habit: DueWithStats, linkIndex: number) => {
    const link = habit.links?.[linkIndex];
    if (!link?.url) return;
    onIncrement(habit.id, selectedDateStr);
    onUpdateHabit(habit.id, {
      links: (habit.links || []).map((item, index) =>
        index === linkIndex ? { ...item, count: (item.count || 0) + 1 } : item
      ),
    });
    window.open(link.url, '_blank', 'noopener,noreferrer');
  };

  const historyWeeks = useMemo(() => {
    const start = startOfWeek(subDays(new Date(selectedDateStr), 83), { weekStartsOn: 0 });
    return Array.from({ length: 12 }, (_, weekIndex) =>
      Array.from({ length: 7 }, (_, dayIndex) => addDays(start, weekIndex * 7 + dayIndex))
    );
  }, [selectedDateStr]);

  return (
    <aside className="min-w-0 lg:sticky lg:top-4">
      <div className="rounded-3xl border border-border/70 bg-[hsl(var(--surface-soft))] px-3.5 py-3.5 shadow-[0_10px_24px_hsl(var(--foreground)/0.05)]">
        <div className="rounded-2xl border border-border/60 bg-background/55 px-3.5 py-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground/55">Daily Tracker</p>
            {habits.length > 0 && (
              <button
                onClick={() => setShowHistory(true)}
                className="rounded-full bg-secondary px-2.5 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                History
              </button>
            )}
          </div>
          <div className="mt-2 flex items-end justify-between gap-3">
            <div>
              <p className="text-[22px] font-semibold text-foreground">{summary.done}/{summary.total}</p>
              <p className="text-[11px] text-muted-foreground/70">must-do habits done today</p>
            </div>
            {summary.total > 0 && summary.done === summary.total && (
              <div className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">
                all done today
              </div>
            )}
          </div>
        </div>

        <div className="mt-3.5 space-y-2.5">
          {habits.length === 0 && (
            <div className="rounded-2xl border border-dashed border-border/70 px-3.5 py-4 text-center">
              <p className="text-[11px] text-muted-foreground/65">
                Add your first daily habit here. It will sync with Habits automatically.
              </p>
              <div className="mt-3 flex items-center gap-2">
                <input
                  value={newHabitTitle}
                  onChange={e => setNewHabitTitle(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleAddHabit();
                  }}
                  placeholder="Add a daily habit"
                  className="h-9 min-w-0 flex-1 rounded-full border border-border/70 bg-background/60 px-3.5 text-[12px] text-foreground placeholder:text-[11px] placeholder:text-muted-foreground/55 focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <button
                  onClick={handleAddHabit}
                  className="h-9 rounded-full bg-primary px-3.5 text-[11px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
                >
                  Add
                </button>
              </div>
            </div>
          )}

          {habits.map(habit => {
            const count = habit.dailyCounts[selectedDateStr] || 0;
            const isComplete = count >= habit.targetCount;

            return (
              <div
                key={habit.id}
                className={cn(
                  "rounded-2xl border px-3.5 py-2.5 transition-colors",
                  isComplete ? "border-primary/30 bg-primary/6" : "border-border/70 bg-background/45"
                )}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="h-2 w-2 rounded-full bg-primary/75 flex-shrink-0" />
                  {/* Title */}
                  <div className="min-w-0 flex-1">
                    {titleEditingId === habit.id ? (
                      <input
                        value={titleDraft}
                        onChange={e => setTitleDraft(e.target.value)}
                        onBlur={() => {
                          const nextTitle = titleDraft.trim();
                          if (nextTitle && nextTitle !== habit.title) onUpdateHabit(habit.id, { title: nextTitle });
                          setTitleEditingId(null);
                        }}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            const nextTitle = titleDraft.trim();
                            if (nextTitle && nextTitle !== habit.title) onUpdateHabit(habit.id, { title: nextTitle });
                            setTitleEditingId(null);
                          }
                          if (e.key === 'Escape') { setTitleDraft(habit.title); setTitleEditingId(null); }
                        }}
                        className="w-full border-b border-primary/40 bg-transparent text-[13px] font-semibold text-foreground focus:outline-none"
                        autoFocus
                      />
                    ) : (
                      <button
                        onClick={() => { setTitleEditingId(habit.id); setTitleDraft(habit.title); }}
                        className="truncate text-left text-[13px] font-semibold text-foreground transition-opacity hover:opacity-75"
                      >
                        {habit.title}
                      </button>
                    )}
                  </div>
                  {/* Checkboxes */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {Array.from({ length: habit.targetCount }).map((_, index) => {
                      const checked = index < count;
                      return (
                        <button
                          key={`${habit.id}-check-${index}`}
                          onClick={() => onSetCount(habit.id, checked ? index : index + 1, selectedDateStr)}
                          className={cn(
                            "flex h-5 w-5 items-center justify-center rounded-full border transition-colors",
                            checked ? "border-primary bg-primary text-primary-foreground" : "border-border/70 bg-background/55 text-transparent hover:border-primary/40"
                          )}
                        >
                          <Check size={11} strokeWidth={2.8} />
                        </button>
                      );
                    })}
                  </div>
                  {/* Links inline */}
                  {habit.links && habit.links.length > 0 && (
                    <button
                      onClick={() => handleOpenHabitLink(habit, 0)}
                      className="flex-shrink-0 text-[10px] text-primary/60 hover:text-primary transition-colors truncate max-w-[80px]"
                    >
                      {habit.links[0].label || habit.links[0].title || 'open'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {habits.length > 0 && (
            <div className="rounded-2xl border border-border/60 bg-background/35 px-3 py-2.5">
              <div className="flex items-center gap-2">
                <input
                  value={newHabitTitle}
                  onChange={e => setNewHabitTitle(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleAddHabit();
                  }}
                  placeholder="Add another daily habit"
                  className="h-8 min-w-0 flex-1 rounded-full border border-border/70 bg-background/60 px-3.5 text-[12px] text-foreground placeholder:text-[11px] placeholder:text-muted-foreground/55 focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <button
                  onClick={handleAddHabit}
                  className="h-8 rounded-full bg-primary/12 px-3 text-[11px] font-medium text-primary transition-colors hover:bg-primary/18"
                >
                  Add
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      <Dialog open={showHistory} onOpenChange={setShowHistory}>
        <DialogContent className="max-w-3xl rounded-3xl border border-border/70 bg-background/95 p-0 shadow-[0_24px_80px_hsl(var(--foreground)/0.16)]">
          <DialogHeader className="border-b border-border/60 px-6 py-5">
            <DialogTitle className="text-[18px] font-semibold text-foreground">Habit consistency</DialogTitle>
            <p className="text-[12px] text-muted-foreground">Last 12 weeks. Darker squares mean more completed.</p>
          </DialogHeader>
          <div className="max-h-[70vh] space-y-4 overflow-y-auto px-6 py-5">
            {habits.map((habit) => (
              <div key={`${habit.id}-history`} className="rounded-2xl border border-border/60 bg-[hsl(var(--surface-soft))] px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-semibold text-foreground">{habit.title}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      target {habit.targetCount}/day
                    </p>
                  </div>
                  <span className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                    {(habit.dailyCounts[selectedDateStr] || 0)}/{habit.targetCount} today
                  </span>
                </div>
                <div className="mt-4 flex gap-1.5 overflow-x-auto pb-1">
                  {historyWeeks.map((week, weekIndex) => (
                    <div key={`${habit.id}-week-${weekIndex}`} className="grid grid-rows-7 gap-1.5">
                      {week.map((day) => {
                        const key = format(day, 'yyyy-MM-dd');
                        const dayCount = habit.dailyCounts[key] || 0;
                        const intensity = dayCount >= habit.targetCount ? 2 : dayCount > 0 ? 1 : 0;
                        return (
                          <div
                            key={`${habit.id}-${key}`}
                            title={`${format(day, 'MMM d')}: ${dayCount}/${habit.targetCount}`}
                            className={cn(
                              "h-3.5 w-3.5 rounded-[4px] border",
                              intensity === 2
                                ? "border-primary/30 bg-primary"
                                : intensity === 1
                                  ? "border-primary/20 bg-primary/35"
                                  : "border-border/60 bg-background"
                            )}
                          />
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </aside>
  );
}

/* ── Moment Timer Summary ── */
export function MomentTimerSummary({ title, elapsed, startedAt, onConfirm, onCancel }: {
  title: string;
  elapsed: number;
  startedAt: string;
  onConfirm: (data: { startTime: string; endTime: string }) => void;
  onCancel: () => void;
}) {
  const startDate = new Date(startedAt);
  const endDate = new Date();
  const [startTime, setStartTime] = useState(format(startDate, 'HH:mm'));
  const [endTime, setEndTime] = useState(format(endDate, 'HH:mm'));
  const hrs = Math.floor(elapsed / 3600);
  const mins = Math.floor((elapsed % 3600) / 60);
  const secs = elapsed % 60;
  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center animate-fade-in">
      <div className="w-[320px] bg-card border border-border rounded-2xl p-6 space-y-5 shadow-xl">
        <div className="text-center space-y-1">
          <p className="text-xs text-muted-foreground/60 tracking-[0.2em] uppercase">Session complete</p>
          <p className="text-base font-medium text-foreground">{title}</p>
        </div>
        <div className="text-center">
          <span className="text-3xl font-mono font-light text-foreground/40 tabular-nums">
            {hrs > 0 ? `${pad(hrs)}:` : ''}{pad(mins)}:{pad(secs)}
          </span>
        </div>
        <div className="flex items-center justify-center gap-3">
          <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="bg-secondary rounded-lg px-2 py-1 text-sm font-mono text-center w-24 focus:outline-none focus:ring-1 focus:ring-primary" />
          <span className="text-muted-foreground text-sm">→</span>
          <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="bg-secondary rounded-lg px-2 py-1 text-sm font-mono text-center w-24 focus:outline-none focus:ring-1 focus:ring-primary" />
        </div>
        <div className="flex items-center gap-3 justify-center pt-1">
          <button onClick={onCancel} aria-label="Discard" className="w-12 h-12 rounded-full border border-border/50 flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors"><X size={20} /></button>
          <button onClick={() => onConfirm({ startTime, endTime })} aria-label="Confirm" className="w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90 transition-opacity"><Check size={20} /></button>
        </div>
      </div>
    </div>
  );
}

/* ── Moment time editor (start/end times) ── */
export function MomentTimeEditor({ moment, onEditMoment }: { moment: Moment; onEditMoment?: (id: string, data: Partial<Moment>) => void }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');

  const handleStartEdit = () => {
    const now = format(new Date(), 'HH:mm');
    const start = moment.timer_started_at ? format(parseISO(moment.timer_started_at), 'HH:mm') : now;
    const end = moment.timer_ended_at ? format(parseISO(moment.timer_ended_at), 'HH:mm') : now;
    setEditStart(start);
    setEditEnd(end);
    setIsEditing(true);
  };

  const handleSave = () => {
    if (!onEditMoment) return;
    const span = buildTimerSpanISO(editStart, editEnd, {
      anchorISO: moment.timer_started_at,
      fallbackDateStr: format(parseISO(moment.date || moment.createdAt), 'yyyy-MM-dd'),
    });
    if (!span) return;
    onEditMoment(moment.id, { timer_started_at: span.startISO, timer_ended_at: span.endISO, timer_seconds: span.seconds } as Partial<Moment>);
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
        <input inputMode="numeric" pattern="[0-9:]*" value={editStart} onChange={e => setEditStart(e.target.value)} className={recapTimeInputClassName} placeholder="12:07" />
        <span className="text-muted-foreground text-xs">→</span>
        <input inputMode="numeric" pattern="[0-9:]*" value={editEnd} onChange={e => setEditEnd(e.target.value)} className={recapTimeInputClassName} placeholder="12:09" />
        <button onClick={handleSave} aria-label="Save" className="text-primary hover:text-primary/80"><Check size={12} /></button>
        <button onClick={() => setIsEditing(false)} aria-label="Cancel" className="text-muted-foreground hover:text-destructive"><X size={12} /></button>
      </div>
    );
  }

  if (moment.timer_started_at && moment.timer_ended_at) {
    return (
      <span
        className="inline-flex items-center text-sm font-mono tabular-nums text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
        onClick={handleStartEdit}
      >
        🕐 {format(parseISO(moment.timer_started_at), 'HH:mm')} → {format(parseISO(moment.timer_ended_at), 'HH:mm')}
        {moment.timer_seconds != null && moment.timer_seconds > 0 && ` (${Math.floor(moment.timer_seconds / 60)}m)`}
      </span>
    );
  }

  if (moment.timer_started_at && !moment.timer_ended_at) {
    return (
      <span
        className="inline-flex items-center text-sm font-mono tabular-nums text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
        onClick={handleStartEdit}
      >
        🕐 {format(parseISO(moment.timer_started_at), 'HH:mm')}
      </span>
    );
  }

  return null;
}

export function ImportedEventTimeEditor({ event, onUpdate }: { event: ImportedEvent; onUpdate?: (id: string, data: Partial<ImportedEvent>) => void }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');
  const start = parseISO(getImportedEventEffectiveStart(event));
  const endIso = getImportedEventEffectiveEnd(event);
  const end = endIso ? parseISO(endIso) : null;

  const handleStartEdit = () => {
    setEditStart(format(start, 'HH:mm'));
    setEditEnd(end ? format(end, 'HH:mm') : format(start, 'HH:mm'));
    setIsEditing(true);
  };

  const handleSave = () => {
    if (!onUpdate) return;
    const effectiveStart = getImportedEventEffectiveStart(event);
    const span = buildTimerSpanISO(editStart, editEnd, {
      anchorISO: effectiveStart,
      fallbackDateStr: format(start, 'yyyy-MM-dd'),
    });
    if (!span) return;
    const hasTimerOverride = Boolean(event.timer_started_at || event.timer_ended_at || (event.timer_seconds ?? 0) > 0);
    if (hasTimerOverride) {
      onUpdate(event.id, {
        timer_started_at: span.startISO,
        timer_ended_at: span.endISO,
        timer_seconds: span.seconds,
      });
    } else {
      onUpdate(event.id, { start_time: span.startISO, end_time: span.endISO });
    }
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
        <input inputMode="numeric" pattern="[0-9:]*" value={editStart} onChange={e => setEditStart(e.target.value)} className={recapTimeInputClassName} placeholder="12:07" />
        <span className="text-muted-foreground text-xs">→</span>
        <input inputMode="numeric" pattern="[0-9:]*" value={editEnd} onChange={e => setEditEnd(e.target.value)} className={recapTimeInputClassName} placeholder="12:09" />
        <button onClick={handleSave} aria-label="Save" className="text-primary hover:text-primary/80"><Check size={12} /></button>
        <button onClick={() => setIsEditing(false)} aria-label="Cancel" className="text-muted-foreground hover:text-destructive"><X size={12} /></button>
      </div>
    );
  }

  return (
    <button
      aria-label="Edit event time"
      className="inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground/40 transition-colors hover:bg-muted/50 hover:text-muted-foreground"
      onClick={handleStartEdit}
      title="Edit event time"
    >
      <Clock3 size={12} />
    </button>
  );
}

/* ── Life Replay: AI-generated daily narrative ── */
export function LifeReplay({ items, lang, dateKey }: { items: { type: string; time: Date; endTime?: Date; isPlanOutline?: boolean; data: { title?: string; text?: string | null; emoji?: string | null } }[]; lang: string; dateKey: string }) {
  const { t } = useLanguage();
  const [story, setStory] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const lastDateKey = useRef(dateKey);
  const autoTriggered = useRef(false);

  // Reset story when switching dates
  useEffect(() => {
    if (dateKey !== lastDateKey.current) {
      setStory(null);
      setError(false);
      autoTriggered.current = false;
      lastDateKey.current = dateKey;
    }
  }, [dateKey]);

  const events = useMemo(() => {
    return items.filter(i => !i.isPlanOutline).map(item => {
      const title = item.type === 'todo'
        ? item.data.title
        : item.type === 'imported'
          ? item.data.title
        : (parseSubtitleDetail(item.data.text ?? '').subtitle || item.data.emoji || 'Moment');
      const timeStr = format(item.time, 'HH:mm');
      let duration: string | undefined;
      if (item.endTime) {
        const durMin = Math.round((item.endTime.getTime() - item.time.getTime()) / 60000);
        if (durMin > 0) duration = `${durMin}m`;
      }
      return { time: timeStr, title, duration };
    });
  }, [items]);

  const generate = useCallback(async () => {
    if (events.length < 3 || loading) return;
    setLoading(true);
    setError(false);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('life-replay', {
        body: { events, lang },
      });
      if (fnError) throw fnError;
      setStory(data?.story || buildLocalLifeReplay(events, lang));
    } catch {
      const fallbackStory = buildLocalLifeReplay(events, lang);
      if (fallbackStory) {
        setStory(fallbackStory);
        setError(false);
      } else {
        setError(true);
      }
    } finally {
      setLoading(false);
    }
  }, [events, lang, loading]);

  // Auto-generate when there are enough events
  useEffect(() => {
    if (events.length >= 3 && !story && !loading && !error && !autoTriggered.current) {
      autoTriggered.current = true;
      generate();
    }
  }, [events.length, story, loading, error]);

  if (events.length < 3) return null;

  return (
    <div className="mb-4 rounded-2xl border border-primary/10 bg-gradient-to-br from-primary/[0.04] to-primary/[0.08] px-3.5 py-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-[12px]">✨</span>
          <p className="text-[11px] font-medium tracking-wide text-primary/70">{t('recap.lifeReplay')}</p>
        </div>
        {story && !loading && (
          <button onClick={generate} className="rounded px-1 py-0.5 text-[10px] text-muted-foreground/40 transition-colors hover:bg-secondary/50 hover:text-muted-foreground">
            ↻ {lang === 'zh' ? '重新生成' : 'Regenerate'}
          </button>
        )}
      </div>
      {loading && (
        <div className="flex items-center gap-2 py-1.5">
          <div className="h-3 w-3 rounded-full border-2 border-primary/20 border-t-primary/60 animate-spin" />
          <span className="text-[11px] italic text-muted-foreground/50">
            {lang === 'zh' ? '正在回放你的一天...' : 'Replaying your day...'}
          </span>
        </div>
      )}
      {story && !loading && (
        <p className="text-[12px] leading-[1.55] text-foreground/80 font-light">
          {story}
        </p>
      )}
      {error && !loading && (
        <div className="flex items-center gap-2">
          <p className="text-[11px] text-muted-foreground/40">{t('recap.generateFailed')}</p>
          <button onClick={generate} className="text-[10px] text-primary/60 hover:text-primary">
            {lang === 'zh' ? '重试' : 'Retry'}
          </button>
        </div>
      )}
    </div>
  );
}
