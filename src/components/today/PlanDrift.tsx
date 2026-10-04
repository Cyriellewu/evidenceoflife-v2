import { useState, useMemo, useEffect, useRef } from 'react';
import { parseISO } from 'date-fns';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Todo } from '@/hooks/useTodos';
import { Moment } from '@/types';
import { autoClassifyTag, TAG_CATEGORY_COLORS } from '@/lib/autoTag';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/hooks/useLanguage';
import { TimeTexture, TextureSlot } from '@/components/today/TimeTexture';
import { mergedWallClockFocusMinutes } from '@/lib/mergedWallClockMinutes';
import {
  partitionUnionMinutesByTag,
  type TaggedMinuteSlot,
} from '@/lib/dayMinuteIntervals';
import { PLAN_TIMELINE_BED_TOTAL_MIN, PLAN_TIMELINE_WAKE_TOTAL_MIN } from '@/lib/planTimelineDayBounds';
import type { PlanTimelineRhythmPalette } from '@/lib/planTimelineRhythmPresets';
import { useIsDarkMode } from '@/hooks/useIsDarkMode';

interface PlanDriftProps {
  allTodos?: Todo[];
  completedTodos?: Todo[];
  allMoments?: Moment[];
  todayDateStr: string;
  defaultCollapsed?: boolean;
  /** Must match PlanView / timeline picker so color changes re-open this section */
  rhythmPresetId?: string;
  /** Matches timeline corner picker — rhythm chart planned/focus fills */
  rhythmPalette?: PlanTimelineRhythmPalette;
}

interface CategoryData {
  tag: string;
  plannedMin: number;
  actualMin: number;
  color: string;
  plannedItems: string[];
  actualItems: string[];
}

interface DriftResult {
  totalPlanned: number;
  totalDone: number;
  totalMissed: number;
  totalActiveMin: number;
  categories: CategoryData[];
  missedTasks: { title: string; tag?: string }[];
}

function normalizeDriftTag(t: Todo | Moment, titleOrText: string | null | undefined): string {
  return (t.tags?.[0] || autoClassifyTag(titleOrText || '') || 'life').toLowerCase();
}

function todoWallMinuteSlot(t: Todo, tag: string): TaggedMinuteSlot | null {
  if (t.plan_started_at && t.plan_ended_at) {
    const s = parseISO(t.plan_started_at);
    const e = parseISO(t.plan_ended_at);
    const sm = s.getHours() * 60 + s.getMinutes();
    const em = e.getHours() * 60 + e.getMinutes();
    if (em > sm) return { startMin: sm, endMin: em, tag };
    return null;
  }
  if (t.timer_started_at && t.timer_ended_at) {
    const s = parseISO(t.timer_started_at);
    const e = parseISO(t.timer_ended_at);
    const sm = s.getHours() * 60 + s.getMinutes();
    const em = e.getHours() * 60 + e.getMinutes();
    if (em > sm) return { startMin: sm, endMin: em, tag };
    return null;
  }
  return null;
}

function scheduledTodoPlannedDurationMin(t: Todo): number {
  if (t.timer_seconds) return t.timer_seconds / 60;
  if (t.timer_started_at && t.timer_ended_at) {
    return (parseISO(t.timer_ended_at).getTime() - parseISO(t.timer_started_at).getTime()) / 60000;
  }
  return 30;
}

