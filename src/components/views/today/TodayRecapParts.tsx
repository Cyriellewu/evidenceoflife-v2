import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { format, parseISO } from 'date-fns';
import { Check, Clock, Clock3, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/hooks/useLanguage';
import { Moment } from '@/types';
import { ImportedEvent } from '@/hooks/useImportedEvents';
import { supabase } from '@/integrations/supabase/client';
import {
  buildTimerSpanISO,
  getImportedEventEffectiveStart,
  getImportedEventEffectiveEnd,
  parseSubtitleDetail,
  buildLocalLifeReplay,
  pickReplayLang,
} from './todayHelpers';

export const recapTimeInputClassName = "min-h-8 w-[84px] rounded-lg border border-border/35 bg-[hsl(var(--surface-soft))] px-2 py-1 text-center tabular-nums text-[15px] tracking-[-0.03em] text-foreground shadow-[inset_0_1px_0_hsl(var(--surface-contrast)/0.65)] focus:outline-none focus:ring-1 focus:ring-primary/35 [&::-webkit-calendar-picker-indicator]:hidden";

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
          <span className="text-3xl tabular-nums font-light text-foreground/40">
            {hrs > 0 ? `${pad(hrs)}:` : ''}{pad(mins)}:{pad(secs)}
          </span>
        </div>
        <div className="flex items-center justify-center gap-3">
          <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="bg-secondary rounded-lg px-2 py-1 text-sm tabular-nums text-center w-24 focus:outline-none focus:ring-1 focus:ring-primary" />
          <span className="text-muted-foreground text-sm">→</span>
          <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="bg-secondary rounded-lg px-2 py-1 text-sm tabular-nums text-center w-24 focus:outline-none focus:ring-1 focus:ring-primary" />
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
        <input type="time" value={editStart} onChange={e => e.target.value && setEditStart(e.target.value)} className={recapTimeInputClassName} aria-label="Start time" />
        <span className="text-muted-foreground text-xs">→</span>
        <input type="time" value={editEnd} onChange={e => e.target.value && setEditEnd(e.target.value)} className={recapTimeInputClassName} aria-label="End time" />
        <button onClick={handleSave} aria-label="Save" className="text-primary hover:text-primary/80"><Check size={12} /></button>
        <button onClick={() => setIsEditing(false)} aria-label="Cancel" className="text-muted-foreground hover:text-destructive"><X size={12} /></button>
      </div>
    );
  }

  if (moment.timer_started_at && moment.timer_ended_at) {
    return (
      <span
        className="inline-flex h-8 items-center gap-1.5 rounded-full bg-secondary/40 px-2.5 text-[12px] tabular-nums text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
        onClick={handleStartEdit}
      >
        <Clock size={13} className="flex-shrink-0" />
        {format(parseISO(moment.timer_started_at), 'HH:mm')} → {format(parseISO(moment.timer_ended_at), 'HH:mm')}
        {moment.timer_seconds != null && moment.timer_seconds > 0 && ` (${Math.floor(moment.timer_seconds / 60)}m)`}
      </span>
    );
  }

  if (moment.timer_started_at && !moment.timer_ended_at) {
    return (
      <span
        className="inline-flex h-8 items-center gap-1.5 rounded-full bg-secondary/40 px-2.5 text-[12px] tabular-nums text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
        onClick={handleStartEdit}
      >
        <Clock size={13} className="flex-shrink-0" />
        {format(parseISO(moment.timer_started_at), 'HH:mm')}
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
        <input type="time" value={editStart} onChange={e => e.target.value && setEditStart(e.target.value)} className={recapTimeInputClassName} aria-label="Start time" />
        <span className="text-muted-foreground text-xs">→</span>
        <input type="time" value={editEnd} onChange={e => e.target.value && setEditEnd(e.target.value)} className={recapTimeInputClassName} aria-label="End time" />
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
// localOnly builds the story on-device and never calls the life-replay edge
// function (used on mobile, where the card is new and shouldn't add AI cost).
export function LifeReplay({ items, lang, dateKey, localOnly = false, className = 'mb-4' }: { items: { type: string; time: Date; endTime?: Date; isPlanOutline?: boolean; data: { title?: string; text?: string | null; emoji?: string | null } }[]; lang: string; dateKey: string; localOnly?: boolean; className?: string }) {
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

  const localStory = useMemo(
    () => (localOnly ? buildLocalLifeReplay(events, lang) : null),
    [localOnly, events, lang],
  );

  const generate = useCallback(async () => {
    if (localOnly || events.length < 3 || loading) return;
    setLoading(true);
    setError(false);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('life-replay', {
        // Story language follows what the moments are written in.
        body: { events, lang: pickReplayLang(events.map(e => e.title), lang) },
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
  }, [events, lang, loading, localOnly]);

  // Auto-generate when there are enough events
  useEffect(() => {
    if (localOnly) return;
    if (events.length >= 3 && !story && !loading && !error && !autoTriggered.current) {
      autoTriggered.current = true;
      generate();
    }
  }, [events.length, story, loading, error, localOnly]);

  if (events.length < 3) return null;
  if (localOnly && !localStory) return null;

  return (
    <div className={cn(className, 'rounded-2xl border border-primary/10 bg-gradient-to-br from-primary/[0.04] to-primary/[0.08] px-3.5 py-3')}>
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-[12px]">✨</span>
          <p className="text-[11px] font-medium tracking-wide text-primary/70">{t('recap.lifeReplay')}</p>
        </div>
        {story && !loading && !localOnly && (
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
      {(localOnly ? localStory : story && !loading ? story : null) && (
        <p className="text-[12px] leading-[1.55] text-foreground/80 font-light">
          {localOnly ? localStory : story}
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