function computeDrift(allTodos: Todo[], completedTodos: Todo[], moments: Moment[], todayDateStr: string): DriftResult {
  const scheduledTodos = allTodos.filter(t => t.timer_started_at && t.date === todayDateStr);
  const completedScheduled = scheduledTodos.filter(t => t.is_completed);
  const now = Date.now();
  // Only extend a still-running timer up to "now" when we're actually looking at today.
  // For past days (and the frozen demo day) "now" is meaningless, so a left-running
  // timer contributes nothing extra rather than ballooning by days.
  const dayStartMs = new Date(`${todayDateStr}T00:00:00`).getTime();
  const isRealToday = new Date(dayStartMs).toDateString() === new Date(now).toDateString();
  const missedScheduled = scheduledTodos.filter(t => {
    if (t.is_completed) return false;
    if (!t.timer_ended_at) return false;
    const endTime = parseISO(t.timer_ended_at).getTime();
    if (endTime > now) return false;
    const createdAt = parseISO(t.created_at).getTime();
    if (createdAt > endTime) return false;
    return true;
  });

  const catPlanned = new Map<string, { min: number; items: string[] }>();
  const catActual = new Map<string, { min: number; items: string[] }>();

  /** All timed spans — merged for headline totalActiveMin (overlap / duplicate aware). */
  const focusIntervalsMs: { start: number; end: number }[] = [];

  const wallPlannedSlots: TaggedMinuteSlot[] = [];
  const wallActualSlots: TaggedMinuteSlot[] = [];
  const orphanPlannedMinByTag = new Map<string, number>();

  for (const t of scheduledTodos) {
    const tag = normalizeDriftTag(t, t.title);
    const wall = todoWallMinuteSlot(t, tag);
    if (wall) wallPlannedSlots.push(wall);
    else {
      const dur = scheduledTodoPlannedDurationMin(t);
      orphanPlannedMinByTag.set(tag, (orphanPlannedMinByTag.get(tag) || 0) + dur);
    }
    const existingP = catPlanned.get(tag) || { min: 0, items: [] };
    existingP.items.push(t.title);
    catPlanned.set(tag, existingP);
  }

  const plannedPartition = partitionUnionMinutesByTag(
    wallPlannedSlots,
    PLAN_TIMELINE_WAKE_TOTAL_MIN,
    PLAN_TIMELINE_BED_TOTAL_MIN,
  );

  for (const row of plannedPartition) {
    const cur = catPlanned.get(row.tag) || { min: 0, items: [] };
    cur.min = row.minutes;
    catPlanned.set(row.tag, cur);
  }
  for (const [tag, extra] of orphanPlannedMinByTag) {
    const cur = catPlanned.get(tag) || { min: 0, items: [] };
    cur.min += extra;
    catPlanned.set(tag, cur);
  }

  for (const t of completedScheduled) {
    if (t.timer_started_at && t.timer_ended_at) {
      const tag = normalizeDriftTag(t, t.title);
      const startMs = parseISO(t.timer_started_at).getTime();
      const endMs = parseISO(t.timer_ended_at).getTime();
      focusIntervalsMs.push({ start: startMs, end: endMs });
      const s = parseISO(t.timer_started_at);
      const e = parseISO(t.timer_ended_at);
      const sm = s.getHours() * 60 + s.getMinutes();
      const em = e.getHours() * 60 + e.getMinutes();
      if (em > sm) wallActualSlots.push({ startMin: sm, endMin: em, tag });
      const existing = catActual.get(tag) || { min: 0, items: [] };
      existing.items.push(t.title);
      catActual.set(tag, existing);
    }
  }

  // Running (not-yet-stopped) timers count up to "now" so the headline matches the
  // floating timer pill — a live session is real focus time, not zero.
  for (const t of scheduledTodos) {
    if (isRealToday && t.timer_started_at && !t.timer_ended_at) {
      const tag = normalizeDriftTag(t, t.title);
      const startMs = Math.max(parseISO(t.timer_started_at).getTime(), dayStartMs);
      if (startMs < now) {
        focusIntervalsMs.push({ start: startMs, end: now });
        const s = new Date(startMs);
        const e = new Date(now);
        const sm = s.getHours() * 60 + s.getMinutes();
        const em = e.getHours() * 60 + e.getMinutes();
        if (em > sm) wallActualSlots.push({ startMin: sm, endMin: em, tag });
        const existing = catActual.get(tag) || { min: 0, items: [] };
        existing.items.push(t.title);
        catActual.set(tag, existing);
      }
    }
  }

  for (const m of moments) {
    if (m.timer_started_at) {
      // A running moment timer only extends to "now" on the real current day.
      if (!m.timer_ended_at && !isRealToday) continue;
      const tag = normalizeDriftTag(m, m.text);
      const startMs = m.timer_ended_at
        ? parseISO(m.timer_started_at).getTime()
        : Math.max(parseISO(m.timer_started_at).getTime(), dayStartMs);
      // Stopped timer uses its recorded end; a still-running one counts up to "now".
      const endMs = m.timer_ended_at ? parseISO(m.timer_ended_at).getTime() : now;
      if (endMs <= startMs) continue;
      focusIntervalsMs.push({ start: startMs, end: endMs });
      const s = new Date(startMs);
      const e = new Date(endMs);
      const sm = s.getHours() * 60 + s.getMinutes();
      const em = e.getHours() * 60 + e.getMinutes();
      if (em > sm) wallActualSlots.push({ startMin: sm, endMin: em, tag });
      const existing = catActual.get(tag) || { min: 0, items: [] };
      const subtitle = m.text?.split('\n---DETAIL---\n')[0] || '';
      existing.items.push(subtitle || m.emoji || 'moment');
      catActual.set(tag, existing);
    }
  }

  const actualPartition = partitionUnionMinutesByTag(
    wallActualSlots,
    PLAN_TIMELINE_WAKE_TOTAL_MIN,
    PLAN_TIMELINE_BED_TOTAL_MIN,
  );
  const actualMinByTag = new Map(actualPartition.map((r) => [r.tag, r.minutes]));
  for (const tag of [...catActual.keys()]) {
    const cur = catActual.get(tag);
    if (cur) cur.min = actualMinByTag.get(tag) ?? 0;
  }

  const totalActiveMin = Math.round(mergedWallClockFocusMinutes(focusIntervalsMs));

  const allTags = new Set([...catPlanned.keys(), ...catActual.keys()]);
  const categories: CategoryData[] = [...allTags].map(tag => ({
    tag,
    plannedMin: Math.round(catPlanned.get(tag)?.min || 0),
    actualMin: Math.round(catActual.get(tag)?.min || 0),
    color: TAG_CATEGORY_COLORS[tag] || '#8E8E93',
    plannedItems: catPlanned.get(tag)?.items || [],
    actualItems: catActual.get(tag)?.items || [],
  }))
    .filter(c => c.plannedMin > 0 || c.actualMin > 0)
    .sort((a, b) => b.actualMin - a.actualMin);

  return {
    totalPlanned: scheduledTodos.length,
    totalDone: completedScheduled.length,
    totalMissed: missedScheduled.length,
    totalActiveMin,
    categories,
    missedTasks: missedScheduled.map(t => ({
      title: t.title,
      tag: t.tags?.[0] || autoClassifyTag(t.title),
    })),
  };
}

function fmtDur(min: number): string {
  if (min < 1) return '0m';
  if (min < 60) return `${Math.round(min)}m`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m > 0 ? `${h}h${m}m` : `${h}h`;
}

function fmtClock(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Longest merged wall-clock stretch of actual focus (moments + completed todo timers). */
function computeBestStretch(actualSlots: { startMin: number; endMin: number }[]): string | null {
  if (!actualSlots.length) return null;
  const sorted = [...actualSlots].filter(s => s.endMin > s.startMin).sort((a, b) => a.startMin - b.startMin);
  const MERGE_GAP = 8;
  let bestLen = 0;
  let best = { startMin: 0, endMin: 0 };
  let cur = sorted[0];
  const consider = (start: number, end: number) => {
    const len = end - start;
    if (len > bestLen) {
      bestLen = len;
      best = { startMin: start, endMin: end };
    }
  };
  for (let i = 1; i < sorted.length; i++) {
    const n = sorted[i];
    if (n.startMin <= cur.endMin + MERGE_GAP) {
      cur = { startMin: cur.startMin, endMin: Math.max(cur.endMin, n.endMin) };
    } else {
      consider(cur.startMin, cur.endMin);
      cur = n;
    }
  }
  consider(cur.startMin, cur.endMin);
  if (bestLen < 25) return null;
  return `${fmtClock(best.startMin)}–${fmtClock(best.endMin)}`;
}

function resolveSlotTag(tags: string[] | undefined, title: string | null | undefined): string {
  if (tags && tags.length > 0 && tags[0]) return tags[0];
  if (title) {
    const auto = autoClassifyTag(title);
    if (auto) return auto;
  }
  return '—';
}

function buildExecutionSlots(
  allTodos: Todo[] | undefined,
  allMoments: Moment[] | undefined,
  todayDateStr: string,
): { planned: TextureSlot[]; actual: TextureSlot[] } {
  const planned: TextureSlot[] = [];
  const actual: TextureSlot[] = [];
  // Running timers only extend to the current minute on the real current day.
  const isRealToday = new Date(`${todayDateStr}T00:00:00`).toDateString() === new Date().toDateString();

  for (const t of allTodos || []) {
    if (t.date !== todayDateStr) continue;
    const tag = resolveSlotTag(t.tags, t.title);
    const title = (t.title || '').trim() || undefined;

    if (t.plan_started_at && t.plan_ended_at) {
      const s = parseISO(t.plan_started_at);
      const e = parseISO(t.plan_ended_at);
      const sm = s.getHours() * 60 + s.getMinutes();
      const em = e.getHours() * 60 + e.getMinutes();
      if (em > sm) {
        planned.push({
          startMin: sm,
          endMin: em,
          tag,
          label: title,
          slotKey: `todo:${t.id}:plan`,
        });
      }
    }

    if (t.timer_started_at) {
      const s = parseISO(t.timer_started_at);
      const sm = s.getHours() * 60 + s.getMinutes();
      let em: number | null = null;
      if (t.timer_ended_at) {
        const e = parseISO(t.timer_ended_at);
        em = e.getHours() * 60 + e.getMinutes();
      } else if (t.timer_seconds) {
        em = sm + Math.ceil(t.timer_seconds / 60);
      } else if (isRealToday) {
        // Still running — extend the block to the current minute so a live session
        // shows on the chart instead of vanishing until it's stopped.
        const n = new Date();
        em = n.getHours() * 60 + n.getMinutes();
      }
      if (em != null && em > sm) {
        actual.push({
          startMin: sm,
          endMin: em,
          tag,
          label: title,
          slotKey: `todo:${t.id}:timer`,
        });
      }
    }
  }

  for (const m of allMoments || []) {
    if (m.date !== todayDateStr) continue;
    const tag = resolveSlotTag(m.tags, m.text);
    if (m.timer_started_at) {
      if (!m.timer_ended_at && !isRealToday) continue;
      const s = parseISO(m.timer_started_at);
      const e = m.timer_ended_at ? parseISO(m.timer_ended_at) : new Date();
      const sm = s.getHours() * 60 + s.getMinutes();
      const em = e.getHours() * 60 + e.getMinutes();
      if (em > sm) {
        const subtitle = m.text?.split('\n---DETAIL---\n')[0]?.trim();
        const emo = m.emoji?.trim();
        const label = subtitle || emo || undefined;
        actual.push({
          startMin: sm,
          endMin: em,
          tag,
          label,
          slotKey: `moment:${m.id}`,
        });
      }
    }
  }

  return { planned, actual };
}

export function PlanDrift({ allTodos, completedTodos, allMoments, todayDateStr, defaultCollapsed = false, rhythmPalette, rhythmPresetId }: PlanDriftProps) {
  const { t, lang } = useLanguage();
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const prevRhythmPresetIdRef = useRef<string | undefined>(undefined);
  const isDarkMode = useIsDarkMode();

  // A still-running timer's contribution grows with wall-clock time. Re-tick on a
  // coarse interval (focused total is minute-granular) so the headline keeps climbing
  // instead of freezing until the next data refresh.
  const isRealToday = new Date(`${todayDateStr}T00:00:00`).toDateString() === new Date().toDateString();
  const hasRunningTimer =
    (allTodos || []).some(t => t.date === todayDateStr && t.timer_started_at && !t.timer_ended_at) ||
    (allMoments || []).some(m => m.date === todayDateStr && m.timer_started_at && !m.timer_ended_at);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!isRealToday || !hasRunningTimer) return;
    const id = setInterval(() => setTick(n => n + 1), 30000);
    return () => clearInterval(id);
  }, [isRealToday, hasRunningTimer]);

  const { planned: chartPlanned, actual: chartActual } = useMemo(
    () => buildExecutionSlots(allTodos, allMoments, todayDateStr),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allTodos, allMoments, todayDateStr, tick],
  );
  const bestStretchLabel = useMemo(() => computeBestStretch(chartActual), [chartActual]);
  const chartNowMin = useMemo(() => {
    const today = new Date(`${todayDateStr}T00:00:00`);
    const now = new Date();
    if (today.toDateString() !== now.toDateString()) return undefined;
    return now.getHours() * 60 + now.getMinutes();
  }, [todayDateStr]);
  const chartHasData = chartPlanned.length > 0 || chartActual.length > 0;

  /** After user picks a timeline palette, reveal the chart — collapsed view had no TimeTexture mounted. */
  useEffect(() => {
    if (rhythmPresetId === undefined) return;
    const prev = prevRhythmPresetIdRef.current;
    prevRhythmPresetIdRef.current = rhythmPresetId;
    if (prev !== undefined && prev !== rhythmPresetId) setCollapsed(false);
  }, [rhythmPresetId]);

  const drift = useMemo(() => {
    if (!allTodos || !completedTodos) return null;
    const todayMoments = (allMoments || []).filter(m => m.date === todayDateStr);
    return computeDrift(allTodos, completedTodos, todayMoments, todayDateStr);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allTodos, completedTodos, allMoments, todayDateStr, tick]);

  if (!drift) return null;

  const hasContent = drift.totalPlanned > 0 || drift.totalActiveMin > 0;
  if (!hasContent) return null;

  const totalPlannedMin = drift.categories.reduce((s, c) => s + c.plannedMin, 0);
  const focusedDur = drift.totalActiveMin > 0 ? fmtDur(drift.totalActiveMin) : null;
  // Plan adherence: of the time you planned, how much did you actually spend on
  // those planned things — bounded 0–100%. (The old metric divided the whole
  // day's focus, including unplanned moments, by a tiny plan total, which could
  // explode to absurd values like 693% when you'd barely planned anything.)
  const coveredPlannedMin = drift.categories.reduce((s, c) => s + Math.min(c.plannedMin, c.actualMin), 0);
  const planRatio = totalPlannedMin > 0 ? Math.round((coveredPlannedMin / totalPlannedMin) * 100) : null;
  const focusWord = lang === 'zh' ? '专注' : 'focused';
  const missedLabel = lang === 'zh' ? '错过' : 'missed';
  const leftWord = lang === 'zh' ? '剩余' : 'left';

  // Ambient "X left" — only meaningful when the user is viewing today.
  // Lives outside the chart, in the section header, as state — not labels
  // overlaid on the temporal structure.
  const todayDate = new Date(`${todayDateStr}T00:00:00`);
  const _now = new Date();
  const _isToday = todayDate.toDateString() === _now.toDateString();
  const _nowMin = _isToday ? _now.getHours() * 60 + _now.getMinutes() : null;
  const _remainingMin = _nowMin != null ? Math.max(0, PLAN_TIMELINE_BED_TOTAL_MIN - _nowMin) : null;
  const remainingStr = (() => {
    if (_remainingMin == null || _remainingMin <= 5) return null;
    if (_remainingMin < 60) return `${_remainingMin}m`;
    const h = Math.floor(_remainingMin / 60);
    const m = _remainingMin % 60;
    return m === 0 ? `${h}h` : `${h}h ${m}m`;
  })();

  // Collapsed: a single quiet line — number, eyebrow, an inline hairline
  // progress trace, and a hover-aware chevron. Compact and ambient,
  // not a "card" with stacked rows.
  if (collapsed) {
    const hasPlan = planRatio != null && totalPlannedMin > 0;
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="group flex w-full items-center gap-3 rounded-[14px] px-3 py-1.5 text-left transition-colors hover:bg-muted/20"
      >
        <span className="flex flex-shrink-0 items-baseline gap-1.5">
          {isRealToday && hasRunningTimer && (
            <span
              className="mr-0.5 h-1.5 w-1.5 self-center rounded-full bg-primary/70 animate-pulse"
              aria-hidden
              title={lang === 'zh' ? '计时进行中' : 'Timer running'}
            />
          )}
          <span
            className="text-[13px] leading-none tabular-nums text-foreground/85"
            style={{ fontWeight: 500, letterSpacing: '-0.01em' }}
          >
            {focusedDur ?? '0m'}
          </span>
          <span className={cn('text-[9.5px] leading-none tracking-[0.02em] text-muted-foreground/48', lang !== 'zh' && 'lowercase')}>
            {focusWord}
          </span>
        </span>

        {hasPlan && (
          <span className="flex min-w-0 flex-1 items-center gap-1.5">
            <span className="relative block h-[1.5px] flex-1 overflow-hidden rounded-full bg-foreground/[0.045]">
              <span
                className="block h-full rounded-full bg-primary/40 transition-[width] duration-700 ease-out"
                style={{ width: `${Math.min(100, Math.max(2, planRatio ?? 0))}%` }}
              />
            </span>
            <span className="font-mono text-[9px] leading-none tabular-nums text-muted-foreground/40">
              {planRatio}%
            </span>
          </span>
        )}

        {!hasPlan && <span className="flex-1" />}

        {drift.totalMissed > 0 && (
          <span className="inline-flex flex-shrink-0 items-center rounded-full bg-destructive/[0.08] px-1.5 py-0.5 text-[9.5px] font-medium leading-none tabular-nums tracking-[0.02em] text-destructive/60">
            {drift.totalMissed} {missedLabel}
          </span>
        )}

        {rhythmPalette && (
          <span
            className="flex flex-shrink-0 items-center gap-px"
            aria-hidden
            title={lang === 'zh' ? '节律配色预览' : 'Rhythm color preview'}
          >
            <span
              className="h-3 w-[4px] flex-shrink-0 rounded-full"
              style={{ backgroundColor: isDarkMode ? rhythmPalette.plannedDark : rhythmPalette.plannedLight }}
            />
            <span
              className="h-3 w-[4px] flex-shrink-0 rounded-full"
              style={{
                backgroundColor: (() => {
                  const raw = isDarkMode ? rhythmPalette.focusedDark : rhythmPalette.focusedLight;
                  return raw.includes('--primary') ? 'hsl(var(--primary) / 0.52)' : raw;
                })(),
              }}
            />
          </span>
        )}

        <ChevronRight
          size={12}
          className="flex-shrink-0 text-muted-foreground/25 transition-transform duration-200 group-hover:translate-x-0.5"
        />
      </button>
    );
  }

  return (
    <div className="mb-3">
      <div className="mb-2">
        <button
          onClick={() => setCollapsed(true)}
          className="group min-w-0 w-full rounded-[18px] px-2.5 py-2 text-left transition-colors hover:bg-muted/15"
          aria-label="Collapse execution"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-1.5">
              <ChevronDown
                size={13}
                className="flex-shrink-0 text-muted-foreground/42 transition-transform duration-200 group-hover:-translate-y-px"
              />
              <span className="truncate text-[10px] font-semibold uppercase leading-none tracking-[0.16em] text-muted-foreground/46">
                {lang === 'zh' ? '执行情况' : 'Execution'}
              </span>
            </div>
            <div className="flex flex-shrink-0 items-baseline gap-1.5">
              {isRealToday && hasRunningTimer && (
                <span
                  className="mr-0.5 h-1.5 w-1.5 self-center rounded-full bg-primary/70 animate-pulse"
                  aria-hidden
                  title={lang === 'zh' ? '计时进行中' : 'Timer running'}
                />
              )}
              <span className="text-[13px] font-medium leading-none tabular-nums tracking-[-0.01em] text-foreground/85">
                {focusedDur ?? '0m'}
              </span>
              <span className={cn('text-[9.5px] leading-none tracking-[0.02em] text-muted-foreground/48', lang !== 'zh' && 'lowercase')}>
                {focusWord}
              </span>
            </div>
          </div>
          {(planRatio != null && totalPlannedMin > 0) || remainingStr ? (
            <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-[19px]">
              {planRatio != null && totalPlannedMin > 0 && (
                <span
                  title={lang === 'zh' ? '计划的事情里实际做了多少' : 'How much of your plan you actually did'}
                  className="inline-flex items-center rounded-full border border-border/35 bg-background/45 px-2 py-0.5 font-mono text-[10px] font-medium tabular-nums text-muted-foreground/58"
                >
                  {lang === 'zh' ? `计划完成 ${planRatio}%` : `${planRatio}% of plan`}
                </span>
              )}
              {remainingStr && (
                <span className="inline-flex items-center rounded-full border border-border/30 bg-background/32 px-2 py-0.5 font-mono text-[10px] font-medium tabular-nums text-muted-foreground/50">
                  {remainingStr} {leftWord}
                </span>
              )}
            </div>
          ) : null}
        </button>
      </div>

      {/* Plan vs focused rhythm — stacked by tag inside each bucket (multi-category days read at a glance) */}
      {chartHasData && (
        <div className="mb-2 rounded-[18px] border border-border/30 bg-background/55 px-3 pb-2 pt-2.5 backdrop-blur-[2px]">
          <TimeTexture
            key={rhythmPresetId ?? 'rhythm'}
            plannedSlots={chartPlanned}
            actualSlots={chartActual}
            rangeStartMin={PLAN_TIMELINE_WAKE_TOTAL_MIN}
            rangeEndMin={PLAN_TIMELINE_BED_TOTAL_MIN}
            nowMin={chartNowMin}
            isDarkMode={isDarkMode}
            legendHint={lang === 'zh' ? '计划 · 专注' : 'planned · focused'}
            formatHoverDetail={
              lang === 'zh'
                ? (p, a) => `${Math.round(p)} 分钟计划 · ${Math.round(a)} 分钟专注`
                : (p, a) => `${Math.round(p)}m planned · ${Math.round(a)}m focused`
            }
            rhythmPalette={rhythmPalette}
          />
          {bestStretchLabel && (
            <p className="mt-1.5 border-t border-border/15 pt-1.5 text-center text-[11px] font-medium leading-snug text-foreground/70">
              {lang === 'zh' ? <>最佳时段 {bestStretchLabel}</> : <>Best stretch {bestStretchLabel}</>}
            </p>
          )}
        </div>
      )}

      {/* Missed tasks — kept; the histogram only shows what happened, not what didn't */}
      {drift.missedTasks.length > 0 && (
        <div className="mt-2 space-y-0.5">
          <p className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground/40 mb-0.5">{t('drift.missed')}</p>
          {drift.missedTasks.slice(0, 3).map((task, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <span className="w-[4px] h-[4px] rounded-full flex-shrink-0" style={{ backgroundColor: task.tag ? TAG_CATEGORY_COLORS[task.tag] || '#8E8E93' : '#8E8E93' }} />
              <span className="text-[11px] text-muted-foreground/50 truncate">{task.title}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
