import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { parseISO, format, isToday as isTodayFn } from 'date-fns';
import { Clock, Check, X, Plus, CalendarDays, Trash2, ArrowLeft, Pencil, Timer } from 'lucide-react';
import { cn, isImeComposing } from '@/lib/utils';
import { Todo } from '@/hooks/useTodos';
import { Moment } from '@/types';
import { ImportedEvent } from '@/hooks/useImportedEvents';
import { useLanguage } from '@/hooks/useLanguage';
import { useWorkTypes } from '@/hooks/useWorkTypes';
import { WORK_TYPE_META } from '@/lib/workType';
import { computeFreeRegions } from '@/lib/freeRegions';
import { autoSchedule, type Suggestion, type ScheduleLane, type DurationHistoryRow } from '@/lib/autoSchedule';
import { useSchedulingHistory } from '@/hooks/useSchedulingHistory';
import { getActivityAccentColor } from '@/lib/activityColors';
import {
  PLAN_TIMELINE_AXIS_START_HOUR as WAKE_HOUR,
  PLAN_TIMELINE_BEDTIME_HOUR as BEDTIME_HOUR,
  PLAN_TIMELINE_BEDTIME_MINUTE as BEDTIME_MINUTE,
  PLAN_TIMELINE_AXIS_START_MIN as WAKE_TOTAL_MIN,
  PLAN_TIMELINE_END_TOTAL_MIN as END_TOTAL_MIN,
  PLAN_TIMELINE_END_HOUR_CONTINUOUS as END_HOUR_CONTINUOUS,
  PLAN_TIMELINE_WAKE_TOTAL_MIN as DAY_WAKE_MIN,
  PLAN_TIMELINE_BED_TOTAL_MIN as DAY_BED_MIN,
} from '@/lib/planTimelineDayBounds';
import {
  DEFAULT_PLAN_TIMELINE_RHYTHM_PRESET_ID,
  getPlanTimelineRhythmPreset,
  presetToNowMarkers,
} from '@/lib/planTimelineRhythmPresets';
import {
  HOUR_HEIGHT,
  NOW_VIEWPORT_ANCHOR,
  PX_PER_MIN,
  DRAG_SNAP_MIN,
  MIN_BLOCK_MIN,
  REST_COLOR,
  SHOW_FREE_TIME_LABELS,
  TIME_RAIL_WIDTH_PX,
  TIMELINE_CANVAS_LIGHT,
  BLOCK_CORNER_PX,
  SLIM_BOTH_OUTER_PX,
  ULTRA_SHORT_OUTER_PX,
  DRAG_UNSCHEDULE_MARGIN_PX,
  MAX_TIMELINE_TITLE_FONT_PX,
  MAX_VISIBLE_COLS,
  formatGapMinutesLabel,
  TimelineIntervalPill,
  TimelineTodayRemainingPill,
  TimelineSpine,
  TimelineSpineBranch,
  SPINE_X_PX,
  hourLabel,
  fmtTime,
  localMinuteToISOString,
  snapMinute,
  getSmartDuration,
  getTagColor,
  softenTagForTimeline,
  deepenWarmTimelineColor,
  adjustTagForDarkMode,
  timelineFillGradient,
  timelineBlockShell,
  getTagIcon,
  assignColumns,
  slotKey,
  slotToMin,
  type TimeBlock,
  type SlotKey,
} from './planTimeline/planTimelinePrimitives';
import { buildPlanBlocks } from './planTimeline/buildPlanBlocks';
import { StorageImage } from "@/components/StorageImage";

interface PlanTimelineViewProps {
  todos: Todo[];
  moments: Moment[];
  importedEvents?: ImportedEvent[];
  /** Previous day's todos — used only to render early-morning tails of sessions
   *  that crossed midnight. Read-only. */
  prevDayTodos?: Todo[];
  /** Previous day's moments — same purpose as prevDayTodos. */
  prevDayMoments?: Moment[];
  date?: string; // yyyy-MM-dd, used to determine if viewing today or a past/future day
  onUpdateTodo: (id: string, updates: Partial<Todo>) => void;
  onAddTodo: (title: string, timeSegment: string) => Promise<unknown>;
  onDropTodo?: (todoId: string, startMin: number) => void;
  onUnscheduleTodo?: (id: string) => void;
  onDeleteTodo?: (id: string) => void;
  onRenameTodo?: (id: string, title: string) => void;
  onStartTimer?: (todoId: string) => void;
  /** Edit a moment row (focus-session or standalone) shown on the timeline. */
  onUpdateMoment?: (id: string, updates: Partial<Moment>) => void;
  /** Remove a moment row shown on the timeline. */
  onDeleteMoment?: (id: string) => void;
  activeTimerIds?: Set<string>;
  getTimerElapsed?: (todoId: string) => number;
  /** Fired when the user STARTS a rest break from the timeline's Rest toggle.
   *  The Plan view uses it to pause every running task timer at once, so a rest
   *  window stops all live clocks together. */
  onRestStart?: () => void;
  /** Fired when the user STOPS the rest break. Symmetric to onRestStart — the
   *  Plan view resumes every timer the rest paused so the clocks pick back up. */
  onRestEnd?: () => void;
  /** Plan page rhythm picker — shifts “now” marker + stays in sync with Execution chart */
  rhythmPresetId?: string;
}

// Deterministic PRNG (mulberry32) — same seed → same sparkle pattern every mount.
// Prevents "positions jump on rerender" while still giving each burst its own layout.
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

interface SparkleBurstProps {
  seed: string;
  count?: number;
  color?: string;
  oneShot?: boolean;
}

type CssVarStyle = React.CSSProperties & Record<`--${string}`, string>;
type TodoWithPlanMeta = Todo & { parent_due_id?: string | null; habit_category?: string | null };

const SparkleBurst = React.memo(function SparkleBurst({ seed, count = 16, color, oneShot }: SparkleBurstProps) {
  const sparkles = useMemo(() => {
    const rnd = mulberry32(hashSeed(seed));
    const out: Array<{ sx: number; sy: number; size: number; dx: number; dy: number; rot: number; dur: number; delay: number }> = [];
    // Container is inset:-24px around the block. In this container's coord system
    // the block occupies roughly [16%, 84%] of both axes. We want sparkles to land
    // OUTSIDE that inner rect (halo ring), so we sample uniformly in [0, 100] and
    // reject samples that fall inside the inner block area.
    const INNER_MIN = 16;
    const INNER_MAX = 84;
    let attempts = 0;
    while (out.length < count && attempts < count * 20) {
      attempts++;
      const sx = rnd() * 100;
      const sy = rnd() * 100;
      const insideBlock =
        sx > INNER_MIN && sx < INNER_MAX && sy > INNER_MIN && sy < INNER_MAX;
      if (insideBlock) continue;
      const size = 2.5 + rnd() * 3.5;
      // Drift outward from block: push away from center on both axes.
      const cx = 50, cy = 50;
      const outX = sx < cx ? -1 : 1;
      const outY = sy < cy ? -1 : 1;
      const dx = outX * (4 + rnd() * 10);   // 4-14px outward horizontally
      const dy = outY * (4 + rnd() * 12);   // 4-16px outward vertically
      const rot = (rnd() - 0.5) * 300;
      const dur = 1200 + rnd() * 900;
      const delay = rnd() * 1400;
      out.push({ sx, sy, size, dx, dy, rot, dur, delay });
    }
    return out;
  }, [seed, count]);

  return (
    <span
      className="plan-drop-sparkle-burst"
      style={color ? ({ '--sparkle-color': color } as CssVarStyle) : undefined}
      aria-hidden="true"
    >
      {sparkles.map((s, i) => (
        <i
          key={i}
          style={{
            '--sx': `${s.sx}%`,
            '--sy': `${s.sy}%`,
            '--sz': `${s.size}px`,
            '--dx': `${s.dx}px`,
            '--dy': `${s.dy}px`,
            '--rot': `${s.rot}deg`,
            '--sd': `${s.dur}ms`,
            '--sdl': oneShot ? '0ms' : `${s.delay}ms`,
          } as CssVarStyle}
        />
      ))}
    </span>
  );
});

export function PlanTimelineView({ todos, moments, importedEvents, prevDayTodos, prevDayMoments, date, onUpdateTodo, onAddTodo, onDropTodo, onUnscheduleTodo, onDeleteTodo, onRenameTodo, onStartTimer, onUpdateMoment, onDeleteMoment, activeTimerIds, getTimerElapsed, onRestStart, onRestEnd, rhythmPresetId }: PlanTimelineViewProps) {
  const { t, lang } = useLanguage();
  const { getWorkType } = useWorkTypes();
  const tOr = useCallback((key: string, fallback: string) => {
    const translated = t(key);
    return !translated || translated === key ? fallback : translated;
  }, [t]);
  const [displayMode, setDisplayMode] = useState<'plan' | 'actual' | 'both'>('both');
  // Auto-plan preview: ghosted placements the user can accept / adjust / dismiss.
  // `null` = not previewing. laneOverrides lets the user flip a task focus↔background.
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [laneOverrides, setLaneOverrides] = useState<Record<string, ScheduleLane>>({});
  // Learned habit history (Phase 2): real durations + preferred time-of-day per
  // work type. Degrades to empty (rule-based) when signed out / no history.
  const schedulingHistory = useSchedulingHistory();
  // Determine if we're viewing today or a different date.
  // Use a stable day key so memo deps don't see a brand-new Date object each render.
  const viewingDateKey = date || format(new Date(), 'yyyy-MM-dd');
  const viewingDate = useMemo(() => new Date(`${viewingDateKey}T00:00:00`), [viewingDateKey]);
  const isViewingToday = isTodayFn(viewingDate);

  // Track dark mode so we can adapt the (light-mode-tuned) hex tag colors to
  // sit harmoniously on a dark canvas. Watches BOTH the manual `.dark` class
  // toggle and the system color-scheme preference.
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof document === 'undefined') return false;
    if (document.documentElement.classList.contains('dark')) return true;
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const recompute = () => {
      const hasClass = document.documentElement.classList.contains('dark');
      setIsDarkMode(hasClass || mq.matches);
    };
    recompute();
    mq.addEventListener('change', recompute);
    const observer = new MutationObserver(recompute);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => {
      mq.removeEventListener('change', recompute);
      observer.disconnect();
    };
  }, []);

  const rhythmNowMarkers = useMemo(() => {
    const preset = getPlanTimelineRhythmPreset(rhythmPresetId ?? DEFAULT_PLAN_TIMELINE_RHYTHM_PRESET_ID);
    return presetToNowMarkers(preset, isDarkMode);
  }, [rhythmPresetId, isDarkMode]);

  // Use the same accent source as task rows + focus timer. Keep the raw hue here;
  // the block shell already mixes it into the timeline surface.
  const getThemedTagColor = useCallback(
    (tags?: string[], title?: string) => {
      return getActivityAccentColor({ title, tags, isDarkMode });
    },
    [isDarkMode]
  );

  const timelineCanvasBg = isDarkMode ? 'hsl(240 5% 6%)' : TIMELINE_CANVAS_LIGHT;
  const timelineHourLineColor = isDarkMode ? 'hsl(240 4% 100% / 0.12)' : 'rgba(55, 55, 62, 0.10)';
  const timelineHalfHourLineColor = isDarkMode ? 'hsl(240 4% 100% / 0.06)' : 'rgba(55, 55, 62, 0.055)';
  const timelineRailLabelColor = isDarkMode ? 'hsl(240 5% 86% / 0.46)' : 'rgba(75, 75, 80, 0.48)';
  const timelinePastTint = isDarkMode ? 'hsl(240 4% 100% / 0.018)' : 'rgba(15, 23, 42, 0.014)';
  // Ghost auto-plan preview — half-real placements. Warm primary tint, dashed so it
  // reads as "proposed, not committed". Focus = solid dash; background = softer dots.
  const ghostFocusBg = isDarkMode ? 'hsl(24 46% 58% / 0.14)' : 'hsl(24 55% 48% / 0.10)';
  const ghostFocusEdge = isDarkMode ? 'hsl(24 50% 68% / 0.55)' : 'hsl(24 55% 46% / 0.50)';
  const ghostBgBg = isDarkMode ? 'hsl(150 22% 52% / 0.12)' : 'hsl(150 28% 40% / 0.09)';
  const ghostBgEdge = isDarkMode ? 'hsl(150 26% 62% / 0.45)' : 'hsl(150 30% 40% / 0.42)';
  const suggestionToolbarBg = isDarkMode ? 'hsl(240 4% 8% / 0.80)' : 'hsl(0 0% 100% / 0.78)';
  const suggestionToolbarBorder = isDarkMode ? 'hsl(0 0% 100% / 0.08)' : 'hsl(24 12% 40% / 0.12)';
  const suggestionToolbarLabelBg = isDarkMode ? 'hsl(24 46% 58% / 0.16)' : 'hsl(24 55% 48% / 0.12)';
  const suggestionToolbarLabelFg = isDarkMode ? 'hsl(24 58% 76%)' : 'hsl(24 46% 34%)';
  const suggestionToolbarActionBg = isDarkMode ? 'hsl(0 0% 0% / 0.18)' : 'hsl(0 0% 100% / 0.58)';
  const suggestionToolbarActionBorder = isDarkMode ? 'hsl(0 0% 100% / 0.08)' : 'hsl(24 12% 40% / 0.12)';
  
  const [dragging, setDragging] = useState<{ id: string; target: 'plan' | 'actual' | 'moment'; edge: 'move' | 'top' | 'bottom'; startY: number; startMin: number; origStart: number; origEnd: number } | null>(null);
  const [dragPreview, setDragPreview] = useState<{ startMin: number; endMin: number } | null>(null);
  const [dragOutside, setDragOutside] = useState(false);
  const [slotAddTitle, setSlotAddTitle] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const slotInputRef = useRef<HTMLInputElement>(null);
  const justDraggedRef = useRef(false);
  // For past/future days, treat the entire day as "past" (nowMin = end of day)
  const [nowMin, setNowMin] = useState(() => {
    if (!isViewingToday) return END_TOTAL_MIN;
    const n = new Date();
    return n.getHours() * 60 + n.getMinutes();
  });
  const [nowSec, setNowSec] = useState(() => new Date().getSeconds());
  const nowPreciseMin = isViewingToday ? nowMin + nowSec / 60 : nowMin;
  const nowTimeLabel = fmtTime(nowMin);

  const [selectedSlots, setSelectedSlots] = useState<Set<SlotKey>>(new Set());
  const [customRange, setCustomRange] = useState<{ startMin: number; endMin: number } | null>(null);
  const [startInput, setStartInput] = useState('');
  const [endInput, setEndInput] = useState('');
  const [slotDragging, setSlotDragging] = useState(false);
  const [slotDragMode, setSlotDragMode] = useState<'select' | 'deselect'>('select');
  const [edgeDragging, setEdgeDragging] = useState<'top' | 'bottom' | null>(null);
  const edgeDragStartY = useRef(0);
  const edgeDragOrigRange = useRef<{ startMin: number; endMin: number } | null>(null);
  const [rangeDragging, setRangeDragging] = useState<{ anchorMin: number } | null>(null);
  const [dropIndicatorMin, setDropIndicatorMin] = useState<number | null>(null);
  const [dragTaskTitle, setDragTaskTitle] = useState<string | null>(null);
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const [freshDropId, setFreshDropId] = useState<string | null>(null);
  const freshDropTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [editingBlockTitle, setEditingBlockTitle] = useState('');
  const [editingTimeBlockId, setEditingTimeBlockId] = useState<string | null>(null);
  const [editingTimeStart, setEditingTimeStart] = useState('');
  const [editingTimeEnd, setEditingTimeEnd] = useState('');
  const [editingActualBlockId, setEditingActualBlockId] = useState<string | null>(null);
  const [editingActualStart, setEditingActualStart] = useState('');
  const [editingActualEnd, setEditingActualEnd] = useState('');
  const [selectedResumeBlockId, setSelectedResumeBlockId] = useState<string | null>(null);
  const [photoLightbox, setPhotoLightbox] = useState<{ photos: string[]; index: number } | null>(null);
  const restKey = `eol_rest_${date || format(new Date(), 'yyyy-MM-dd')}`;
  const [restStartMin, setRestStartMinState] = useState<number | null>(() => {
    try { const v = localStorage.getItem(`${restKey}_start`); return v !== null ? parseInt(v, 10) : null; } catch { return null; }
  });
  const [restBlocks, setRestBlocksState] = useState<{ id: string; startMin: number; endMin: number }[]>(() => {
    try {
      const v = localStorage.getItem(`${restKey}_blocks`);
      const parsed: { id: string; startMin: number; endMin: number }[] = v ? JSON.parse(v) : [];
      // Discard any auto-close blocks left by a previous buggy version
      return parsed.filter(b => !b.id.startsWith('rest-auto-'));
    } catch { return []; }
  });
  const setRestStartMin = useCallback((val: number | null) => {
    setRestStartMinState(val);
    try {
      if (val !== null) {
        localStorage.setItem(`${restKey}_start`, String(val));
      } else {
        localStorage.removeItem(`${restKey}_start`);
      }
    } catch {
      // Ignore storage write failures (private mode / quota).
    }
  }, [restKey]);
  const setRestBlocks = useCallback((updater: (prev: { id: string; startMin: number; endMin: number }[]) => { id: string; startMin: number; endMin: number }[]) => {
    setRestBlocksState(prev => {
      const next = updater(prev);
      try {
        localStorage.setItem(`${restKey}_blocks`, JSON.stringify(next));
      } catch {
        // Ignore storage write failures (private mode / quota).
      }
      return next;
    });
  }, [restKey]);
  // Track previous key to detect date navigation; skip on initial mount to avoid overwriting live state
  const prevRestKeyRef = useRef(restKey);
  const initialScrollDateKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (prevRestKeyRef.current === restKey) return;
    prevRestKeyRef.current = restKey;
    try {
      const v = localStorage.getItem(`${restKey}_start`);
      setRestStartMinState(v !== null ? parseInt(v, 10) : null);
    } catch { setRestStartMinState(null); }
    try {
      const v = localStorage.getItem(`${restKey}_blocks`);
      const parsed: { id: string; startMin: number; endMin: number }[] = v ? JSON.parse(v) : [];
      setRestBlocksState(parsed.filter(b => !b.id.startsWith('rest-auto-')));
    } catch { setRestBlocksState([]); }
  }, [restKey]);

  useEffect(() => {
    if (!isViewingToday) {
      setNowMin(END_TOTAL_MIN);
      return;
    }
    const timer = setInterval(() => {
      const n = new Date();
      setNowMin(n.getHours() * 60 + n.getMinutes());
      setNowSec(n.getSeconds());
    }, 1000);
    return () => clearInterval(timer);
  }, [isViewingToday]);

  const planBlocks = useMemo<TimeBlock[]>(
    () => buildPlanBlocks(
      todos, importedEvents, moments, activeTimerIds, getTimerElapsed,
      (prevDayTodos?.length || prevDayMoments?.length)
        ? { todos: prevDayTodos ?? [], moments: prevDayMoments ?? [] }
        : undefined,
      format(viewingDate, 'yyyy-MM-dd'),
    ),
    [todos, importedEvents, moments, activeTimerIds, getTimerElapsed, prevDayTodos, prevDayMoments, viewingDate],
  );

  /** Extend the visible axis upward ONLY when a live-running timer that
   *  started yesterday has crossed into today — that block is the only thing
   *  that fills the pre-midnight hours continuously into now. Completed
   *  cross-midnight sessions clamp their tail to 00:00 (see makeTail) and
   *  don't earn extra axis; otherwise 23:xx would show as an empty band above
   *  the tail. `startMin < 0` is the load-bearing signal — a live tail is the
   *  only thing makeTail produces with a negative startMin. */
  const AXIS_LEAD_MIN = 180;
  const axisStartMin = useMemo(() => {
    let earliestNeg = 0;
    for (const b of planBlocks) {
      if (!b.continuedFromPrevDay) continue;
      if (b.startMin < earliestNeg) earliestNeg = b.startMin;
    }
    if (earliestNeg >= 0) return WAKE_TOTAL_MIN;
    const leadNeeded = Math.min(AXIS_LEAD_MIN, Math.abs(earliestNeg) + 15);
    return -leadNeeded;
  }, [planBlocks]);

  // A live (actively-timing) block visually extends down to the "now" line,
  // even though its recorded actual end is only a minute or two in. Column
  // assignment must reserve that on-screen span, otherwise a running task and a
  // later block that visually overlap get placed in the SAME column and stack on
  // top of each other. We extend active blocks' effective end to now purely for
  // the overlap/column computation (rendering still uses the live values).
  const blocksForColumns = useMemo(() => {
    if (!activeTimerIds || activeTimerIds.size === 0) return planBlocks;
    const liveEnd = Math.round(nowPreciseMin);
    return planBlocks.map(b => {
      if (!activeTimerIds.has(b.id)) return b;
      const extendedEnd = Math.max(b.endMin, liveEnd);
      const extendedActualEnd = b.actualEndMin != null ? Math.max(b.actualEndMin, liveEnd) : b.actualEndMin;
      if (extendedEnd === b.endMin && extendedActualEnd === b.actualEndMin) return b;
      return { ...b, endMin: extendedEnd, actualEndMin: extendedActualEnd };
    });
  }, [planBlocks, activeTimerIds, nowPreciseMin]);

  const positioned = useMemo(() => assignColumns(blocksForColumns), [blocksForColumns]);

  const blockTitleById = useMemo(() => {
    const map = new Map<string, string>();
    planBlocks.forEach(b => map.set(b.id, b.title));
    return map;
  }, [planBlocks]);

  const sortedPlanBlocks = useMemo(
    () => [...planBlocks].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin),
    [planBlocks],
  );
  const lastScheduledEndMin = sortedPlanBlocks.length > 0
    ? sortedPlanBlocks[sortedPlanBlocks.length - 1].endMin
    : null;

  // Tasks sitting in the list with no time yet — candidates for auto-planning.
  // Excludes completed, already-scheduled (plan or running timer), step children
  // and habit rows.
  const unscheduledTodos = useMemo(
    () =>
      todos.filter(
        t => {
          const todoMeta = t as TodoWithPlanMeta;
          return (
            !todoMeta.is_completed &&
            !todoMeta.plan_started_at &&
            !todoMeta.timer_started_at &&
            !todoMeta.parent_due_id &&
            !todoMeta.habit_category
          );
        },
      ),
    [todos],
  );

  const buildSuggestions = useCallback(
    (overrides: Record<string, ScheduleLane>) => {
      const free = computeFreeRegions(
        sortedPlanBlocks.map(b => ({ startMin: b.startMin, endMin: b.endMin })),
        {
          dayStart: DAY_WAKE_MIN,
          dayEnd: DAY_BED_MIN,
          minGapMin: 5,
          nowMin: isViewingToday ? nowMin : undefined,
        },
      );
      return autoSchedule(
        unscheduledTodos.map(t => ({
          id: t.id,
          title: t.title,
          tags: t.tags,
          time_segment: t.time_segment,
        })),
        free,
        {
          dayStart: DAY_WAKE_MIN,
          dayEnd: DAY_BED_MIN,
          laneOverrides: overrides,
          history: schedulingHistory.durations,
          profile: schedulingHistory.profile,
        },
      );
    },
    [sortedPlanBlocks, unscheduledTodos, isViewingToday, nowMin, schedulingHistory],
  );

  const handleAutoPlan = useCallback(() => {
    if (suggestions) {
      setSuggestions(null);
      setLaneOverrides({});
      return;
    }
    setSuggestions(buildSuggestions({}));
  }, [suggestions, buildSuggestions]);

  const dismissSuggestions = useCallback(() => {
    setSuggestions(null);
    setLaneOverrides({});
  }, []);

  const removeSuggestion = useCallback((todoId: string) => {
    setSuggestions(prev => {
      const next = prev ? prev.filter(x => x.todoId !== todoId) : prev;
      return next && next.length ? next : null;
    });
    setLaneOverrides(prev => {
      if (!(todoId in prev)) return prev;
      const { [todoId]: _removed, ...rest } = prev;
      return rest;
    });
  }, []);

  const acceptSuggestion = useCallback(
    (s: Suggestion) => {
      const d = date || new Date().toISOString().slice(0, 10);
      onUpdateTodo(s.todoId, {
        plan_started_at: localMinuteToISOString(d, s.startMin),
        plan_ended_at: localMinuteToISOString(d, s.endMin),
      });
      removeSuggestion(s.todoId);
    },
    [date, onUpdateTodo, removeSuggestion],
  );

  const acceptAllSuggestions = useCallback(() => {
    if (!suggestions) return;
    const d = date || new Date().toISOString().slice(0, 10);
    suggestions.forEach(s =>
      onUpdateTodo(s.todoId, {
        plan_started_at: localMinuteToISOString(d, s.startMin),
        plan_ended_at: localMinuteToISOString(d, s.endMin),
      }),
    );
    setSuggestions(null);
    setLaneOverrides({});
  }, [suggestions, date, onUpdateTodo]);

  const toggleSuggestionLane = useCallback(
    (todoId: string) => {
      const currentLane =
        laneOverrides[todoId] ??
        suggestions?.find(s => s.todoId === todoId)?.lane ??
        'focus';
      const nextOverrides: Record<string, ScheduleLane> = {
        ...laneOverrides,
        [todoId]: currentLane === 'focus' ? 'background' : 'focus',
      };
      setLaneOverrides(nextOverrides);
      setSuggestions(buildSuggestions(nextOverrides));
    },
    [laneOverrides, suggestions, buildSuggestions],
  );

  const hours: number[] = [];
  // Extend axis to 04:00 next day (continuous hour 28) for night-owls.
  // Also extend UPWARD when a prev-day session crossed midnight (axisStartMin < 0).
  const firstHour = Math.floor(axisStartMin / 60);
  for (let h = firstHour; h <= END_HOUR_CONTINUOUS; h++) hours.push(h);

  const minToY = useCallback((minute: number) => {
    const m = Math.max(axisStartMin, Math.min(minute, END_TOTAL_MIN));
    return (m - axisStartMin) * PX_PER_MIN;
  }, [axisStartMin]);

  const yToMin = useCallback((y: number) => {
    return Math.round(axisStartMin + y / PX_PER_MIN);
  }, [axisStartMin]);

  const totalHeight = minToY(END_TOTAL_MIN);

  useEffect(() => {
    if (!containerRef.current) return;
    if (isViewingToday && initialScrollDateKeyRef.current === viewingDateKey) return;
    if (isViewingToday) initialScrollDateKeyRef.current = viewingDateKey;
    // The container's clientHeight is 0 on the first synchronous tick after
    // mount (layout not settled). Reading nowTop/viewport in that state made
    // the scroll target collapse to nowTop-0 → the whole rail scrolled past
    // the viewport, leaving the user staring at empty morning hours. Retry
    // via rAF until we get a real height (bounded so we can't loop forever).
    let attempts = 0;
    let raf = 0;
    const applyScroll = () => {
      const el = containerRef.current;
      if (!el) return;
      const viewportHeight = el.clientHeight || 0;
      if (viewportHeight === 0 && attempts < 8) {
        attempts += 1;
        raf = requestAnimationFrame(applyScroll);
        return;
      }
      if (isViewingToday) {
        const nowTop = minToY(nowMin);
        const scrollTarget = Math.max(0, nowTop - viewportHeight * NOW_VIEWPORT_ANCHOR);
        el.scrollTop = scrollTarget;
      } else {
        // For past/future days, scroll to 6 AM
        const sixAmTop = minToY(6 * 60);
        el.scrollTop = Math.max(0, sixAmTop);
      }
    };
    raf = requestAnimationFrame(applyScroll);
    return () => cancelAnimationFrame(raf);
  }, [isViewingToday, minToY, nowMin, viewingDateKey]);

  const sessionContinuationMap = useMemo(() => {
    const grouped = new Map<string, Array<{
      id: string;
      startMin: number;
      endMin: number;
    }>>();

    positioned.forEach(({ block }) => {
      if (!block.sessionGroupKey) return;
      const startMin = block.actualStartMin ?? block.startMin;
      const endMin = block.actualEndMin ?? block.endMin;
      if (!grouped.has(block.sessionGroupKey)) grouped.set(block.sessionGroupKey, []);
      grouped.get(block.sessionGroupKey)!.push({ id: block.id, startMin, endMin });
    });

    const map = new Map<string, { downHeight: number; gapMin: number }>();

    grouped.forEach(items => {
      items.sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
      for (let i = 0; i < items.length - 1; i += 1) {
        const current = items[i];
        const next = items[i + 1];
        const gapMin = next.startMin - current.endMin;
        if (gapMin <= 0 || gapMin > 240) continue;
        map.set(current.id, {
          downHeight: Math.max(8, minToY(next.startMin) - minToY(current.endMin)),
          gapMin,
        });
      }
    });

    return map;
  }, [positioned, minToY]);

  const remainingTimeStr = useMemo(() => {
    const bedMin = BEDTIME_HOUR * 60 + BEDTIME_MINUTE;
    const diff = Math.max(0, bedMin - nowMin);
    return formatGapMinutesLabel(diff);
  }, [nowMin]);

  const allSlots = useMemo(() => {
    const slots: { key: SlotKey; h: number; half: 0 | 30; startMin: number; endMin: number }[] = [];
    const startH = Math.floor(axisStartMin / 60);
    for (let h = startH; h <= END_HOUR_CONTINUOUS; h++) {
      slots.push({ key: slotKey(h, 0), h, half: 0, startMin: h * 60, endMin: h * 60 + 30 });
      if (h < END_HOUR_CONTINUOUS) {
        slots.push({ key: slotKey(h, 30), h, half: 30, startMin: h * 60 + 30, endMin: h * 60 + 60 });
      }
    }
    return slots;
  }, [axisStartMin]);

  const slotRange = useMemo(() => {
    if (selectedSlots.size === 0) return null;
    const sorted = [...selectedSlots].map(k => slotToMin(k)).sort((a, b) => a.start - b.start);
    return { startMin: sorted[0].start, endMin: sorted[sorted.length - 1].end };
  }, [selectedSlots]);

  const selectedRange = customRange ?? slotRange;
  const selectedRangeStartMin = selectedRange?.startMin ?? null;
  const selectedRangeEndMin = selectedRange?.endMin ?? null;
  const hasSelectedRange = selectedRange !== null;

  useEffect(() => {
    if (selectedRangeStartMin == null || selectedRangeEndMin == null) {
      setStartInput('');
      setEndInput('');
      return;
    }
    setStartInput(fmtTime(selectedRangeStartMin));
    setEndInput(fmtTime(selectedRangeEndMin));
  }, [selectedRangeStartMin, selectedRangeEndMin]);

  // Auto-focus the creation card input when selection range appears
  // and dismiss on any click outside the creation card
  useEffect(() => {
    if (hasSelectedRange) {
      requestAnimationFrame(() => slotInputRef.current?.focus());
      const handler = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (target.closest('[data-creation-card="true"]') || target.closest('[data-range-handle="true"]')) return;
        setSlotAddTitle('');
        setSelectedSlots(new Set());
        setCustomRange(null);
      };
      // Use setTimeout to avoid immediately dismissing from the same click
      const timer = setTimeout(() => document.addEventListener('mousedown', handler), 0);
      return () => { clearTimeout(timer); document.removeEventListener('mousedown', handler); };
    }
  }, [hasSelectedRange]);

  const clampSelectionRange = useCallback((start: number, end: number) => {
    const safeStart = Math.max(WAKE_TOTAL_MIN, Math.min(start, END_TOTAL_MIN - 10));
    const safeEnd = Math.max(safeStart + 10, Math.min(end, END_TOTAL_MIN));
    return { startMin: safeStart, endMin: safeEnd };
  }, []);

  const clientYToMin = useCallback((clientY: number) => {
    if (!containerRef.current) return nowMin;
    const rect = containerRef.current.getBoundingClientRect();
    const yInScrollable = clientY - rect.top + containerRef.current.scrollTop;
    return yToMin(yInScrollable);
  }, [nowMin, yToMin]);

  const getBlockEditTarget = useCallback((block: TimeBlock, mode: 'plan' | 'actual' | 'both', isTimerActive: boolean) => {
    if (block.source !== 'todo') return null;
    const hasPlan = block.planStartMin != null;
    const hasActual = !!block.hasActual;

    if (mode === 'plan') return hasPlan ? 'plan' : null;
    if (mode === 'actual') return hasActual && !isTimerActive ? 'actual' : null;
    // In Both mode, mixed plan+actual blocks should still be editable.
    // Default to editing the actual span because it represents what happened.
    if (hasPlan && hasActual) return !isTimerActive ? 'actual' : null;
    if (hasPlan) return 'plan';
    if (hasActual && !isTimerActive) return 'actual';
    return null;
  }, []);

  // Moment blocks carry their real row id behind a `moment-` prefix on the
  // timeline. Strip it so moment edit/delete hooks receive the DB id.
  const parseMomentBlockId = useCallback((blockId: string) =>
    blockId.startsWith('moment-') ? blockId.slice('moment-'.length) : null, []);

  const handleMouseDown = useCallback((e: React.MouseEvent, block: TimeBlock, edge: 'move' | 'top' | 'bottom') => {
    if (block.source === 'imported') return;
    // Moment blocks have a single (actual) span — drag/resize edits that span.
    if (block.source === 'moment') {
      if (!onUpdateMoment) return;
      e.preventDefault();
      e.stopPropagation();
      const startMin = clientYToMin(e.clientY);
      setDragging({ id: block.id, target: 'moment', edge, startY: e.clientY, startMin, origStart: block.startMin, origEnd: block.endMin });
      setDragPreview({ startMin: block.startMin, endMin: block.endMin });
      return;
    }
    const isTimerActive = !!activeTimerIds?.has(block.id);
    const target = getBlockEditTarget(block, displayMode, isTimerActive);
    if (!target) return;
    e.preventDefault();
    e.stopPropagation();
    const startMin = clientYToMin(e.clientY);
    const origStart = target === 'actual'
      ? (block.actualStartMin ?? block.startMin)
      : (block.planStartMin ?? block.startMin);
    const origEnd = target === 'actual'
      ? (block.actualEndMin ?? block.endMin)
      : (block.planEndMin ?? block.endMin);
    setDragging({ id: block.id, target, edge, startY: e.clientY, startMin, origStart, origEnd });
    setDragPreview({ startMin: origStart, endMin: origEnd });
  }, [activeTimerIds, clientYToMin, displayMode, getBlockEditTarget, onUpdateMoment]);

  const isOutsideTimeline = useCallback((clientX: number, clientY: number) => {
    if (!containerRef.current) return false;
    const rect = containerRef.current.getBoundingClientRect();
    return (
      clientX < rect.left - DRAG_UNSCHEDULE_MARGIN_PX ||
      clientX > rect.right + DRAG_UNSCHEDULE_MARGIN_PX ||
      clientY < rect.top - DRAG_UNSCHEDULE_MARGIN_PX ||
      clientY > rect.bottom + DRAG_UNSCHEDULE_MARGIN_PX
    );
  }, []);

  const updateDragPreview = useCallback((clientX: number, clientY: number) => {
    if (rangeDragging) {
      const currentMin = snapMinute(clientYToMin(clientY));
      const start = Math.min(rangeDragging.anchorMin, currentMin);
      const end = Math.max(rangeDragging.anchorMin, currentMin);
      setCustomRange(clampSelectionRange(start, end));
      return;
    }

    if (!dragging) return;

    // Dragging a whole block out of the timeline means "put it back in the list".
    if (dragging.edge === 'move') {
      const isOutside = isOutsideTimeline(clientX, clientY);
      setDragOutside(isOutside);
      if (isOutside) return; // Don't update preview position when outside
    }

    const currentMin = snapMinute(clientYToMin(clientY));

    let newStart = dragging.origStart;
    let newEnd = dragging.origEnd;

    if (dragging.edge === 'move') {
      const delta = currentMin - dragging.startMin;
      newStart = Math.max(WAKE_TOTAL_MIN, dragging.origStart + delta);
      newEnd = newStart + (dragging.origEnd - dragging.origStart);
      if (newEnd > END_TOTAL_MIN) {
        newEnd = END_TOTAL_MIN;
        newStart = newEnd - (dragging.origEnd - dragging.origStart);
      }
    } else if (dragging.edge === 'top') {
      const deltaMin = (clientY - dragging.startY) / PX_PER_MIN;
      newStart = Math.max(WAKE_TOTAL_MIN, Math.min(snapMinute(dragging.origStart + deltaMin), dragging.origEnd - MIN_BLOCK_MIN));
    } else {
      const deltaMin = (clientY - dragging.startY) / PX_PER_MIN;
      newEnd = Math.max(dragging.origStart + MIN_BLOCK_MIN, Math.min(snapMinute(dragging.origEnd + deltaMin), END_TOTAL_MIN));
    }

    setDragPreview({
      startMin: snapMinute(newStart),
      endMin: snapMinute(newEnd),
    });
  }, [dragging, rangeDragging, clientYToMin, clampSelectionRange, isOutsideTimeline]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    updateDragPreview(e.clientX, e.clientY);
  }, [updateDragPreview]);

  const handleMouseUp = useCallback((clientX?: number, clientY?: number) => {
    if (rangeDragging) setRangeDragging(null);

    if (dragging && dragPreview) {
      justDraggedRef.current = true;
      setTimeout(() => { justDraggedRef.current = false; }, 0);

      const releasedOutside = dragging.edge === 'move' && clientX != null && clientY != null
        ? isOutsideTimeline(clientX, clientY)
        : dragOutside;

      // If dragged outside the timeline, act on the block being dragged.
      // In Both mode this can still be a plan frame, so don't key this off the visible tab.
      if (releasedOutside) {
        if (dragging.target === 'plan' && onUnscheduleTodo) {
          // Plan frame: move task back to the list.
          onUnscheduleTodo(dragging.id);
        } else if (dragging.target === 'actual') {
          // Actual frame: clear actual time, keep plan.
          onUpdateTodo(dragging.id, {
            timer_started_at: null,
            timer_ended_at: null,
            timer_seconds: null,
            is_completed: false,
          });
        }
      } else {
        const targetDay = date || format(new Date(), 'yyyy-MM-dd');
        const startISO = localMinuteToISOString(targetDay, dragPreview.startMin);
        const endISO = localMinuteToISOString(targetDay, dragPreview.endMin);
        const diffSec = Math.max(0, (dragPreview.endMin - dragPreview.startMin) * 60);

        if (dragging.target === 'moment') {
          const momentId = parseMomentBlockId(dragging.id);
          if (momentId) {
            onUpdateMoment?.(momentId, {
              timer_started_at: startISO,
              timer_ended_at: endISO,
              timer_seconds: diffSec,
            } as Partial<Moment>);
          }
        } else if (dragging.target === 'plan') {
          // 计划模式下调整计划时间
          onUpdateTodo(dragging.id, {
            plan_started_at: startISO,
            plan_ended_at: endISO,
          });
        } else if (dragging.target === 'actual') {
          // 实际模式下视为补记 actual，顺便标记为完成（出现删除线）
          // 但如果当前正在计时，就不要强行写死结束时间
          const isActive = activeTimerIds?.has(dragging.id);
          if (!isActive) {
            onUpdateTodo(dragging.id, {
              timer_started_at: startISO,
              timer_ended_at: endISO,
              timer_seconds: diffSec,
              is_completed: true,
            });
          }
        }
      }
    }
    setDragging(null);
    setDragPreview(null);
    setDragOutside(false);
  }, [dragging, dragPreview, dragOutside, onUpdateTodo, onUnscheduleTodo, rangeDragging, activeTimerIds, date, isOutsideTimeline, onUpdateMoment, parseMomentBlockId]);

  const parseHHMM = (value: string): number | null => {
    const match = value.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    const h = Number(match[1]);
    const m = Number(match[2]);
    if (h < 0 || h > 23 || m < 0 || m > 59) return null;
    return h * 60 + m;
  };

  const applyManualRange = useCallback(() => {
    if (!selectedRange) return;
    const parsedStart = parseHHMM(startInput);
    const parsedEnd = parseHHMM(endInput);
    if (parsedStart == null || parsedEnd == null) return;
    const clampedStart = Math.max(WAKE_TOTAL_MIN, Math.min(parsedStart, END_TOTAL_MIN - 10));
    const clampedEnd = Math.max(clampedStart + 10, Math.min(parsedEnd, END_TOTAL_MIN));
    setCustomRange({ startMin: clampedStart, endMin: clampedEnd });
    const nextSlots = new Set<SlotKey>();
    allSlots.forEach(slot => {
      const overlaps = slot.startMin < clampedEnd && slot.endMin > clampedStart;
      if (overlaps) nextSlots.add(slot.key);
    });
    setSelectedSlots(nextSlots);
  }, [selectedRange, startInput, endInput, allSlots]);

  const handleSaveBlockTime = useCallback((blockId: string) => {
    const parsedStart = parseHHMM(editingTimeStart);
    const parsedEnd = parseHHMM(editingTimeEnd);
    if (parsedStart == null || parsedEnd == null || parsedEnd <= parsedStart) {
      setEditingTimeBlockId(null);
      return;
    }
    const d = date || new Date().toISOString().slice(0, 10);
    const startISO = localMinuteToISOString(d, parsedStart);
    const endISO = localMinuteToISOString(d, parsedEnd);
    const momentId = parseMomentBlockId(blockId);
    if (momentId) {
      // Moments only have an actual span — write it to the timer fields.
      onUpdateMoment?.(momentId, {
        timer_started_at: startISO,
        timer_ended_at: endISO,
        timer_seconds: Math.max(0, (parsedEnd - parsedStart) * 60),
      } as Partial<Moment>);
      setEditingTimeBlockId(null);
      return;
    }
    // A completed block's visible extent is its ACTUAL (timer) span, not the
    // plan. If we only rewrote the plan here, a runaway/over-long actual would
    // keep the block tall no matter what the user typed. So for a completed todo
    // that has a real timer span, rewrite the timer fields too — collapsing the
    // block to exactly the range the user entered.
    const todo = todos.find(t => t.id === blockId);
    const patch: Partial<Todo> = { plan_started_at: startISO, plan_ended_at: endISO };
    if (todo?.is_completed && todo.timer_started_at) {
      patch.timer_started_at = startISO;
      patch.timer_ended_at = endISO;
      patch.timer_seconds = Math.max(0, (parsedEnd - parsedStart) * 60);
    }
    onUpdateTodo(blockId, patch);
    setEditingTimeBlockId(null);
  }, [editingTimeStart, editingTimeEnd, date, onUpdateTodo, onUpdateMoment, parseMomentBlockId, todos]);

  const handleRestToggle = useCallback(() => {
    if (restStartMin !== null) {
      const endMin = Math.max(restStartMin + 5, nowMin);
      setRestBlocks(prev => [...prev, { id: `rest-${Date.now()}`, startMin: restStartMin, endMin }]);
      setRestStartMin(null);
      // Ending the rest break resumes every timer the break paused.
      onRestEnd?.();
    } else {
      setRestStartMin(nowMin);
      // Starting a rest break pauses every running task timer at once — the rest
      // window IS the pause. Owned by PlanView (it holds the pause state).
      onRestStart?.();
    }
  }, [restStartMin, nowMin, onRestStart, onRestEnd, setRestBlocks, setRestStartMin]);

  const handleSaveActualTime = useCallback((blockId: string) => {
    const parsedStart = parseHHMM(editingActualStart);
    const parsedEnd = parseHHMM(editingActualEnd);
    if (parsedStart == null || parsedEnd == null || parsedEnd <= parsedStart) {
      setEditingActualBlockId(null);
      return;
    }
    const d = date || new Date().toISOString().slice(0, 10);
    const startISO = localMinuteToISOString(d, parsedStart);
    const endISO = localMinuteToISOString(d, parsedEnd);
    const diffSec = Math.max(0, (parsedEnd - parsedStart) * 60);
    // 在 Actual 模式下手动录入只补记实际时间；完成状态由 list 手动决定。
    onUpdateTodo(blockId, { timer_started_at: startISO, timer_ended_at: endISO, timer_seconds: diffSec });
    setEditingActualBlockId(null);
  }, [editingActualStart, editingActualEnd, date, onUpdateTodo]);

  const handleEdgeDragStart = useCallback((edge: 'top' | 'bottom', e: React.MouseEvent) => {
    if (!selectedRange) return;
    e.preventDefault();
    e.stopPropagation();
    setEdgeDragging(edge);
    edgeDragStartY.current = e.clientY;
    edgeDragOrigRange.current = { ...selectedRange };
  }, [selectedRange]);

  const handleEdgeDragMove = useCallback((e: MouseEvent) => {
    if (!edgeDragging || !edgeDragOrigRange.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const yInScrollable = e.clientY - rect.top + containerRef.current.scrollTop;
    const currentMin = yToMin(yInScrollable);
    const base = edgeDragOrigRange.current;
    let newStartMin = base.startMin;
    let newEndMin = base.endMin;
    if (edgeDragging === 'top') {
      newStartMin = Math.max(WAKE_TOTAL_MIN, Math.min(snapMinute(currentMin), base.endMin - MIN_BLOCK_MIN));
    } else {
      newEndMin = Math.min(END_TOTAL_MIN, Math.max(snapMinute(currentMin), base.startMin + MIN_BLOCK_MIN));
    }
    setCustomRange({ startMin: newStartMin, endMin: newEndMin });
    const nextSlots = new Set<SlotKey>();
    allSlots.forEach(slot => {
      const overlaps = slot.startMin < newEndMin && slot.endMin > newStartMin;
      if (overlaps) nextSlots.add(slot.key);
    });
    setSelectedSlots(nextSlots);
  }, [edgeDragging, allSlots, yToMin]);

  const handleEdgeDragEnd = useCallback(() => {
    setEdgeDragging(null);
    edgeDragOrigRange.current = null;
  }, []);

  useEffect(() => {
    if (!edgeDragging) return;
    window.addEventListener('mousemove', handleEdgeDragMove);
    window.addEventListener('mouseup', handleEdgeDragEnd);
    return () => {
      window.removeEventListener('mousemove', handleEdgeDragMove);
      window.removeEventListener('mouseup', handleEdgeDragEnd);
    };
  }, [edgeDragging, handleEdgeDragMove, handleEdgeDragEnd]);

  useEffect(() => {
    const handleDragStart = (event: Event) => {
      const customEvent = event as CustomEvent<{ title?: string }>;
      setDragTaskTitle(customEvent.detail?.title || null);
    };
    const handleDragEnd = () => {
      setDragTaskTitle(null);
      setDropIndicatorMin(null);
    };
    window.addEventListener('plan-task-drag-start', handleDragStart as EventListener);
    window.addEventListener('plan-task-drag-end', handleDragEnd);
    return () => {
      window.removeEventListener('plan-task-drag-start', handleDragStart as EventListener);
      window.removeEventListener('plan-task-drag-end', handleDragEnd);
    };
  }, []);

  // Auto-stop rest when a timer starts
  useEffect(() => {
    const handler = () => {
      try {
        const stored = localStorage.getItem(`${restKey}_start`);
        if (stored === null) return;
        const startMin = parseInt(stored, 10);
        if (isNaN(startMin)) return;
        const now = new Date();
        const endMin = Math.max(startMin + 1, now.getHours() * 60 + now.getMinutes());
        setRestBlocks(prev => [...prev, { id: `rest-${Date.now()}`, startMin, endMin }]);
        setRestStartMin(null);
      } catch {
        // Ignore malformed/stale localStorage data.
      }
    };
    window.addEventListener('eol-timer-started', handler);
    return () => window.removeEventListener('eol-timer-started', handler);
  }, [restKey, setRestBlocks, setRestStartMin]);

  // Global mouse listeners for block dragging (so drag-to-unschedule works outside timeline)
  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => updateDragPreview(e.clientX, e.clientY);
    const onUp = (e: MouseEvent) => handleMouseUp(e.clientX, e.clientY);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragging, handleMouseUp, updateDragPreview]);

  useEffect(() => {
    return () => {
      if (freshDropTimerRef.current) clearTimeout(freshDropTimerRef.current);
    };
  }, []);

  // Handle external drag & drop from the task list
  const handleTimelineDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    const min = clientYToMin(e.clientY);
    const snapped = snapMinute(min);
    // Only update state when the snapped minute actually changes.
    // dragOver fires ~60Hz; mouse moving 1px within the same 15-min slot
    // should not trigger a full PlanTimelineView re-render.
    setDropIndicatorMin(prev => (prev === snapped ? prev : snapped));
    // dataTransfer.getData often returns "" during dragover in Chromium
    // (security restriction — real data only exposed on drop). Skip if empty
    // to avoid clobbering the id captured via the 'plan-task-drag-start' event.
    const todoId = e.dataTransfer.getData('text/plain');
    if (todoId) setDragTaskId(prev => (prev === todoId ? prev : todoId));
  }, [clientYToMin]);

  const handleTimelineDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const todoId = e.dataTransfer.getData('text/plain');
    if (todoId) {
      const todo = todos.find(t => t.id === todoId);
      const duration = getSmartDuration(todo?.title || '', todo?.tags);
      const min = clientYToMin(e.clientY);
      const snapped = snapMinute(min);
      const clamped = Math.max(WAKE_TOTAL_MIN, Math.min(snapped, END_TOTAL_MIN - duration));
      // For elapsed slots (or Actual mode), record actual time but keep the
      // task open. Users may backfill first, then decide completion in list.
      const logActualTime = displayMode === 'actual' || (isViewingToday && clamped < nowMin);
      if (logActualTime) {
        const targetDay = date || format(new Date(), 'yyyy-MM-dd');
        const startISO = localMinuteToISOString(targetDay, clamped);
        const endISO = localMinuteToISOString(targetDay, clamped + duration);
        onUpdateTodo(todoId, {
          timer_started_at: startISO,
          timer_ended_at: endISO,
          timer_seconds: duration * 60,
        });
      } else {
        onDropTodo?.(todoId, clamped);
      }
      setFreshDropId(todoId);
      if (freshDropTimerRef.current) clearTimeout(freshDropTimerRef.current);
      freshDropTimerRef.current = setTimeout(() => setFreshDropId(null), 840);
    }
    setDropIndicatorMin(null);
    setDragTaskId(null);
  }, [clientYToMin, date, displayMode, isViewingToday, nowMin, onDropTodo, onUpdateTodo, todos]);

  const handleTimelineDragLeave = useCallback((e: React.DragEvent) => {
    // Only clear if leaving the container entirely
    const relatedTarget = e.relatedTarget as HTMLElement | null;
    if (!relatedTarget || !e.currentTarget.contains(relatedTarget)) {
      setDropIndicatorMin(null);
      setDragTaskId(null);
    }
  }, []);

  const handleTimelineWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    if (!isViewingToday || e.deltaY >= 0 || !containerRef.current) return;

    const container = containerRef.current;
    const viewportHeight = container.clientHeight || 0;
    const nowAnchorScroll = Math.max(0, minToY(nowMin) - viewportHeight * NOW_VIEWPORT_ANCHOR);
    const resistanceBand = 180;
    const resistanceStart = nowAnchorScroll + resistanceBand;

    // Only add resistance when scrolling upward into / across the "now" area.
    if (container.scrollTop > resistanceStart) return;

    e.preventDefault();

    const distanceIntoBand = Math.max(0, resistanceStart - container.scrollTop);
    const t = Math.min(1, distanceIntoBand / resistanceBand);
    const resistance = container.scrollTop <= nowAnchorScroll
      ? 0.24
      : 0.7 - 0.38 * t;

    container.scrollTop += e.deltaY * resistance;
  }, [isViewingToday, minToY, nowMin]);

  const removeBlockFromTimeline = useCallback((block: TimeBlock) => {
    if (block.source === 'moment') {
      const momentId = parseMomentBlockId(block.id);
      if (momentId) onDeleteMoment?.(momentId);
      return;
    }
    if (block.source !== 'todo') return;

    if (displayMode === 'plan') {
      onUpdateTodo(block.id, { plan_started_at: null, plan_ended_at: null });
      return;
    }

    if (displayMode === 'actual') {
      onUpdateTodo(block.id, {
        timer_started_at: null,
        timer_ended_at: null,
        timer_seconds: 0,
        is_completed: false,
      });
      return;
    }

    onUpdateTodo(block.id, {
      plan_started_at: null,
      plan_ended_at: null,
      timer_started_at: null,
      timer_ended_at: null,
      timer_seconds: 0,
      is_completed: false,
    });
  }, [displayMode, onUpdateTodo, onDeleteMoment, parseMomentBlockId]);

  // Rename either a todo block or a moment block, routing to the right hook.
  const renameBlock = useCallback((block: TimeBlock, title: string) => {
    const trimmed = title.trim();
    if (!trimmed || trimmed === block.title) return;
    const momentId = parseMomentBlockId(block.id);
    if (momentId) {
      onUpdateMoment?.(momentId, { text: trimmed } as Partial<Moment>);
      return;
    }
    onRenameTodo?.(block.id, trimmed);
  }, [onRenameTodo, onUpdateMoment, parseMomentBlockId]);

  const renderBlock = (block: TimeBlock, col: number, totalCols: number, visibleCols: number, hiddenSiblingIds: string[], tailRowIndex: number) => {
    const isDraggingThis = dragging?.id === block.id;
    const isImported = block.source === 'imported';
    const isMoment = block.source === 'moment';
    const isTodo = block.source === 'todo';
    // Tail blocks are the post-midnight portion of a previous-day session and
    // carry a synthesized id `tail-<parentId>`. For active-timer / live-badge /
    // parent-todo lookups we resolve back to the original parent id so a timer
    // that started yesterday and is still running lights up on today's tail
    // block too (not just yesterday's head).
    const parentTimerId = block.continuedFromPrevDay && block.id.startsWith('tail-')
      ? block.id.slice(5)
      : block.id;
    const isTimerActive = isTodo && activeTimerIds?.has(parentTimerId);
    const blockTodoForTimer = isTodo ? todos.find(td => td.id === parentTimerId) : undefined;
    const showResumeTimerTitle = Boolean(
      blockTodoForTimer &&
      !block.isCompleted &&
      !isTimerActive &&
      (blockTodoForTimer.timer_seconds || 0) > 0 &&
      blockTodoForTimer.timer_ended_at &&
      !blockTodoForTimer.timer_started_at &&
      (blockTodoForTimer.progress ?? 0) > 0 &&
      (blockTodoForTimer.progress ?? 0) < 100
    );
    const canResumeFromHistory = Boolean(
      onStartTimer &&
      blockTodoForTimer &&
      !block.isCompleted &&
      !isTimerActive &&
      (blockTodoForTimer.timer_seconds || 0) > 0 &&
      blockTodoForTimer.timer_ended_at &&
      !blockTodoForTimer.timer_started_at
    );
    const isResumeBlockSelected = selectedResumeBlockId === block.id;
    const blockCoversNow =
      isViewingToday &&
      !block.readOnly &&
      !block.isCompleted &&
      block.startMin <= nowMin &&
      block.endMin > nowMin;
    const keepActionsVisible = isResumeBlockSelected || !!isTimerActive || blockCoversNow;
    const editTarget = getBlockEditTarget(block, displayMode, !!isTimerActive);
    const isEditable = !isImported && !block.readOnly && (isMoment ? !!onUpdateMoment : !!editTarget);
    const isEditingThis = editingBlockId === block.id;
    const tagIcon = getTagIcon(block.tags, block.title);
    const workType = block.source === 'imported'
      ? null
      : getWorkType({
          entity: block.source,
          id: block.id,
          title: block.title,
          tags: block.tags,
        });
    const tagColor = getThemedTagColor(block.tags, block.title);
    const workTypeColor = workType ? WORK_TYPE_META[workType]?.color : undefined;
    const accentPaint = tagColor || workTypeColor || (isImported ? '#8B91A8' : 'hsl(var(--primary))');
    const blockColor = accentPaint;
    /** Solid paint for fills — grid lines stay under blocks */
    const canvasBg = timelineCanvasBg;
    /** Dark: cooler elevated graphite base; warm card tokens made orange tasks turn muddy. */
    const blockFillBase = isDarkMode ? 'hsl(240 5% 15%)' : canvasBg;
    const fillGradVariant = isDarkMode ? ('darkTint' as const) : ('default' as const);
    const shellFor = (intensity: 'plan' | 'actual' | 'active' | 'done' | 'ghost') =>
      timelineBlockShell(isDarkMode, blockFillBase, accentPaint, intensity);
    const colorWithAlpha = (alpha: number) => {
      if (/^#[0-9A-Fa-f]{6}$/.test(accentPaint)) return `${accentPaint}${Math.round(alpha * 255).toString(16).padStart(2, '0')}`;
      const cssVar = isImported ? '--accent' : '--primary';
      return `hsl(var(${cssVar}) / ${alpha})`;
    };
    const activeColorWithAlpha = (alpha: number) => colorWithAlpha(alpha);
    /** Surface is near-neutral graphite in dark, so the left bar carries the
     * colour identity — keep it bright rather than dimming it. */
    const edgeAlpha = (a: number) => (isDarkMode ? Math.min(1, a * 1.15) : a * 1.08);
    const tintedCard = (strength: number) =>
      /^#[0-9A-Fa-f]{6}$/.test(accentPaint)
        ? `color-mix(in srgb, ${blockFillBase} ${100 - Math.round(strength * 100)}%, ${accentPaint} ${Math.round(strength * 100)}%)`
        : blockFillBase;
    const tintedBorder = (strength: number) =>
      /^#[0-9A-Fa-f]{6}$/.test(accentPaint)
        ? `color-mix(in srgb, hsl(var(--border)) ${100 - Math.round(strength * 100)}%, ${accentPaint} ${Math.round(strength * 100)}%)`
        : `hsl(var(${isImported ? '--accent' : '--primary'}) / 0.35)`;
    const tintedText = (strength: number) =>
      /^#[0-9A-Fa-f]{6}$/.test(accentPaint)
        ? `color-mix(in srgb, hsl(var(--foreground)) ${100 - Math.round(strength * 100)}%, ${accentPaint} ${Math.round(strength * 100)}%)`
        : 'hsl(var(--foreground))';

    // Side-by-side columns for overlapping blocks, capped at MAX_VISIBLE_COLS.
    // Extras (col >= MAX_VISIBLE_COLS) stack behind col N-1 with a small offset
    // so the user sees "there's more underneath"; interaction is via the +N badge.
    const isOverflowCol = col >= MAX_VISIBLE_COLS;
    const visibleCol = Math.min(col, visibleCols - 1);
    const overflowDepth = isOverflowCol ? col - (MAX_VISIBLE_COLS - 1) : 0;
    const widthPct = 100 / visibleCols;
    const leftPct = visibleCol * widthPct;
    const gap = visibleCols > 1 ? 6 : 0;
    const timelineWidthPx = containerRef.current?.clientWidth ?? 0;
    const blockWidthPx = timelineWidthPx > 0 ? (timelineWidthPx * widthPct) / 100 - gap : 0;
    const hasHiddenSiblings = hiddenSiblingIds.length > 0;
    const hiddenBadgeBg = isDarkMode ? 'hsl(210 15% 88%)' : 'hsl(220 15% 25%)';
    const hiddenBadgeFg = isDarkMode ? 'hsl(220 20% 12%)' : 'hsl(0 0% 100%)';
    const hiddenBadgeTitle = hasHiddenSiblings
      ? (lang === 'zh' ? '同段还有：' : 'Also overlapping: ') +
        hiddenSiblingIds
          .map(id => blockTitleById.get(id) || id)
          .join(' / ')
      : undefined;
    const sessionContinuation = sessionContinuationMap.get(block.id);
    const continuationLabel = sessionContinuation
      ? `${formatGapMinutesLabel(sessionContinuation.gapMin)} · ${lang === 'zh' ? '间隔' : 'gap'} ↓`
      : '';

    // Plan/Actual logic for todo blocks
    const hasPlan = isTodo && block.planStartMin != null;
    const hasActual = isTodo && block.hasActual;
    const isPlanOnly = hasPlan && !hasActual;

    // Live activity must always be visible: a task you're recording right now
    // shouldn't vanish from the timeline just because you're in Plan view.
    if (isTodo && displayMode === 'plan' && !hasPlan && !isTimerActive) {
      return null;
    }

    // For plan-only (no actual started), use plan range for the block
    const planStart = isDraggingThis && dragging?.target === 'plan' && dragPreview
      ? dragPreview.startMin
      : (block.planStartMin ?? block.startMin);
    const planEnd = isDraggingThis && dragging?.target === 'plan' && dragPreview
      ? dragPreview.endMin
      : (block.planEndMin ?? block.endMin);
    const actualStart = isDraggingThis && dragging?.target === 'actual' && dragPreview
      ? dragPreview.startMin
      : (block.actualStartMin ?? block.startMin);
    // While a timer is running the activity is happening *right now*, so the live
    // actual block should always reach the "now" line — never leave a gap below it.
    // We extend to whichever is later: the accumulated focused minutes, or the
    // current wall-clock moment (when viewing today).
    const liveActualEnd = isTimerActive
      ? Math.max(
          actualStart + (getTimerElapsed ? Math.max(1, Math.ceil(getTimerElapsed(parentTimerId) / 60)) : 1),
          isViewingToday ? nowPreciseMin : 0,
        )
      : null;
    const baseActualEnd = isDraggingThis && dragging?.target === 'actual' && dragPreview
      ? dragPreview.endMin
      : (block.actualEndMin ?? block.endMin);
    const actualEnd = Math.max(baseActualEnd, liveActualEnd ?? 0);
    const overlapStart = Math.max(planStart, actualStart);
    const overlapEnd = Math.min(planEnd, actualEnd);
    const overlapLen = Math.max(0, overlapEnd - overlapStart);
    const actualLen = Math.max(1, actualEnd - actualStart);
    const overlapRatio = overlapLen / actualLen;
    const planDurationForChrome = Math.max(1, planEnd - planStart);

    // When plan and actual are nearly identical, we still keep the planned frame visible
    // so "Both" mode remains structurally consistent. Only the extra planned label/connector
    // logic should quiet down in that case.
    const planActualIdentical = hasPlan && hasActual
      && Math.abs((block.planStartMin ?? 0) - (block.actualStartMin ?? 0)) <= 2
      && Math.abs((block.planEndMin ?? 0) - actualEnd) <= 2;
    const showBothMiniState = displayMode === 'both' && hasPlan && hasActual && !planActualIdentical && overlapRatio < 0.72;

    // How far the actual START drifted from the planned start (minutes).
    // Positive = started later than planned, negative = earlier. This is the
    // single most legible "did I follow my plan?" signal, so we surface it as a
    // small labeled chip on the actual block in Both mode.
    const startDeltaMin = hasPlan && hasActual
      ? Math.round((block.actualStartMin ?? 0) - (block.planStartMin ?? 0))
      : 0;
    const fmtDelta = (mins: number) => {
      const a = Math.abs(mins);
      const h = Math.floor(a / 60);
      const m = a % 60;
      return h > 0 ? (m > 0 ? `${h}h${m}m` : `${h}h`) : `${m}m`;
    };
    const showDeviationChip = displayMode === 'both' && hasPlan && hasActual
      && !planActualIdentical && Math.abs(startDeltaMin) >= 5;

    // Determine what to render based on display mode
    const showPlan = hasPlan && (displayMode === 'plan' || displayMode === 'both');
    // A plan-less task that's actively timing still shows its live actual block,
    // even in Plan view — otherwise "what I'm doing now" disappears.
    const showActual = hasActual && (displayMode === 'actual' || displayMode === 'both' || (isTimerActive && !hasPlan));

    // The outer container uses the widest range visible
    let visibleStart = block.startMin;
    let visibleEnd = block.endMin;
    if (displayMode === 'plan' && hasPlan) { visibleStart = planStart; visibleEnd = planEnd; }
    else if (displayMode === 'actual' && hasActual) { visibleStart = actualStart; visibleEnd = actualEnd; }
    else if (displayMode === 'both' && editTarget === 'plan' && !hasActual) { visibleStart = planStart; visibleEnd = planEnd; }
    else if (displayMode === 'both' && editTarget === 'actual' && !hasPlan) { visibleStart = actualStart; visibleEnd = actualEnd; }

    const clampedStart = Math.max(visibleStart, axisStartMin);
    const clampedEnd = Math.min(visibleEnd, END_TOTAL_MIN);
    const rawTop = minToY(clampedStart);
    const rawHeight = Math.max(minToY(clampedEnd) - rawTop, 1);
    /** Keep plan/actual strip heights close to timeline scale (~20m ≈ px) instead of forcing 20px+ */
    const MIN_PLAN_ACT_BOX_PX = 12;
    const planSegH = Math.max(
      minToY(Math.min(planEnd, END_TOTAL_MIN)) - minToY(Math.max(planStart, axisStartMin)),
      MIN_PLAN_ACT_BOX_PX,
    );
    const actSegH = Math.max(
      minToY(Math.min(actualEnd, END_TOTAL_MIN)) - minToY(Math.max(actualStart, axisStartMin)),
      MIN_PLAN_ACT_BOX_PX,
    );
    /** Todo outer shell was min 40px + thick handles; keep short tasks closer to true timeline height */
    const outerMinH = isTodo ? (isEditable ? 23 : 22) : 28;
    const height = Math.max(rawHeight, outerMinH);
    const shouldAnchorCompletedActualToEnd =
      block.isCompleted &&
      hasActual &&
      !isTimerActive &&
      actualEnd <= nowPreciseMin + 0.75 &&
      (displayMode === 'actual' || (displayMode === 'both' && (!hasPlan || visibleEnd <= actualEnd + 0.75)));
    const rawFinalTop = shouldAnchorCompletedActualToEnd && height > rawHeight
      ? Math.max(0, rawTop - (height - rawHeight))
      : rawTop;
    // Prev-day tails now flow through the same column packer as everything else
    // (see assignColumns), so tailRowIndex is 0 and this offset is inert — kept
    // only so a future per-row tail treatment has a single place to hook in.
    const TAIL_ROW_PX = 30;
    const tailStackOffset = block.continuedFromPrevDay ? tailRowIndex * TAIL_ROW_PX : 0;
    const top = rawFinalTop + tailStackOffset;
    const tallNarrowLayout = blockWidthPx > 0 && blockWidthPx < 145 && height > 120;
    const compactLayout = height < 64 || (blockWidthPx > 0 && blockWidthPx < 170);
    const veryCompactLayout = height < 42 || (blockWidthPx > 0 && blockWidthPx < 120);
    /** Plan dashed top+bottom stripes fight text in squat Both-mode blocks — use single inset outline */
    const slimBothQuietPlanStripe =
      displayMode === 'both' &&
      hasPlan &&
      hasActual &&
      height <= SLIM_BOTH_OUTER_PX &&
      overlapLen >= planDurationForChrome * 0.78;
    const ultraShortOuter = height <= ULTRA_SHORT_OUTER_PX;
    const narrowLayout = blockWidthPx > 0 && blockWidthPx < 150;
    const ultraNarrowLayout = blockWidthPx > 0 && blockWidthPx < 105;
    const largeBlockLayout = !compactLayout && blockWidthPx >= 185 && height >= 110;
    const extraLargeBlockLayout = !compactLayout && blockWidthPx >= 215 && height >= 150;
    const suppressLeadingMeta = narrowLayout || ultraNarrowLayout || blockWidthPx < 175;
    const microLayout = height < 34 || blockWidthPx < 95;
    const slimBarLayout = height < 38 && blockWidthPx >= 120;
    /** Too narrow for any readable title (would render as "U…"); show only color bar + emoji + duration, title on hover */
    const hideTitleTooNarrow = blockWidthPx > 0 && blockWidthPx < 64;
    const titleFontSizePx = microLayout
      ? 11
      : narrowLayout
        ? 13
        : compactLayout
          ? 15
          : extraLargeBlockLayout
            ? 18
            : largeBlockLayout
              ? 17
              : 16;
    const titleFontSize = `${Math.min(titleFontSizePx, MAX_TIMELINE_TITLE_FONT_PX)}px`;
    const timeFontSize = microLayout
      ? '8px'
      : compactLayout
        ? '11px'
        : extraLargeBlockLayout
          ? '14px'
          : largeBlockLayout
            ? '13px'
            : '12px';
    const pillFontSize = microLayout
      ? '7px'
      : extraLargeBlockLayout
        ? '9px'
        : largeBlockLayout
          ? '8px'
          : '8px';
    /** When plan dashed sits on actual fill, keep interior transparent */
    const planOpaqueBackdrop =
      !(displayMode === 'both' && showPlan && showActual && hasPlan && hasActual);
    const liveGlow = isTimerActive
      ? `0 0 0 1px ${colorWithAlpha(0.16)}, 0 0 0 3px ${colorWithAlpha(0.06)}`
      : undefined;
    const editingGlow = isEditingThis
      ? `0 0 0 1px ${colorWithAlpha(0.22)}, 0 0 0 3px ${colorWithAlpha(0.1)}`
      : undefined;

    // Calculate actual fill percentage (only when timer is active)
    let actualFillPct = 0;
    if (block.isCompleted) {
      actualFillPct = 100;
    } else if (isTimerActive && hasActual) {
      // Use the pause-aware elapsed seconds from PlanView (getCurrentSessionElapsed),
      // not wall-clock minutes, so the fill freezes during rest and resumes after.
      // Falls back to wall-clock if no getTimerElapsed was supplied (shouldn't happen for active timers).
      const elapsedSec = getTimerElapsed ? getTimerElapsed(parentTimerId) : Math.max(0, ((nowMin + nowSec / 60) - actualStart) * 60);
      const elapsedInBlock = Math.max(0, elapsedSec / 60);
      const blockDuration = actualEnd - actualStart;
      actualFillPct = blockDuration > 0 ? Math.min(100, (elapsedInBlock / blockDuration) * 100) : 0;
    }

    // For non-todo blocks, keep original behavior
    if (!isTodo) {
      const isFocusSession = !!block.tags?.includes('focus-session');
      const effectiveStart = block.startMin;
      const effectiveEnd = block.endMin;
      const fillPct = block.isCompleted ? 100 : (nowMin > effectiveStart ? Math.min(100, ((Math.min(nowMin, effectiveEnd) - effectiveStart) / (effectiveEnd - effectiveStart)) * 100) : 0);
      const isInProgress = !block.isCompleted && fillPct > 0 && fillPct < 100;
      const isFuture = !block.isCompleted && fillPct === 0;
      const compactSessionLayout = isFocusSession || height <= 44;
      const eventShell = shellFor((block.isCompleted || isFocusSession) ? 'done' : isFuture ? 'ghost' : 'actual');
      return (
        <div
          key={block.id}
          data-plan-block="true"
          title={hideTitleTooNarrow ? block.title : undefined}
          className={cn(
            "absolute overflow-hidden transition-shadow group/block",
            block.photos?.length ? "cursor-zoom-in" : "cursor-default",
            block.continuedFromPrevDay && "opacity-80"
          )}
          onClick={(e) => {
            if (!block.photos?.length) return;
            e.stopPropagation();
            setPhotoLightbox({ photos: block.photos, index: 0 });
          }}
          style={{
            top, height,
            left: `calc(${leftPct}% + ${gap / 2}px)`,
            width: `calc(${widthPct}% - ${gap}px)`,
            zIndex: isOverflowCol ? 5 : 20 + visibleCol,
            transform: overflowDepth > 0 ? `translateX(${overflowDepth * 4}px)` : undefined,
            opacity: isOverflowCol ? 0.28 : undefined,
            pointerEvents: isOverflowCol ? 'none' : undefined,
            borderRadius: `${BLOCK_CORNER_PX}px`,
            background: eventShell.background,
            borderLeft: `${isDarkMode ? 2 : 3}px solid ${(block.isCompleted || isFocusSession) ? colorWithAlpha(edgeAlpha(0.34)) : isFuture ? colorWithAlpha(edgeAlpha(0.18)) : colorWithAlpha(edgeAlpha(0.38))}`,
            boxShadow: eventShell.shadow,
          }}
        >
          {sessionContinuation && (
            <div
              className="absolute left-1/2 top-full z-[5] -translate-x-1/2 pointer-events-none flex flex-col items-center"
              style={{ height: sessionContinuation.downHeight, width: 48 }}
            >
              <div className="absolute left-1/2 top-0 h-full -translate-x-1/2 border-l border-dashed" style={{ borderColor: colorWithAlpha(0.34) }} />
              {sessionContinuation.downHeight >= 18 && (
                <div className="absolute left-1/2 top-1/2 z-[1] -translate-x-1/2 -translate-y-1/2">
                  <TimelineIntervalPill isDarkMode={isDarkMode}>
                    {continuationLabel}
                  </TimelineIntervalPill>
                </div>
              )}
            </div>
          )}
          {isInProgress && <div className="absolute top-0 left-0 right-0 pointer-events-none transition-all duration-1000" style={{ height: `${fillPct}%`, backgroundColor: tintedCard(isDarkMode ? 0.1 : 0.075), borderRadius: `${BLOCK_CORNER_PX}px ${BLOCK_CORNER_PX}px 0 0` }} />}
          {compactSessionLayout ? (
            <div className="absolute inset-0 z-10 flex items-center px-3">
              <div className="flex min-w-0 w-full items-center gap-2">
                {block.photos?.[0] && (
                  <img
                    src={block.photos[0]}
                    alt=""
                    className="h-5 w-5 flex-shrink-0 rounded-md border border-background/70 object-cover shadow-sm"
                  />
                )}
                {(block.emoji || tagIcon) && (
                  <span className="flex-shrink-0 leading-none" style={{ fontSize: '13px' }}>
                    {block.emoji || tagIcon}
                  </span>
                )}
                {hideTitleTooNarrow ? (
                  <span className="min-w-0 flex-1" />
                ) : (
                  <span
                    className="min-w-0 flex-1 truncate leading-none"
                    style={{ fontSize: '12px', fontWeight: 500, color: isDarkMode ? 'hsl(0 0% 100% / 0.95)' : 'hsl(var(--foreground))' }}
                  >
                    {block.title}
                  </span>
                )}
                <span
                  className="flex-shrink-0 font-mono tabular-nums leading-none text-muted-foreground/70"
                  style={{ fontSize: '10px' }}
                >
                  {Math.max(1, effectiveEnd - effectiveStart)}m
                </span>
              </div>
            </div>
          ) : (
            <div className="px-2.5 py-1.5 relative z-10">
              <div className="flex items-center gap-1.5 min-w-0">
                {block.photos?.[0] && (
                  <img
                    src={block.photos[0]}
                    alt=""
                    className="h-7 w-7 flex-shrink-0 rounded-lg border border-background/70 object-cover shadow-sm"
                  />
                )}
                {(block.emoji || tagIcon) && <span className="flex-shrink-0" style={{ fontSize: '15px' }}>{block.emoji || tagIcon}</span>}
                {!hideTitleTooNarrow && <span className="truncate" style={{ fontSize: '15px', fontWeight: 600, color: isDarkMode ? 'hsl(0 0% 100% / 0.95)' : 'hsl(var(--foreground))', textShadow: isDarkMode ? '0 1px 1.5px rgba(0,0,0,0.30)' : undefined }}>{block.title}</span>}
              </div>
              {height > 34 && (
                <div className="flex items-center gap-1 mt-0.5">
                  <span className="font-mono tabular-nums text-muted-foreground/70" style={{ fontSize: '12px' }}>{Math.max(1, effectiveEnd - effectiveStart)}m</span>
                </div>
              )}
            </div>
          )}
          {hasHiddenSiblings && (
            <div
              className="absolute top-1 right-1 z-30 flex items-center justify-center rounded-full leading-none font-medium tabular-nums select-none pointer-events-auto"
              style={{
                minWidth: 20,
                padding: '2px 6px',
                fontSize: 10,
                background: hiddenBadgeBg,
                color: hiddenBadgeFg,
              }}
              title={hiddenBadgeTitle}
            >
              +{hiddenSiblingIds.length}
            </div>
          )}
        </div>
      );
    }

    // ── Todo block: Plan (dashed) + Actual (solid fill) ──
    return (
      <div
        key={block.id}
        data-plan-block="true"
        title={hideTitleTooNarrow ? block.title : undefined}
        className={cn(
          "absolute overflow-visible transition-shadow group/block",
          isEditable ? "cursor-grab" : "cursor-default",
          block.continuedFromPrevDay && "opacity-80",
          isDraggingThis && !dragOutside && "shadow-lg ring-2 ring-primary/40 z-30 opacity-60",
          isDraggingThis && dragOutside && "shadow-lg ring-2 ring-destructive/40 z-30 opacity-30 scale-95 transition-transform",
          isEditingThis && "z-30",
          freshDropId === block.id && "plan-block-fresh-drop",
        )}
        style={{
          top, height,
          left: `calc(${leftPct}% + ${gap / 2}px)`,
          width: `calc(${widthPct}% - ${gap}px)`,
          zIndex: isDraggingThis ? 30 : isEditingThis ? 35 : isOverflowCol ? 5 : ((isPlanOnly ? 10 : 20) + visibleCol),
          transform: overflowDepth > 0 && !isDraggingThis && !isEditingThis ? `translateX(${overflowDepth * 4}px)` : undefined,
          opacity: isOverflowCol && !isDraggingThis ? 0.28 : undefined,
          pointerEvents: isOverflowCol ? 'none' : undefined,
        }}
        onMouseDown={isEditable && !isEditingThis ? (e) => handleMouseDown(e, block, 'move') : undefined}
        onClick={(e) => {
          if (justDraggedRef.current || isEditingThis) return;
          const target = e.target as HTMLElement;
          if (target.closest('[data-block-action="true"]')) return;
          setSelectedResumeBlockId(prev => (prev === block.id ? null : block.id));
        }}
      >
        {freshDropId === block.id && (
          <SparkleBurst
            seed={`drop-${block.id}`}
            count={18}
            color={colorWithAlpha(0.95)}
            oneShot
          />
        )}
        {sessionContinuation && (
          <div
            className="absolute left-1/2 top-full z-[5] -translate-x-1/2 pointer-events-none flex flex-col items-center"
            style={{ height: sessionContinuation.downHeight, width: 48 }}
          >
            <div className="absolute left-1/2 top-0 h-full -translate-x-1/2 border-l border-dashed" style={{ borderColor: colorWithAlpha(0.34) }} />
            {sessionContinuation.downHeight >= 18 && (
              <div className="absolute left-1/2 top-1/2 z-[1] -translate-x-1/2 -translate-y-1/2">
                <TimelineIntervalPill isDarkMode={isDarkMode}>
                  {continuationLabel}
                </TimelineIntervalPill>
              </div>
            )}
          </div>
        )}
        <div
          className="relative h-full overflow-hidden pointer-events-auto"
          style={{
            borderRadius: `${BLOCK_CORNER_PX}px`,
            backgroundColor: 'transparent',
            boxShadow: 'none',
          }}
        >
          {/* Step work-sessions as sub-segments inside the parent block. Each
              session sits at its real wall-clock position; simultaneous sessions
              share the block width side-by-side (col / totalCols). They carry the
              parent's colour so the block reads as one task detailed into its
              real work moments. Sits above the fill, below the title/labels. */}
          {block.stepSegments && block.stepSegments.length > 0 && (
            <div className="absolute inset-0 z-[2] pointer-events-none">
              {block.stepSegments.map(seg => {
                const segTop = minToY(Math.max(seg.startMin, axisStartMin)) - top;
                const segH = Math.max(minToY(Math.min(seg.endMin, END_TOTAL_MIN)) - minToY(Math.max(seg.startMin, axisStartMin)), 9);
                const segGap = seg.totalCols > 1 ? 4 : 0;
                const segWidthPct = 100 / seg.totalCols;
                const segLeftPct = seg.col * segWidthPct;
                const durMin = seg.endMin - seg.startMin;
                return (
                  <div
                    key={seg.id}
                    className="absolute rounded-[6px] overflow-hidden"
                    style={{
                      top: segTop,
                      height: segH,
                      left: `calc(${segLeftPct}% + ${segGap / 2}px)`,
                      width: `calc(${segWidthPct}% - ${segGap}px)`,
                      background: colorWithAlpha(isDarkMode ? 0.42 : 0.28),
                      boxShadow: `inset 0 0 0 1px ${colorWithAlpha(isDarkMode ? 0.62 : 0.46)}`,
                    }}
                    title={`${seg.title} · ${fmtDelta(durMin)}`}
                  />
                );
              })}
            </div>
          )}
          {displayMode === 'both' && showPlan && showActual && (() => {
          const overlapMinutes = Math.max(0, Math.min(planEnd, actualEnd) - Math.max(planStart, actualStart));
          if (overlapMinutes > 0) return null;

          const planTop = minToY(Math.max(planStart, axisStartMin)) - top;
          const planHeight = planSegH;
          const actTop = minToY(Math.max(actualStart, axisStartMin)) - top;
          const actHeight = actSegH;
          const planBottom = planTop + planHeight;
          const actBottom = actTop + actHeight;
          const directionDown = actTop >= planBottom;
          const lineStartY = directionDown ? planBottom : actBottom;
          const lineEndY = directionDown ? actTop : planTop;
          const gapBetween = Math.abs(lineEndY - lineStartY);

          if (gapBetween < 18) return null;

          const lineTop = Math.min(lineStartY, lineEndY);
          const lineHeight = gapBetween;
          const arrowY = directionDown ? lineHeight - 1 : 1;
          const arrowRotation = directionDown ? 180 : 0;

          return (
            <div
              className="absolute left-1/2 -translate-x-1/2 pointer-events-none z-[1]"
              style={{ top: lineTop, height: lineHeight, width: 18 }}
            >
              <svg width="18" height={lineHeight} viewBox={`0 0 18 ${lineHeight}`} className="overflow-visible">
                <line
                  x1="9"
                  y1="3"
                  x2="9"
                  y2={Math.max(3, lineHeight - 3)}
                  stroke={colorWithAlpha(0.42)}
                  strokeWidth="1.5"
                  strokeDasharray="2 3"
                  strokeLinecap="round"
                />
                <path
                  d="M9 0 L13 6 L5 6 Z"
                  fill={colorWithAlpha(0.55)}
                  transform={`translate(0 ${arrowY - 6}) rotate(${arrowRotation} 9 3)`}
                />
              </svg>
            </div>
          );
        })()}

        {/* Plan box (dashed) — empty until the task has actual timer evidence. */}
        {showPlan && (() => {
          const planTop = minToY(Math.max(planStart, axisStartMin)) - top;
          const planHeight = planSegH;
          const showPlanMiniLabel = false;
          // Stronger dash on "both" (so the planned boundary reads through the
          // solid actual fill) and on plan-only (so an empty outline doesn't
          // disappear against the canvas).
          const hollowPlanFrame = !showActual;
          // Redesign: planning should read clearly in dark mode.
          // Use a calmer blue-violet outline + slightly denser dash rhythm.
          const plannedStrokeColor = isDarkMode
            ? 'hsl(230 38% 68% / 0.72)'
            : 'hsl(230 30% 52% / 0.64)';
          // Plan-only completion (marked done via checkbox, no timer ran): render
          // with a subtle tinted fill + solid clean border instead of the hesitant
          // dashed hollow. This differentiates "done" from "still planned" without
          // adding chrome. Only applies when there's no actual segment to speak
          // for the block already.
          const isCompletedPlanOnly = hollowPlanFrame && !!block.isCompleted && !hasActual;
          const planDashColor = hollowPlanFrame
            ? plannedStrokeColor
            : (isDarkMode ? 'hsl(230 34% 66% / 0.6)' : colorWithAlpha(edgeAlpha(0.34)));
          const planDashWidth = hollowPlanFrame ? (isDarkMode ? 2.25 : 2.35) : (isDarkMode ? 1.5 : 1.6);
          const planDashSegment = hollowPlanFrame ? 13 : 11;
          const planDashGap = hollowPlanFrame ? 6 : 7;
          const planBackdrop = isCompletedPlanOnly
            ? (isDarkMode
                ? `linear-gradient(180deg, ${colorWithAlpha(0.24)} 0%, ${colorWithAlpha(0.18)} 100%)`
                : `linear-gradient(180deg, ${colorWithAlpha(0.16)} 0%, ${colorWithAlpha(0.10)} 100%)`)
            : hollowPlanFrame
              ? (isDarkMode
                  ? 'linear-gradient(180deg, hsl(230 42% 58% / 0.11) 0%, hsl(230 42% 58% / 0.06) 100%)'
                  : 'linear-gradient(180deg, hsl(230 38% 58% / 0.08) 0%, hsl(230 38% 58% / 0.03) 100%)')
              : planOpaqueBackdrop
                ? shellFor('plan').background
                : 'transparent';
          return (
            <div
              className="absolute left-0 right-0 pointer-events-none"
              style={{
                top: planTop,
                height: planHeight,
                borderRadius: `${BLOCK_CORNER_PX}px`,
                background: planBackdrop,
                boxShadow: 'none',
                // Plan dashed frame must render ABOVE the actual solid fill.
                // In dark mode `actual` shell is a fully opaque solid color; when
                // actual fully overlaps plan (e.g. actualStart == planStart and
                // actualEnd extends past planEnd) the dashed plan boundary would
                // otherwise be painted over and invisible.
                zIndex: 2,
              }}
            >
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  borderRadius: `${BLOCK_CORNER_PX}px`,
                  ...(isCompletedPlanOnly
                    ? {
                      border: `1px solid ${colorWithAlpha(isDarkMode ? 0.55 : 0.45)}`,
                      boxSizing: 'border-box',
                    }
                    : slimBothQuietPlanStripe
                    ? {
                      border: `${planDashWidth}px dashed ${planDashColor}`,
                      boxSizing: 'border-box',
                    }
                    : {
                      backgroundImage: [
                        `repeating-linear-gradient(90deg, ${planDashColor} 0 ${planDashSegment}px, transparent ${planDashSegment}px ${planDashSegment + planDashGap}px)`,
                        `repeating-linear-gradient(90deg, ${planDashColor} 0 ${planDashSegment}px, transparent ${planDashSegment}px ${planDashSegment + planDashGap}px)`,
                        `repeating-linear-gradient(180deg, ${planDashColor} 0 ${planDashSegment}px, transparent ${planDashSegment}px ${planDashSegment + planDashGap}px)`,
                        `repeating-linear-gradient(180deg, ${planDashColor} 0 ${planDashSegment}px, transparent ${planDashSegment}px ${planDashSegment + planDashGap}px)`,
                      ].join(', '),
                      backgroundPosition: 'left top, left bottom, left top, right top',
                      backgroundSize: `100% ${planDashWidth}px, 100% ${planDashWidth}px, ${planDashWidth}px 100%, ${planDashWidth}px 100%`,
                      backgroundRepeat: 'no-repeat',
                    }),
                }}
              />
              {showPlanMiniLabel && (
                <div
                  className="absolute left-3 top-3 rounded-full bg-background/90 px-2 py-[2px] font-semibold uppercase tracking-[0.06em] shadow-sm"
                  style={{ fontSize: pillFontSize, color: colorWithAlpha(0.7) }}
                >
                  PLAN
                </div>
              )}
            </div>
          );
        })()}

        {/* Actual box (solid fill) — only when pomodoro has been started */}
        {showActual && (() => {
          const actTop = minToY(Math.max(actualStart, axisStartMin)) - top;
          const actHeight = actSegH;
          const showTitleInActual = false;
          // Suppress mini labels when plan/done bars will render in content (avoids double "done" overlap)
          const willShowPlanActualBars = displayMode === 'both' && hasPlan && hasActual && block.isCompleted && height > 80 && blockWidthPx >= 160;
          const showActualMiniLabel = false;
          const showCompactActualMiniLabel = false;
          const actualShell = shellFor(block.isCompleted ? 'done' : isTimerActive ? 'active' : 'actual');
          const actualBorderColor = isTimerActive
            ? activeColorWithAlpha(0.72)
            : block.isCompleted
              ? colorWithAlpha(edgeAlpha(0.24))
              : colorWithAlpha(edgeAlpha(0.28));
          const actualBorderWidth = isTimerActive ? 4 : isDarkMode ? 2 : 3;
          return (
            <div
              className="absolute left-0 right-0"
              style={{
                top: actTop,
                height: actHeight,
                borderRadius: `${BLOCK_CORNER_PX}px`,
                background: actualShell.background,
                borderLeft: `${actualBorderWidth}px solid ${actualBorderColor}`,
                boxShadow: block.isCompleted
                  ? actualShell.shadow
                  : editingGlow || liveGlow || actualShell.shadow,
              }}
            >
              {/* Actual fill overlay */}
              {actualFillPct > 0 && !block.isCompleted && (
                <div
                  className="absolute top-0 left-0 right-0 pointer-events-none transition-all duration-1000"
                  style={{
                    height: `${actualFillPct}%`,
                    background: timelineFillGradient(isDarkMode, blockFillBase, accentPaint, 0.11, 0.07, 0.045, fillGradVariant),
                    borderRadius: `${BLOCK_CORNER_PX}px ${BLOCK_CORNER_PX}px 0 0`,
                  }}
                />
              )}
              {/* Plan-deviation chip — how far the actual start drifted from plan.
                  The clearest "did I stick to my plan?" signal in Both mode. */}
              {showDeviationChip && actHeight >= 18 && blockWidthPx >= 88 && (
                <div
                  className="absolute right-1 top-1 z-20 flex items-center gap-[2px] rounded-full px-1.5 py-[1px] font-semibold leading-none pointer-events-none whitespace-nowrap"
                  style={{
                    fontSize: extraLargeBlockLayout ? '11px' : '10px',
                    color: colorWithAlpha(isDarkMode ? 0.95 : 0.82),
                    background: isDarkMode ? 'hsl(240 6% 9% / 0.72)' : 'hsl(0 0% 100% / 0.86)',
                    boxShadow: `inset 0 0 0 1px ${colorWithAlpha(0.28)}`,
                    backdropFilter: 'blur(2px)',
                  }}
                  title={lang === 'zh'
                    ? `实际比计划${startDeltaMin > 0 ? '晚' : '早'}开始 ${fmtDelta(startDeltaMin)}`
                    : `Started ${fmtDelta(startDeltaMin)} ${startDeltaMin > 0 ? 'later' : 'earlier'} than planned`}
                >
                  <span style={{ fontSize: '0.95em', lineHeight: 1 }}>{startDeltaMin > 0 ? '↓' : '↑'}</span>
                  {lang === 'zh'
                    ? `${startDeltaMin > 0 ? '晚' : '早'}${fmtDelta(startDeltaMin)}`
                    : `${fmtDelta(startDeltaMin)} ${startDeltaMin > 0 ? 'late' : 'early'}`}
                </div>
              )}
              {isTimerActive && (
                <>
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      borderRadius: `${BLOCK_CORNER_PX}px`,
                    }}
                  />
                </>
              )}
              {/* Show title inside actual block when it's far from plan */}
              {showTitleInActual && actHeight > 20 && (
                <div className="px-2 py-1 relative z-10">
                  <div className="flex items-center gap-1 min-w-0">
                    {(block.emoji || tagIcon) && <span className="flex-shrink-0" style={{ fontSize: '12px' }}>{block.emoji || tagIcon}</span>}
                    <span className="truncate" style={{ fontSize: '12px', fontWeight: 600, color: 'hsl(var(--foreground))' }}>
                      {block.title}
                    </span>
                  </div>
                </div>
              )}
              {showActualMiniLabel && (
                <div
                  className="absolute left-2 bottom-2 rounded-full bg-background/88 px-1.5 py-[1px] font-medium uppercase tracking-[0.06em] shadow-sm"
                  style={{ fontSize: pillFontSize }}
                >
                  {isTimerActive ? 'doing' : block.isCompleted ? 'done' : 'actual'}
                </div>
              )}
              {showCompactActualMiniLabel && (
                <div
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-[9px] font-medium leading-none uppercase tracking-[0.05em]"
                  style={{ color: blockColor, fontSize: microLayout ? '9px' : slimBarLayout ? '10px' : '11px' }}
                >
                  done
                </div>
              )}
            </div>
          );
        })()}


        {/* Resize handles — z-[15] puts them above the content area (z-10) so they actually receive mousedown events */}
        {isEditable && !isEditingThis && (() => {
          const ultraSlimHandles = ultraShortOuter;
          const slimResize = height <= 38 && !ultraSlimHandles;
          const midResize = !slimResize && height <= 50;
          return (
          <>
            <div
              className={cn(
                'absolute top-0 left-0 right-0 cursor-n-resize flex items-start justify-center z-[15]',
                ultraSlimHandles ? '-top-1 h-3 pt-1' : slimResize ? '-top-1 h-4 pt-1' : midResize ? 'h-5 pt-1' : 'h-7 pt-1.5',
              )}
              onMouseDown={(e) => { e.stopPropagation(); handleMouseDown(e, block, 'top'); }}
            >
              <div
                className={cn(
                  'rounded-full opacity-0 group-hover/block:opacity-70 transition-opacity',
                  ultraSlimHandles ? 'w-8 h-[2px]' : slimResize ? 'w-6 h-[2px]' : 'w-8 h-[3px]',
                )}
                style={{ backgroundColor: colorWithAlpha(edgeAlpha(isPlanOnly ? 0.34 : 0.28)) }}
              />
            </div>
            <div
              className={cn(
                'absolute bottom-0 left-0 right-0 cursor-s-resize flex items-end justify-center z-[15]',
                ultraSlimHandles ? '-bottom-1 h-3 pb-1' : slimResize ? '-bottom-1 h-4 pb-1' : midResize ? 'h-5 pb-1' : 'h-7 pb-1.5',
              )}
              onMouseDown={(e) => { e.stopPropagation(); handleMouseDown(e, block, 'bottom'); }}
            >
              <div
                className={cn(
                  'rounded-full opacity-0 group-hover/block:opacity-70 transition-opacity',
                  ultraSlimHandles ? 'w-8 h-[2px]' : slimResize ? 'w-6 h-[2px]' : 'w-8 h-[3px]',
                )}
                style={{ backgroundColor: colorWithAlpha(edgeAlpha(isPlanOnly ? 0.34 : 0.28)) }}
              />
            </div>
          </>
          );
        })()}

        {/* Tall-block bottom anchor — mirrors a calendar event: the start time
            reads at the top, the end time + duration read at the bottom edge, so
            a multi-hour block stops looking like an empty void. pointer-events-none
            keeps the resize handle beneath it fully usable. Skipped for Both-mode
            plan+actual blocks (ambiguous which "end" to show) and for short/narrow
            blocks (no void to fill). */}
        {!isEditingThis && height >= 150 && !compactLayout && !microLayout && !hideTitleTooNarrow
          && (blockWidthPx === 0 || blockWidthPx >= 130)
          && !(displayMode === 'both' && hasPlan && hasActual) && (
          <div
            className="absolute left-3 bottom-2 z-[6] flex items-center gap-1.5 pointer-events-none font-mono tabular-nums leading-none"
            style={{ fontSize: '11px', color: isDarkMode ? 'hsl(0 0% 100% / 0.5)' : 'hsl(var(--muted-foreground) / 0.72)' }}
          >
            <span aria-hidden style={{ opacity: 0.65 }}>↳</span>
            <span>{fmtTime(visibleEnd)}</span>
            <span style={{ opacity: 0.5 }}>·</span>
            <span style={{ opacity: 0.82 }}>
              {(() => {
                const d = Math.max(1, Math.round(visibleEnd - visibleStart));
                const h = Math.floor(d / 60);
                const m = d % 60;
                return h > 0 ? `${h}h${m > 0 ? ` ${m}m` : ''}` : `${m}m`;
              })()}
            </span>
          </div>
        )}

        {/* Action buttons on hover */}
        {!isEditingThis && !block.readOnly && (
          <div
            className={cn(
              "absolute flex items-center gap-1 z-30 rounded-md px-1 py-0.5 bg-card/90 shadow-sm ring-1 ring-border/50 backdrop-blur-sm",
              isResumeBlockSelected ? "opacity-100" : keepActionsVisible ? "opacity-100" : "opacity-0 group-hover/block:opacity-100",
              veryCompactLayout ? "-top-8 right-0" : "top-1 right-1"
            )}
            data-block-action="true"
            onMouseDown={e => e.stopPropagation()}
            onClick={e => e.stopPropagation()}
          >
            {!block.isCompleted && onStartTimer && (
              <button
                onClick={() => onStartTimer(parentTimerId)}
                className={cn(
                  "p-1.5 rounded-lg transition-colors inline-flex items-center gap-1",
                  isTimerActive ? "text-primary bg-primary/20" : "hover:bg-primary/20 text-muted-foreground hover:text-primary",
                  isResumeBlockSelected && canResumeFromHistory && "px-2"
                )}
                title={
                  isTimerActive
                    ? (lang === 'zh' ? '计时进行中' : 'Timer running')
                    : showResumeTimerTitle
                      ? t('plan.resumeTimer')
                      : t('plan.startFocusTimer')
                }
                aria-label={
                  isTimerActive
                    ? (lang === 'zh' ? '计时进行中' : 'Timer running')
                    : showResumeTimerTitle
                      ? t('plan.resumeTimer')
                      : t('plan.startFocusTimer')
                }
              >
                <Timer size={14} />
                {isResumeBlockSelected && canResumeFromHistory && (
                  <span className="text-[11px] font-medium leading-none">
                    {lang === 'zh' ? '继续' : 'Resume'}
                  </span>
                )}
              </button>
            )}
            <button
              onClick={() => {
                if (displayMode === 'actual' && hasActual && !isTimerActive) {
                  setEditingActualBlockId(block.id);
                  setEditingActualStart(fmtTime(actualStart));
                  setEditingActualEnd(fmtTime(actualEnd));
                  return;
                }
                // For a completed block the visible extent IS the actual span,
                // so seed the editor with actual times — editing them rewrites
                // the timer fields (see handleSaveBlockTime) and the block
                // collapses to match. Plan-only/in-progress blocks keep plan.
                const seedStart = block.isCompleted && hasActual ? actualStart : planStart;
                const seedEnd = block.isCompleted && hasActual ? actualEnd : planEnd;
                if (veryCompactLayout || microLayout) {
                  setEditingTimeBlockId(block.id);
                  setEditingTimeStart(fmtTime(seedStart));
                  setEditingTimeEnd(fmtTime(seedEnd));
                  return;
                }
                setEditingBlockId(block.id);
                setEditingBlockTitle(block.title);
                setEditingTimeStart(fmtTime(seedStart));
                setEditingTimeEnd(fmtTime(seedEnd));
              }}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground"
              title="Edit"
              aria-label="Edit"
            >
              <Pencil size={14} />
            </button>
            {displayMode === 'plan' && onUnscheduleTodo && !block.isCompleted && (
              <button onClick={() => onUnscheduleTodo(block.id)} className="p-1 rounded text-muted-foreground hover:text-accent-foreground transition-colors" title="Move back to list" aria-label="Move back to list"><ArrowLeft size={12} /></button>
            )}
            {block.source === 'todo' && (
              <button
                onClick={() => removeBlockFromTimeline(block)}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive"
                title={displayMode === 'plan' ? 'Remove from timeline' : displayMode === 'actual' ? 'Clear actual time' : 'Remove from timeline'}
                aria-label={displayMode === 'plan' ? 'Remove from timeline' : displayMode === 'actual' ? 'Clear actual time' : 'Remove from timeline'}
              >
                <Trash2 size={14} />
              </button>
            )}
            {block.source === 'moment' && onDeleteMoment && (
              <button
                onClick={() => removeBlockFromTimeline(block)}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive"
                title={lang === 'zh' ? '删除' : 'Delete'}
                aria-label={lang === 'zh' ? '删除' : 'Delete'}
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        )}

        {editingTimeBlockId === block.id && veryCompactLayout && (
          <div
            className="absolute right-0 top-full z-40 mt-1 flex items-center gap-1 rounded-xl border border-border/60 bg-card/95 px-2 py-1.5 shadow-lg backdrop-blur-sm"
            onMouseDown={e => e.stopPropagation()}
            onClick={e => e.stopPropagation()}
          >
            <input
              autoFocus
              value={editingTimeStart}
              onChange={e => setEditingTimeStart(e.target.value)}
              className="w-[54px] rounded-md bg-secondary/80 px-1 py-0.5 text-center font-mono text-[11px] tabular-nums focus:outline-none focus:ring-1 focus:ring-primary/40"
              placeholder="HH:MM"
              onKeyDown={e => {
                if (e.key === 'Enter') handleSaveBlockTime(block.id);
                if (e.key === 'Escape') setEditingTimeBlockId(null);
              }}
            />
            <span className="text-[10px] text-muted-foreground/55">→</span>
            <input
              value={editingTimeEnd}
              onChange={e => setEditingTimeEnd(e.target.value)}
              className="w-[54px] rounded-md bg-secondary/80 px-1 py-0.5 text-center font-mono text-[11px] tabular-nums focus:outline-none focus:ring-1 focus:ring-primary/40"
              placeholder="HH:MM"
              onKeyDown={e => {
                if (e.key === 'Enter') handleSaveBlockTime(block.id);
                if (e.key === 'Escape') setEditingTimeBlockId(null);
              }}
              onBlur={() => handleSaveBlockTime(block.id)}
            />
          </div>
        )}

        {editingActualBlockId === block.id && veryCompactLayout && (
          <div
            className="absolute right-0 top-full z-40 mt-1 flex items-center gap-1 rounded-xl border border-border/60 bg-card/95 px-2 py-1.5 shadow-lg backdrop-blur-sm"
            onMouseDown={e => e.stopPropagation()}
            onClick={e => e.stopPropagation()}
          >
            <input
              autoFocus
              value={editingActualStart}
              onChange={e => setEditingActualStart(e.target.value)}
              className="w-[54px] rounded-md bg-secondary/80 px-1 py-0.5 text-center font-mono text-[11px] tabular-nums focus:outline-none focus:ring-1 focus:ring-primary/40"
              placeholder="HH:MM"
              onKeyDown={e => {
                if (e.key === 'Enter') handleSaveActualTime(block.id);
                if (e.key === 'Escape') setEditingActualBlockId(null);
              }}
            />
            <span className="text-[10px] text-muted-foreground/55">→</span>
            <input
              value={editingActualEnd}
              onChange={e => setEditingActualEnd(e.target.value)}
              className="w-[54px] rounded-md bg-secondary/80 px-1 py-0.5 text-center font-mono text-[11px] tabular-nums focus:outline-none focus:ring-1 focus:ring-primary/40"
              placeholder="HH:MM"
              onKeyDown={e => {
                if (e.key === 'Enter') handleSaveActualTime(block.id);
                if (e.key === 'Escape') setEditingActualBlockId(null);
              }}
              onBlur={() => handleSaveActualTime(block.id)}
            />
          </div>
        )}

        {/* Content area — anchored to the primary (actual or plan) block, not always y=0 */}
        {(() => {
          const planTopOffset = showPlan ? Math.max(0, minToY(Math.max(planStart, axisStartMin)) - top) : 0;
          const actTopOffset = showActual ? Math.max(0, minToY(Math.max(actualStart, axisStartMin)) - top) : 0;
          const planBoxH = showPlan ? planSegH : 0;
          const actBoxH = showActual ? actSegH : 0;
          // In Both mode with both plan and actual, anchor content to whichever
          // box is taller so the title has room to render. Otherwise a just-started
          // timer (actual ~12px) would squash the title into an invisible strip
          // while the 60-min plan frame sits empty next to it.
          const bothPresent = showPlan && showActual;
          const useTallestFrame = bothPresent && planBoxH > actBoxH;
          const contentTopOffset = useTallestFrame
            ? planTopOffset
            : (showActual ? actTopOffset : planTopOffset);
          const contentHeight = useTallestFrame
            ? planBoxH
            : (showActual ? actBoxH : showPlan ? planBoxH : height);
          /** Outer shell is inflated (outerMinH) but title sat in thin act Seg band — vertically center across full pill */
          const compactContentFullShell = veryCompactLayout && contentHeight > 0 && contentHeight <= height - 4;
          return (
        <div
          className={cn(
            "absolute left-0 right-0 z-10 overflow-hidden",
            veryCompactLayout ? "px-0 py-0" : "px-3.5 py-2.5 flex flex-col justify-center",
            tallNarrowLayout && !veryCompactLayout && "items-center text-center"
          )}
          style={{
            top: compactContentFullShell ? 0 : contentTopOffset,
            height: compactContentFullShell ? height : contentHeight,
          }}
        >
          {(() => {
            const timeStr = `${fmtTime(planStart)} → ${fmtTime(planEnd)}`;
            const planDurationMin = planEnd - planStart;
            const durationStr = (() => { const total = Math.round(planDurationMin); const h = Math.floor(total / 60); const m = total % 60; return h > 0 ? `${h}h${m > 0 ? ` ${m}m` : ''}` : `${m}m`; })();
            const actualDurationMin = hasActual ? Math.max(0, actualEnd - actualStart) : 0;
            const actualDurationStr = (() => {
              const total = Math.round(actualDurationMin);
              const h = Math.floor(total / 60);
              const m = total % 60;
              return h > 0 ? `${h}h${m > 0 ? ` ${m}m` : ''}` : `${m}m`;
            })();
            const showCombinedBothMeta = displayMode === 'both' && hasPlan && hasActual;
            const allowWrappedTitle = !narrowLayout && !microLayout && !tallNarrowLayout && height >= 70 && blockWidthPx >= 160;
            const stackTimeMeta =
              compactLayout || narrowLayout || tallNarrowLayout || showCombinedBothMeta;
            /** Planned / Both(plan-only strip): subtitles. Doing view: omit — block geometry is enough */
            const showPlanRowTime =
              displayMode !== 'actual' &&
              !showCombinedBothMeta &&
              (displayMode === 'both' ? hasPlan : displayMode === 'plan');
            /** Compact strip: prefer actual duration in Doing mode */
            const compactDurationLabel =
              displayMode === 'actual' && hasActual ? actualDurationStr : durationStr;
            const hideElapsedWhileTiming = isTimerActive && !block.isCompleted;
            const maxDurMin = Math.max(planDurationMin, actualDurationMin);
            const planBarPct = maxDurMin > 0 ? (planDurationMin / maxDurMin) * 100 : 100;
            const actualBarPct = maxDurMin > 0 ? (actualDurationMin / maxDurMin) * 100 : 100;
            const overrunMin = actualDurationMin - planDurationMin;
            const showPlanActualBars = false;
            return (
              <>
                {isEditingThis ? (
                  <div
                    className="flex flex-col gap-1.5 min-w-0"
                    onMouseDown={e => e.stopPropagation()}
                    onBlur={(e) => {
                      if (e.relatedTarget && e.currentTarget.contains(e.relatedTarget as Node)) return;
                      if (editingBlockTitle.trim() && editingBlockTitle.trim() !== block.title) {
                        renameBlock(block, editingBlockTitle);
                      }
                      handleSaveBlockTime(block.id);
                      setEditingBlockId(null);
                    }}
                  >
                    <input
                      autoFocus
                      value={editingBlockTitle}
                      onChange={e => setEditingBlockTitle(e.target.value)}
                      onKeyDown={e => {
                        const nev = e.nativeEvent as KeyboardEvent;
                        if (e.key === 'Enter' && !isImeComposing(nev) && editingBlockTitle.trim()) {
                          renameBlock(block, editingBlockTitle);
                          handleSaveBlockTime(block.id);
                          setEditingBlockId(null);
                        }
                        if (e.key === 'Escape') setEditingBlockId(null);
                      }}
                      className="flex-1 min-w-0 bg-transparent font-medium focus:outline-none"
                      style={{ fontSize: titleFontSize, borderBottom: `1px solid ${colorWithAlpha(0.25)}` }}
                    />
                    {!microLayout && !ultraNarrowLayout && (
                      <div className="flex items-center gap-1">
                        <input
                          value={editingTimeStart}
                          onChange={e => setEditingTimeStart(e.target.value)}
                          className="w-[48px] font-mono tabular-nums bg-muted/20 rounded px-1 py-0.5 text-center focus:outline-none focus:ring-1 focus:ring-primary/30"
                          style={{ fontSize: '11px' }}
                          placeholder="HH:MM"
                          onKeyDown={e => { if (e.key === 'Enter') handleSaveBlockTime(block.id); if (e.key === 'Escape') setEditingBlockId(null); }}
                        />
                        <span className="text-muted-foreground/50" style={{ fontSize: '10px' }}>→</span>
                        <input
                          value={editingTimeEnd}
                          onChange={e => setEditingTimeEnd(e.target.value)}
                          className="w-[48px] font-mono tabular-nums bg-muted/20 rounded px-1 py-0.5 text-center focus:outline-none focus:ring-1 focus:ring-primary/30"
                          style={{ fontSize: '11px' }}
                          placeholder="HH:MM"
                          onKeyDown={e => { if (e.key === 'Enter') handleSaveBlockTime(block.id); if (e.key === 'Escape') setEditingBlockId(null); }}
                        />
                      </div>
                    )}
                  </div>
                ) : veryCompactLayout ? (
                  /* Very compact pills — flex-centered so text sits mid-block, not at top edge */
                  <div className="absolute inset-x-0 inset-y-0 flex items-center">
                    <div
                      className={cn(
                        'flex min-w-0 w-full items-center',
                        ultraShortOuter ? 'gap-1 px-2' : 'gap-[6px] px-[14px]',
                      )}
                    >
                    {!ultraNarrowLayout && (block.emoji || tagIcon) && (
                      <span
                        className={cn(
                          'inline-flex flex-shrink-0 items-center justify-center leading-none',
                          ultraShortOuter ? 'h-3 min-w-[10px] text-[11px]' : 'h-3.5 w-3.5 text-[13px]',
                        )}
                        style={{ margin: 0, lineHeight: 1, opacity: block.isCompleted ? 0.5 : 1 }}
                      >
                        {block.emoji || tagIcon}
                      </span>
                    )}
                    <span
                      className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap leading-tight"
                      style={{
                        fontSize: ultraShortOuter ? '11px' : microLayout ? '11.5px' : ultraNarrowLayout ? '12.5px' : '14px',
                        fontWeight: 500,
                        lineHeight: 1.08,
                        margin: 0,
                        color: block.isCompleted ? tintedText(0.12) : isPlanOnly ? tintedText(0.45) : 'hsl(var(--foreground))',
                      }}
                    >
                      {hideTitleTooNarrow ? '' : block.title}
                    </span>
                    {!hideElapsedWhileTiming && !narrowLayout && blockWidthPx >= 280 && compactDurationLabel.length <= 10 && (
                      <span
                        className="flex-shrink-0 font-mono tabular-nums text-muted-foreground/60 leading-none"
                        style={{ fontSize: '10px', fontWeight: 500, lineHeight: 1, margin: 0 }}
                      >
                        {compactDurationLabel}
                      </span>
                    )}
                    </div>
                  </div>
                ) : (
                  <>
                    <div className={cn("flex items-center gap-1.5 min-w-0", tallNarrowLayout && "w-full justify-center")}>
                      {!suppressLeadingMeta && (block.emoji || tagIcon) && (
                        <span className="inline-flex h-4 w-4 flex-shrink-0 items-center justify-center leading-none"
                          style={{ fontSize: compactLayout ? '13px' : '14px', opacity: block.isCompleted ? 0.5 : 1 }}>
                          {block.emoji || tagIcon}
                        </span>
                      )}
                      <span className={cn("min-w-0 overflow-hidden text-ellipsis leading-[1.2]", tallNarrowLayout ? "text-center" : "flex-1")} style={{
                        fontSize: titleFontSize,
                        fontWeight: 500,
                        display: allowWrappedTitle ? '-webkit-box' : 'block',
                        WebkitLineClamp: allowWrappedTitle ? 2 : 'unset',
                        WebkitBoxOrient: allowWrappedTitle ? 'vertical' : 'unset',
                        whiteSpace: allowWrappedTitle ? 'normal' : 'nowrap',
                        color: block.isCompleted ? tintedText(0.12) : isPlanOnly ? (isDarkMode ? 'hsl(0 0% 100% / 0.9)' : tintedText(0.48)) : 'hsl(var(--foreground))',
                        textShadow: isDarkMode && !block.isCompleted ? '0 1px 1.5px rgba(0,0,0,0.30)' : undefined,
                      }}>{hideTitleTooNarrow ? '' : block.title}</span>
                    </div>
                    {editingTimeBlockId === block.id && (
                      <div className={cn("mt-0.5 gap-1", narrowLayout ? "flex flex-col items-center" : "flex items-center flex-wrap")} onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
                        <input
                          autoFocus
                          value={editingTimeStart}
                          onChange={e => setEditingTimeStart(e.target.value)}
                          className="w-[52px] font-mono tabular-nums bg-secondary/90 rounded px-1 py-0.5 text-center focus:outline-none focus:ring-2 focus:ring-primary/35"
                          style={{ fontSize: compactLayout ? '11px' : '13px' }}
                          placeholder="HH:MM"
                          onKeyDown={e => {
                            if (e.key === 'Enter') handleSaveBlockTime(block.id);
                            if (e.key === 'Escape') setEditingTimeBlockId(null);
                          }}
                        />
                        <span className="text-muted-foreground/50" style={{ fontSize: '10px' }}>{narrowLayout ? '↓' : '→'}</span>
                        <input
                          value={editingTimeEnd}
                          onChange={e => setEditingTimeEnd(e.target.value)}
                          className="w-[52px] font-mono tabular-nums bg-secondary/90 rounded px-1 py-0.5 text-center focus:outline-none focus:ring-2 focus:ring-primary/35"
                          style={{ fontSize: compactLayout ? '11px' : '13px' }}
                          placeholder="HH:MM"
                          onKeyDown={e => {
                            if (e.key === 'Enter') handleSaveBlockTime(block.id);
                            if (e.key === 'Escape') setEditingTimeBlockId(null);
                          }}
                          onBlur={() => handleSaveBlockTime(block.id)}
                        />
                      </div>
                    )}
                    {editingTimeBlockId !== block.id && !ultraNarrowLayout && (
                      <div className={cn(
                        "mt-0.5",
                        stackTimeMeta ? "flex flex-col gap-0.5" : "flex items-center gap-1 flex-wrap",
                        tallNarrowLayout ? "items-center text-center" : stackTimeMeta ? "items-start" : ""
                      )}>
                        {/* Plan subtitle — Planned tab, or Both when this block is plan-only */}
                        {showPlanRowTime &&
                          (displayMode === 'plan' ? (
                          <button
                            className="max-w-full whitespace-nowrap font-mono tabular-nums leading-none text-muted-foreground/70 hover:text-primary hover:underline underline-offset-2 transition-colors cursor-pointer bg-transparent border-none p-0"
                            style={{ fontSize: timeFontSize, fontWeight: 500 }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingTimeBlockId(block.id);
                              setEditingTimeStart(fmtTime(planStart));
                              setEditingTimeEnd(fmtTime(planEnd));
                            }}
                            onMouseDown={e => e.stopPropagation()}
                          >
                            {narrowLayout ? durationStr : timeStr}
                          </button>
                        ) : (
                          <span
                            className="max-w-full whitespace-nowrap font-mono tabular-nums leading-none text-muted-foreground/70"
                            style={{ fontSize: timeFontSize, fontWeight: 500 }}
                          >
                            {narrowLayout ? durationStr : timeStr}
                          </span>
                        ))}
                        {hasActual && displayMode === 'actual' && editingActualBlockId === block.id && (
                          <div className="flex items-center gap-1" onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
                            <span style={{ fontSize: timeFontSize, color: blockColor }}>(</span>
                            <input
                              autoFocus
                              value={editingActualStart}
                              onChange={e => setEditingActualStart(e.target.value)}
                              className="w-[52px] font-mono tabular-nums bg-secondary rounded px-1 py-0 text-center focus:outline-none focus:ring-1 focus:ring-primary/40"
                              style={{ fontSize: compactLayout ? '11px' : '13px' }}
                              placeholder="HH:MM"
                              onKeyDown={e => {
                                if (e.key === 'Enter') handleSaveActualTime(block.id);
                                if (e.key === 'Escape') setEditingActualBlockId(null);
                              }}
                            />
                            <span className="text-muted-foreground/50" style={{ fontSize: '10px' }}>→</span>
                            <input
                              value={editingActualEnd}
                              onChange={e => setEditingActualEnd(e.target.value)}
                              className="w-[52px] font-mono tabular-nums bg-secondary rounded px-1 py-0 text-center focus:outline-none focus:ring-1 focus:ring-primary/40"
                              style={{ fontSize: compactLayout ? '11px' : '13px' }}
                              placeholder="HH:MM"
                              onKeyDown={e => {
                                if (e.key === 'Enter') handleSaveActualTime(block.id);
                                if (e.key === 'Escape') setEditingActualBlockId(null);
                              }}
                              onBlur={() => handleSaveActualTime(block.id)}
                            />
                            <span style={{ fontSize: timeFontSize, color: blockColor }}>)</span>
                          </div>
                        )}
                        {/* "Xm doing/done" — only show for completed blocks */}
                        {showCombinedBothMeta && block.isCompleted && (showPlanActualBars ? (
                          <div className="mt-1.5 space-y-[4px]" onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
                            <div className="flex items-center gap-1.5">
                              <span className="text-muted-foreground/50 flex-shrink-0 font-mono" style={{ fontSize: '9px', minWidth: '22px' }}>plan</span>
                              <div className="flex-1 h-[4px] rounded-full bg-muted/30 overflow-hidden">
                                <div className="h-full rounded-full transition-all" style={{ width: `${planBarPct}%`, backgroundColor: colorWithAlpha(0.35) }} />
                              </div>
                              <span className="text-muted-foreground/55 font-mono flex-shrink-0" style={{ fontSize: '9px', minWidth: '28px', textAlign: 'right' }}>{durationStr}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="flex-shrink-0 font-mono" style={{ fontSize: '9px', color: blockColor, minWidth: '22px' }}>done</span>
                              <div className="flex-1 h-[4px] rounded-full bg-muted/30 overflow-hidden">
                                <div className="h-full rounded-full transition-all" style={{ width: `${actualBarPct}%`, backgroundColor: blockColor }} />
                              </div>
                              <span className="font-mono flex-shrink-0" style={{ fontSize: '9px', color: blockColor, minWidth: '28px', textAlign: 'right' }}>
                                {actualDurationStr}{Math.abs(overrunMin) >= 3 ? ` ${overrunMin > 0 ? '+' : ''}${overrunMin}m` : ''}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <span
                            className="inline-flex items-center gap-1 whitespace-nowrap leading-none rounded-full px-1.5 py-[3px] font-medium"
                            style={{ fontSize: '10px', backgroundColor: colorWithAlpha(0.12), color: blockColor }}
                          >
                            {block.isCompleted && <span style={{ fontSize: '9px' }}>✓</span>}
                            {actualDurationStr}
                          </span>
                        ))}
                        {!hasActual && isTodo && displayMode === 'actual' && (
                          editingActualBlockId === block.id ? (
                            <div className="flex items-center gap-1" onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
                              <input
                                autoFocus
                                value={editingActualStart}
                                onChange={e => setEditingActualStart(e.target.value)}
                                className="w-[52px] font-mono tabular-nums bg-secondary rounded px-1 py-0 text-center focus:outline-none focus:ring-1 focus:ring-primary/40"
                                style={{ fontSize: compactLayout ? '10px' : '12px' }}
                                placeholder="HH:MM"
                                onKeyDown={e => {
                                  if (e.key === 'Enter') handleSaveActualTime(block.id);
                                  if (e.key === 'Escape') setEditingActualBlockId(null);
                                }}
                              />
                              <span className="text-muted-foreground/50" style={{ fontSize: '10px' }}>→</span>
                              <input
                                value={editingActualEnd}
                                onChange={e => setEditingActualEnd(e.target.value)}
                                className="w-[52px] font-mono tabular-nums bg-secondary rounded px-1 py-0 text-center focus:outline-none focus:ring-1 focus:ring-primary/40"
                                style={{ fontSize: compactLayout ? '10px' : '12px' }}
                                placeholder="HH:MM"
                                onKeyDown={e => {
                                  if (e.key === 'Enter') handleSaveActualTime(block.id);
                                  if (e.key === 'Escape') setEditingActualBlockId(null);
                                }}
                                onBlur={() => handleSaveActualTime(block.id)}
                              />
                            </div>
                          ) : (
                            <button
                              className="text-muted-foreground/40 hover:text-primary transition-colors bg-transparent border-none p-0 cursor-pointer"
                              style={{ fontSize: compactLayout ? '10px' : largeBlockLayout ? '12px' : '11px' }}
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingActualBlockId(block.id);
                                setEditingActualStart(fmtTime(planStart));
                                setEditingActualEnd(fmtTime(planEnd));
                              }}
                              onMouseDown={e => e.stopPropagation()}
                            >
                              {block.isCompleted ? '✎ actual time' : '+ doing'}
                            </button>
                          )
                        )}
                        {!hideElapsedWhileTiming && !compactLayout && !microLayout && !hasActual && !showCombinedBothMeta && (
                          <span
                            className="whitespace-nowrap leading-none text-muted-foreground/60"
                            style={{ fontSize: timeFontSize }}
                          >
                            {displayMode === 'actual' ? `Not started` : durationStr}
                          </span>
                        )}
                      </div>
                    )}
                  </>
                )}
                {/* Progress bar — only show if user explicitly set a progress value */}
                {block.isCompleted && height > 48 && !isEditingThis && block.progress != null && block.progress > 0 && block.progress < 100 && (
                  <div className="flex items-center gap-1 mt-1" onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
                    <div
                      className="flex-1 h-1.5 bg-muted/50 rounded-full overflow-hidden cursor-pointer relative"
                      onClick={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const pct = Math.round(((e.clientX - rect.left) / rect.width) * 100 / 5) * 5;
                        const clamped = Math.max(0, Math.min(100, pct));
                        onUpdateTodo(block.id, { progress: clamped, is_completed: clamped >= 100 });
                      }}
                    >
                      <div className="h-full rounded-full transition-all" style={{ width: `${block.progress}%`, backgroundColor: colorWithAlpha(0.5) }} />
                    </div>
                    <span
                      className="text-muted-foreground/50 font-mono"
                      style={{ fontSize: blockWidthPx >= 215 && height >= 150 ? '12px' : blockWidthPx >= 185 && height >= 110 ? '11px' : '10px' }}
                    >
                      {block.progress}%
                    </span>
                  </div>
                )}
              </>
            );
          })()}
          {block.photos && block.photos.length > 0 && height > 56 && !isEditingThis && (
            <div className="flex gap-1 mt-0.5">
              {block.photos.slice(0, Math.min(3, Math.floor((height - 48) / 20))).map((photo, idx) => (
                <StorageImage key={idx} src={photo} alt="" className="w-6 h-6 rounded object-cover flex-shrink-0" />
              ))}
              {block.photos.length > 3 && <span className="text-[9px] text-muted-foreground/60 self-end">+{block.photos.length - 3}</span>}
            </div>
          )}
        </div>
          );
        })()}
        </div>
        {hasHiddenSiblings && (
          <div
            className="absolute top-1 right-1 z-30 flex items-center justify-center rounded-full leading-none font-medium tabular-nums select-none pointer-events-auto"
            style={{
              minWidth: 20,
              padding: '2px 6px',
              fontSize: 10,
              background: hiddenBadgeBg,
              color: hiddenBadgeFg,
            }}
            title={hiddenBadgeTitle}
          >
            +{hiddenSiblingIds.length}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      className="select-none flex-1 flex flex-col min-h-0 relative isolate"
      onMouseMove={handleMouseMove}
      onMouseUp={(e) => { handleMouseUp(e.clientX, e.clientY); }}
      onMouseLeave={(e) => {
        // Block drags (move/top/bottom) continue via window listeners — only cancel range selection
        if (dragging) return;
        handleMouseUp(e.clientX, e.clientY);
      }}
    >
      {/* Timeline area. The maxHeight used to be a flat 600px which, on
          common laptop windows (~800px tall), often cut tasks off mid-block
          even though there was empty space below. Switching to a viewport-
          aware clamp lets the timeline grow with the window but still caps
          on huge monitors so it doesn't eat the entire screen. */}
      <div
        className="relative flex flex-1 overflow-y-auto scrollbar-slim"
        style={{ maxHeight: 'min(820px, calc(100vh - 220px))', minHeight: 360, backgroundColor: timelineCanvasBg }}
        ref={containerRef}
        onDragOver={handleTimelineDragOver}
        onDrop={handleTimelineDrop}
        onDragLeave={handleTimelineDragLeave}
        onWheel={handleTimelineWheel}
      >
        {/* Hour labels + quiet “remaining” line (same column as screenshot) */}
        <div
          className="flex-shrink-0 relative z-20 overflow-visible border-r border-[rgba(55,55,62,0.05)] dark:border-border/35"
          style={{ width: TIME_RAIL_WIDTH_PX, height: totalHeight, backgroundColor: timelineCanvasBg }}
        >
          {hours.map(h => {
            const top = minToY(h * 60);
            const isMidnight = h === 24; // continuous hour 24 = 00:00 next day
            const isYesterday = h < 0;
            return (
              <div
                key={h}
                className="absolute inset-x-0 flex -translate-y-1/2 items-center justify-end pr-2.5"
                style={{ top }}
              >
                <span
                  className="font-sans tabular-nums leading-none tracking-tight"
                  style={{
                    fontSize: isMidnight ? '10px' : '12px',
                    fontWeight: isMidnight ? 600 : 500,
                    color: isMidnight
                      ? isDarkMode ? 'hsl(214 60% 68% / 0.55)' : 'hsl(214 50% 48% / 0.55)'
                      : timelineRailLabelColor,
                    opacity: isYesterday ? 0.5 : 1,
                  }}
                >
                  {hourLabel(h)}
                </span>
              </div>
            );
          })}
        </div>

        {/* Timeline content */}
        <div
          className={cn(
            "flex-1 relative transition-colors",
            dragTaskTitle && "bg-primary/[0.03]"
          )}
          style={{ height: totalHeight, backgroundColor: timelineCanvasBg }}
          onDragOver={handleTimelineDragOver}
          onDrop={handleTimelineDrop}
          onDragLeave={handleTimelineDragLeave}
          onMouseDown={(e) => {
            const target = e.target as HTMLElement;
            if (target.closest('[data-plan-block="true"]') || target.closest('[data-range-handle="true"]') || target.closest('[data-creation-card="true"]')) return;
            if (selectedRange) {
              setSlotAddTitle('');
              setSelectedSlots(new Set());
              setCustomRange(null);
              return;
            }
            const anchor = clientYToMin(e.clientY);
            const initial = clampSelectionRange(anchor, anchor + 15);
            setSelectedSlots(new Set());
            setCustomRange(initial);
            setRangeDragging({ anchorMin: anchor });
          }}
        >
          {isViewingToday && nowMin > WAKE_TOTAL_MIN && (
            <div
              className="absolute left-0 right-0 top-0 pointer-events-none"
              style={{
                height: minToY(Math.min(nowPreciseMin, END_TOTAL_MIN)),
                ...(timelinePastTint
                  ? { backgroundColor: timelinePastTint }
                  : { backgroundColor: 'hsl(var(--muted) / 0.16)' }),
              }}
            />
          )}

          {/* Quiet vertical "spine" running the full day — a single visual thread
              the eye follows from wake to bed. Branches from each leftmost block
              hook back onto it so the day reads as continuous, even when
              individual blocks have gaps between them. */}
          <TimelineSpine isDarkMode={isDarkMode} totalHeight={totalHeight} />
          {positioned.map(({ block, col }) => {
            if (col !== 0) return null;
            const startMinForBranch = block.actualStartMin ?? block.startMin;
            const blockTop = minToY(Math.max(axisStartMin, Math.min(END_TOTAL_MIN, startMinForBranch)));
            const tagColor = getThemedTagColor(block.tags, block.title);
            const accentColor =
              tagColor
              || (block.source === 'imported' ? '#8B91A8' : isDarkMode ? 'hsl(18, 45%, 57%)' : 'hsl(18, 45%, 55%)');
            // Block's left edge in px = content-column-left (0) + leftPct% of column width.
            // Because col 0 always means leftPct === 0, the block starts at x = gap/2 (≈3px).
            // We render the branch out to ~that x.
            const blockLeftPx = 3;
            return (
              <TimelineSpineBranch
                key={`spine-branch-${block.id}`}
                top={blockTop}
                blockLeftPx={Math.max(SPINE_X_PX + 8, blockLeftPx + 28)}
                accentColor={accentColor}
                isDarkMode={isDarkMode}
              />
            );
          })}

          {/* Half-hour slot grid: solid hour lines + dashed mid-hour lines */}
          {allSlots.map(slot => {
            const top = minToY(slot.startMin);
            const isTopHalf = slot.half === 0;
            const isMidnightHour = slot.startMin === 24 * 60; // 00:00 divider
            return (
              <div
                key={`slot-${slot.key}`}
                className={cn("absolute left-0 right-0 transition-colors pointer-events-none")}
                style={{
                  top,
                  height: minToY(slot.endMin) - minToY(slot.startMin),
                  borderTopWidth: isMidnightHour ? 2 : 1,
                  borderTopStyle: isMidnightHour ? 'solid' : (isTopHalf ? 'solid' : 'dashed'),
                  borderTopColor: isMidnightHour
                    ? isDarkMode ? 'hsl(214 60% 68% / 0.28)' : 'hsl(214 50% 48% / 0.22)'
                    : (isTopHalf ? timelineHourLineColor : timelineHalfHourLineColor),
                }}
              />
            );
          })}

          {/* Drop preview block */}
          {dropIndicatorMin !== null && (() => {
            const dragTodo = (dragTaskId ? todos.find(t => t.id === dragTaskId) : undefined)
              || (dragTaskTitle ? todos.find(t => t.title === dragTaskTitle) : undefined);
            const previewTitle = dragTodo?.title || dragTaskTitle || '';
            const previewDur = getSmartDuration(previewTitle, dragTodo?.tags);
            const durLabel = previewDur >= 60 ? `${previewDur / 60}h` : `${previewDur}m`;
            const isPastDrop = isViewingToday && dropIndicatorMin < nowMin;
            const previewTagColor = getThemedTagColor(dragTodo?.tags, previewTitle);
            const previewColor = previewTagColor || (isPastDrop ? '#4B9478' : 'hsl(var(--primary))');
            const previewColorWithAlpha = (alpha: number) => {
              // Tag colors are now hsl(var(--…)/a) strings, not 6-digit hex, so the
              // old `${color}${alphaHex}` concat produced malformed values like
              // `hsl(...)8c` — invalid border/background → an invisible drop preview.
              // color-mix applies the alpha for any color format (same helper the
              // focus timer uses).
              if (previewTagColor) return `color-mix(in srgb, ${previewTagColor} ${Math.round(alpha * 100)}%, transparent)`;
              return isPastDrop ? `rgba(75, 148, 120, ${alpha})` : `hsl(var(--primary) / ${alpha})`;
            };
            const previewDashColor = previewColorWithAlpha(isPastDrop ? 0.42 : 0.55);
            const previewHeight = Math.max(minToY(Math.min(dropIndicatorMin + previewDur, END_TOTAL_MIN)) - minToY(dropIndicatorMin), 28);
            const previewCompact = previewHeight < 46;
            return (
              <div
                className="absolute left-0 right-0 z-40 overflow-visible pointer-events-none"
                style={{
                  top: minToY(dropIndicatorMin),
                  height: previewHeight,
                  borderRadius: `${BLOCK_CORNER_PX}px`,
                  border: `1px dashed ${previewDashColor}`,
                  background: `linear-gradient(180deg, ${previewColorWithAlpha(isPastDrop ? 0.13 : 0.07)} 0%, ${previewColorWithAlpha(isPastDrop ? 0.045 : 0.025)} 100%)`,
                  boxShadow: `0 8px 24px ${previewColorWithAlpha(0.04)}`,
                  '--sparkle-color': previewColorWithAlpha(0.9),
                } as CssVarStyle}
              >
                <SparkleBurst seed={`preview-${dragTaskId || dragTaskTitle || 'x'}`} count={16} />
                {isPastDrop && (
                  <div
                    className="absolute left-0 top-0 bottom-0 w-[3px]"
                    style={{ backgroundColor: previewColorWithAlpha(0.32) }}
                  />
                )}
                <div className={cn('flex h-full min-w-0 items-center gap-2 px-3', isPastDrop && 'pl-3.5')}>
                  {isPastDrop && <span className="flex-shrink-0 text-[13px] leading-none" style={{ color: previewColor }}>✓</span>}
                  <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium leading-none text-foreground/88">
                    {previewTitle || (isPastDrop ? 'Log actual time' : 'Drop to schedule')}
                  </span>
                  {!previewCompact && (
                    <span className="flex-shrink-0 font-mono text-[10.5px] leading-none text-muted-foreground/55">
                      {fmtTime(dropIndicatorMin)} → {fmtTime(Math.min(dropIndicatorMin + previewDur, END_TOTAL_MIN))}
                    </span>
                  )}
                  <span
                    className="flex-shrink-0 rounded-full bg-background/75 px-1.5 py-[2px] text-[10px] font-medium leading-none shadow-[inset_0_0_0_1px_hsl(var(--border)/0.35)]"
                    style={{ color: previewColor }}
                  >
                    {isPastDrop ? `✓ ${durLabel}` : durLabel}
                  </span>
                </div>
              </div>
            );
          })()}


          {/* Inline creation card at selected range — looks like a dashed plan block */}
          {selectedRange && (() => {
            const rangeTop = minToY(selectedRange.startMin);
            const rangeHeight = Math.max(minToY(selectedRange.endMin) - rangeTop, 48);
            const isPastRange = isViewingToday && selectedRange.endMin <= nowMin;
            const creationTagColor = slotAddTitle.trim() ? getThemedTagColor(undefined, slotAddTitle.trim()) : undefined;
            const pastAccent = '#4B9478';
            const borderColor = creationTagColor || (isPastRange ? pastAccent : 'hsl(var(--muted-foreground) / 0.45)');
            const shellStroke = creationTagColor || (isPastRange ? 'hsl(152 32% 44% / 0.56)' : 'hsl(var(--muted-foreground) / 0.26)');
            const shellFill = creationTagColor
              ? `linear-gradient(180deg, color-mix(in srgb, hsl(var(--card)) 90%, ${creationTagColor} 10%) 0%, color-mix(in srgb, hsl(var(--card)) 96%, ${creationTagColor} 4%) 100%)`
              : isPastRange
                ? 'linear-gradient(180deg, hsl(152 30% 20% / 0.16) 0%, hsl(152 24% 14% / 0.08) 100%)'
                : 'linear-gradient(180deg, hsl(var(--card) / 0.22) 0%, hsl(var(--card) / 0.08) 100%)';
            const composerBg = creationTagColor
              ? `color-mix(in srgb, hsl(var(--card)) 84%, ${creationTagColor} 16%)`
              : isDarkMode
                ? 'hsl(var(--card) / 0.92)'
                : 'hsl(var(--card) / 0.96)';
            const startH = Math.floor(selectedRange.startMin / 60);
            const startM = selectedRange.startMin % 60;
            const endH = Math.floor(selectedRange.endMin / 60);
            const endM = selectedRange.endMin % 60;
            const durationMin = selectedRange.endMin - selectedRange.startMin;
            const durH = Math.floor(durationMin / 60);
            const durM = durationMin % 60;
            const durStr = durH > 0 ? `${durH}h${durM > 0 ? ` ${durM}m` : ''}` : `${durM}m`;
            const compactRange = rangeHeight < 96;

            const applyTimeEdit = (field: 'start' | 'end', value: string) => {
              const match = value.match(/^(\d{1,2}):(\d{2})$/);
              if (!match) return;
              const h = parseInt(match[1], 10);
              const m = parseInt(match[2], 10);
              if (h < 0 || h > 23 || m < 0 || m > 59) return;
              const newMin = h * 60 + m;
              if (field === 'start' && newMin < selectedRange.endMin) {
                setCustomRange({ startMin: newMin, endMin: selectedRange.endMin });
              } else if (field === 'end' && newMin > selectedRange.startMin) {
                setCustomRange({ startMin: selectedRange.startMin, endMin: newMin });
              }
            };

            const dismiss = () => { setSlotAddTitle(''); setSelectedSlots(new Set()); setCustomRange(null); };
            return (
              <div
                data-creation-card="true"
                className="absolute left-0 right-0 z-30"
                style={{ top: rangeTop, height: rangeHeight }}
                onMouseDown={e => e.stopPropagation()}
              >
                <div
                  className="absolute inset-0 rounded-[14px] border border-dashed shadow-[inset_0_0_0_1px_hsl(var(--border)/0.18)]"
                  style={{
                    borderColor: shellStroke,
                    background: shellFill,
                  }}
                />
                {isPastRange && (
                  <div
                    className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-[14px]"
                    style={{ backgroundColor: pastAccent }}
                  />
                )}
                <div
                  className={cn(
                    "absolute z-10",
                    compactRange ? "inset-[4px]" : "left-2 right-2"
                  )}
                  style={compactRange ? undefined : { top: 8 }}
                >
                  <div
                    className={cn(
                      "relative rounded-[14px] border shadow-[0_16px_32px_hsl(var(--foreground)/0.18)] backdrop-blur-md",
                      compactRange ? "h-full px-3 py-2" : "px-3 py-2"
                    )}
                    style={{
                      maxWidth: 'none',
                      borderColor: `color-mix(in srgb, ${borderColor} 38%, hsl(var(--border)) 62%)`,
                      background: composerBg,
                    }}
                  >
                  {(
                    <div className="flex h-full min-w-0 items-center gap-2 pr-7">
                      {isPastRange && (
                        <span
                          className="inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-medium"
                          style={{
                            color: pastAccent,
                            background: 'hsl(152 32% 24% / 0.22)',
                            boxShadow: 'inset 0 0 0 1px hsl(152 30% 42% / 0.22)',
                          }}
                        >
                          ✓
                        </span>
                      )}
                      <input
                        ref={slotInputRef}
                        value={slotAddTitle}
                        onChange={e => setSlotAddTitle(e.target.value)}
                        onKeyDown={e => {
                          const native = e.nativeEvent as KeyboardEvent;
                          if (e.key === 'Enter' && !isImeComposing(native) && slotAddTitle.trim() && selectedRange) {
                            const range = selectedRange;
                            const targetDay = date || format(new Date(), 'yyyy-MM-dd');
                            const sH = Math.floor(range.startMin / 60);
                            const sM = range.startMin % 60;
                            const eH = Math.floor(range.endMin / 60);
                            const eM = range.endMin % 60;
                            const startISO = new Date(`${targetDay}T${String(sH).padStart(2, '0')}:${String(sM).padStart(2, '0')}:00`).toISOString();
                            const endISO = new Date(`${targetDay}T${String(eH).padStart(2, '0')}:${String(eM).padStart(2, '0')}:00`).toISOString();
                            const diffSec = (range.endMin - range.startMin) * 60;
                            (async () => {
                              const result = await onAddTodo(slotAddTitle.trim(), 'anytime');
                              const created = (typeof result === 'object' && result !== null && 'id' in result)
                                ? (result as { id?: string })
                                : null;
                              if (created?.id) {
                                if (isPastRange) {
                                  onUpdateTodo(created.id, {
                                    timer_started_at: startISO,
                                    timer_ended_at: endISO,
                                    timer_seconds: diffSec,
                                  });
                                } else {
                                  onUpdateTodo(created.id, { plan_started_at: startISO, plan_ended_at: endISO });
                                }
                              }
                            })();
                            dismiss();
                          }
                          if (e.key === 'Escape') dismiss();
                        }}
                        placeholder={isPastRange ? 'What did you do?' : 'Add task...'}
                        className="min-w-0 flex-1 bg-transparent text-[14px] font-medium leading-none focus:outline-none placeholder:text-muted-foreground/40 text-foreground"
                        style={{ color: creationTagColor || undefined }}
                        autoFocus
                      />
                      <div className="ml-auto flex flex-shrink-0 items-center gap-1.5 font-mono tabular-nums text-muted-foreground/72" style={{ fontSize: '10px' }}>
                        <div className="inline-flex items-center gap-1 rounded-full bg-background/55 px-1.5 py-1 shadow-[inset_0_0_0_1px_hsl(var(--border)/0.34)]">
                          <input
                            className="w-[36px] bg-transparent text-center focus:outline-none"
                            defaultValue={`${String(startH).padStart(2, '0')}:${String(startM).padStart(2, '0')}`}
                            key={`start-${selectedRange.startMin}`}
                            onBlur={e => applyTimeEdit('start', e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                          />
                          <span className="text-muted-foreground/40">→</span>
                          <input
                            className="w-[36px] bg-transparent text-center focus:outline-none"
                            defaultValue={`${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`}
                            key={`end-${selectedRange.endMin}`}
                            onBlur={e => applyTimeEdit('end', e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                          />
                        </div>
                        <span className="inline-flex items-center rounded-full bg-background/45 px-1.5 py-1 text-[9.5px] font-semibold tracking-[0.02em] text-muted-foreground/78 shadow-[inset_0_0_0_1px_hsl(var(--border)/0.28)]">
                          {durStr}
                        </span>
                        {isPastRange && (
                          <span className="inline-flex items-center rounded-full px-1.5 py-1 font-sans text-[9px] font-semibold uppercase tracking-[0.08em] shadow-[inset_0_0_0_1px_hsl(152_30%_42%_/_0.25)]" style={{ color: pastAccent, background: 'hsl(152 30% 20% / 0.18)' }}>done</span>
                        )}
                      </div>
                    </div>
                  )}
                  <button
                    onClick={dismiss}
                    className="absolute top-2.5 right-2.5 inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground/34 hover:bg-background/55 hover:text-foreground transition-colors"
                  >
                    <X size={11} />
                  </button>
                </div>
                </div>
              </div>
            );
          })()}

          {/* Drag handles for selected range */}
          {selectedRange && (() => {
            const topPx = minToY(selectedRange.startMin);
            const bottomPx = minToY(selectedRange.endMin);
            return (
              <>
                <div
                  data-range-handle="true"
                  className="absolute left-0 right-0 z-[25] h-4 cursor-n-resize flex items-center justify-center"
                  style={{ top: topPx - 8 }}
                  onMouseDown={e => handleEdgeDragStart('top', e)}
                >
                  <div className="h-[3px] w-8 rounded-full bg-primary/30" />
                </div>
                <div
                  data-range-handle="true"
                  className="absolute left-0 right-0 z-[25] h-4 cursor-s-resize flex items-center justify-center"
                  style={{ top: bottomPx - 8 }}
                  onMouseDown={e => handleEdgeDragStart('bottom', e)}
                >
                  <div className="h-[3px] w-8 rounded-full bg-primary/30" />
                </div>
              </>
            );
          })()}

          {/* Lane highlights removed — blocks render their own backgrounds */}

          {/* Rest blocks — background layer, always beneath task blocks */}
          {[...restBlocks, ...(restStartMin !== null ? [{ id: 'rest-active', startMin: restStartMin, endMin: Math.max(restStartMin + 5, nowMin) }] : [])].map(rb => {
            const rbTop = minToY(rb.startMin);
            const rbHeight = Math.max(minToY(rb.endMin) - rbTop, 12);
            const isActive = rb.id === 'rest-active';
            const durationMin = rb.endMin - rb.startMin;
            const durStr = durationMin >= 60 ? `${Math.floor(durationMin / 60)}h ${durationMin % 60}m` : `${durationMin}m`;
            return (
              <div
                key={rb.id}
                className="absolute z-[2] group/rest"
                style={{ top: rbTop, height: rbHeight, left: 0, right: 0 }}
              >
                {/* Subtle tinted fill */}
                <div
                  className="absolute inset-0"
                  style={{
                    backgroundColor: REST_COLOR,
                    opacity: isActive ? 0.1 : 0.07,
                    borderRadius: '6px',
                  }}
                />
                {/* Left accent bar */}
                <div
                  className="absolute top-0 bottom-0 left-0"
                  style={{
                    width: '3px',
                    backgroundColor: REST_COLOR,
                    opacity: isActive ? 0.65 : 0.45,
                    borderRadius: '3px 0 0 3px',
                  }}
                />
                {/* Label — always shown, duration text only when tall enough */}
                <div className="absolute left-3 top-0 bottom-0 flex items-center gap-1 pointer-events-none select-none overflow-hidden">
                  <span style={{ fontSize: '10px', color: REST_COLOR, opacity: 0.75, lineHeight: 1 }}>
                    😴{!isActive && rbHeight >= 20 ? ` ${durStr}` : ''}
                  </span>
                </div>
                {/* Delete on hover — only for completed rest blocks */}
                {!isActive && (
                  <button
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 opacity-0 group-hover/rest:opacity-60 hover:!opacity-100 transition-opacity pointer-events-auto"
                    onClick={() => setRestBlocks(prev => prev.filter(b => b.id !== rb.id))}
                    style={{ color: REST_COLOR }}
                  >
                    <X size={9} />
                  </button>
                )}
              </div>
            );
          })}

          {/* (Free-time bands removed — a dashed bordered rectangle read as an
              empty "event card", not as breathing room. The gap-duration pill
              below already labels open stretches, which is the legible signal
              without boxing the emptiness.) */}

          {/* Plan blocks */}
          {positioned.map(({ block, col, totalCols, visibleCols, hiddenSiblingIds, tailRowIndex }) => renderBlock(block, col, totalCols, visibleCols, hiddenSiblingIds, tailRowIndex ?? 0))}

          {/* Auto-plan ghost preview — proposed placements. Focus blocks keep the main
              lane; background (parallel) blocks stay full-width but sit deeper in the
              canvas so they read as "alongside", not "broken in half". */}
          {suggestions?.map(s => {
            const top = minToY(s.startMin);
            const height = Math.max(20, minToY(s.endMin) - top);
            const isBg = s.lane === 'background';
            const title = todos.find(t => t.id === s.todoId)?.title ?? '';
            const durLabel = `${s.endMin - s.startMin}m`;
            const showMeta = height >= 42;
            const leftInset = TIME_RAIL_WIDTH_PX + (isBg ? 22 : 4);
            const laneLabel = isBg
              ? (lang === 'zh' ? '并行' : 'Parallel')
              : (lang === 'zh' ? '专注' : 'Focus');
            const laneChipBg = isBg
              ? (isDarkMode ? 'hsl(150 22% 52% / 0.18)' : 'hsl(150 28% 40% / 0.12)')
              : (isDarkMode ? 'hsl(24 46% 58% / 0.2)' : 'hsl(24 55% 48% / 0.14)');
            const laneChipFg = isBg
              ? (isDarkMode ? 'hsl(150 30% 76%)' : 'hsl(150 34% 28%)')
              : (isDarkMode ? 'hsl(24 60% 78%)' : 'hsl(24 52% 34%)');
            const actionShellBg = isDarkMode ? 'hsl(0 0% 0% / 0.18)' : 'hsl(0 0% 100% / 0.58)';
            const actionShellBorder = isDarkMode ? 'hsl(0 0% 100% / 0.08)' : 'hsl(24 12% 40% / 0.12)';
            return (
              <div
                key={`ghost-${s.todoId}`}
                className="absolute z-[9] overflow-hidden rounded-[12px] px-2.5 py-1.5 transition-shadow pointer-events-auto group/ghost"
                style={{
                  top: top + 1,
                  height: height - 2,
                  left: leftInset,
                  right: 6,
                  background: isBg ? ghostBgBg : ghostFocusBg,
                  border: `1.5px ${isBg ? 'dotted' : 'dashed'} ${isBg ? ghostBgEdge : ghostFocusEdge}`,
                  boxShadow: isBg
                    ? '0 8px 18px hsl(var(--foreground) / 0.06)'
                    : '0 10px 22px hsl(var(--foreground) / 0.08)',
                }}
                onPointerDown={e => e.stopPropagation()}
                onMouseDown={e => e.stopPropagation()}
                onClick={e => e.stopPropagation()}
              >
                <div className="flex h-full items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-start gap-1.5">
                      <span
                        className="mt-[4px] shrink-0 rounded-full"
                        style={{
                          width: 6,
                          height: 6,
                          background: isBg ? 'transparent' : ghostFocusEdge,
                          border: isBg ? `1.5px solid ${ghostBgEdge}` : undefined,
                        }}
                        aria-hidden="true"
                      />
                      <div className="min-w-0 flex-1">
                        <div
                          className="truncate text-[12px] font-medium leading-tight"
                          style={{ color: 'hsl(var(--foreground) / 0.88)' }}
                        >
                          {title}
                        </div>
                        {showMeta ? (
                          <div
                            className="mt-1 flex items-center gap-1.5 text-[10px] leading-tight tabular-nums"
                            style={{ color: 'hsl(var(--foreground) / 0.56)' }}
                          >
                            <span
                              className="inline-flex items-center rounded-full px-1.5 py-[2px] font-medium"
                              style={{ background: laneChipBg, color: laneChipFg }}
                            >
                              {laneLabel}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <Clock size={9} />
                              {durLabel}
                            </span>
                          </div>
                        ) : (
                          <div
                            className="mt-0.5 text-[10px] leading-tight tabular-nums"
                            style={{ color: 'hsl(var(--foreground) / 0.54)' }}
                          >
                            {durLabel}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div
                    className="shrink-0 rounded-full border p-[2px] opacity-78 transition-opacity group-hover/ghost:opacity-100"
                    style={{ background: actionShellBg, borderColor: actionShellBorder }}
                  >
                    <div className="flex items-center gap-0.5">
                    <button
                      onPointerDown={e => e.stopPropagation()}
                      onMouseDown={e => e.stopPropagation()}
                      onClick={() => toggleSuggestionLane(s.todoId)}
                      title={isBg ? (lang === 'zh' ? '改为专注（独占）' : 'Make focus') : (lang === 'zh' ? '改为后台（可并行）' : 'Make background')}
                      className="rounded-full p-[3px] hover:bg-[hsl(var(--foreground)/0.08)] transition-colors"
                      style={{ color: 'hsl(var(--foreground) / 0.55)' }}
                    >
                      <Timer size={12} />
                    </button>
                    <button
                      onPointerDown={e => e.stopPropagation()}
                      onMouseDown={e => e.stopPropagation()}
                      onClick={() => acceptSuggestion(s)}
                      title={lang === 'zh' ? '接受' : 'Accept'}
                      className="rounded-full p-[3px] hover:bg-[hsl(150_40%_45%/0.18)] transition-colors"
                      style={{ color: isDarkMode ? 'hsl(150 45% 62%)' : 'hsl(150 45% 38%)' }}
                    >
                      <Check size={13} />
                    </button>
                    <button
                      onPointerDown={e => e.stopPropagation()}
                      onMouseDown={e => e.stopPropagation()}
                      onClick={() => removeSuggestion(s.todoId)}
                      title={lang === 'zh' ? '忽略' : 'Dismiss'}
                      className="rounded-full p-[3px] hover:bg-[hsl(var(--foreground)/0.08)] transition-colors"
                      style={{ color: 'hsl(var(--foreground) / 0.45)' }}
                    >
                      <X size={13} />
                    </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Empty state */}
          {planBlocks.length === 0 && !selectedRange && (
            <div
              className="absolute left-0 right-0 z-[3] pointer-events-none flex items-center justify-center"
              style={{ top: minToY(Math.max(WAKE_TOTAL_MIN + 90, Math.min(nowMin, END_TOTAL_MIN - 120))) }}
            >
              <div className="w-[min(360px,calc(100%-32px))] rounded-2xl border border-dashed border-border/45 bg-[hsl(var(--surface-contrast)/0.8)] px-4 py-4 text-center shadow-[0_12px_30px_hsl(var(--foreground)/0.04)] backdrop-blur-sm">
                <p className="text-[15px] font-semibold text-foreground/90">
                  {tOr('plan.dragHere', 'Drag a task here to schedule it')}
                </p>
                <p className="mt-1.5 text-[13px] leading-snug text-muted-foreground/75">
                  {tOr('plan.dragHereHint', 'Left side is your task list. This side becomes today’s plan.')}
                </p>
                <div className="mt-3 rounded-[16px] border-2 border-dashed border-[hsl(var(--primary)/0.24)] bg-[hsl(var(--primary)/0.05)] px-3 py-2.5 text-left">
                  <div className="flex items-center gap-2">
                    <span className="rounded-[7px] bg-background/80 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/80">
                      Plan
                    </span>
                    <span className="truncate text-[14px] font-medium text-foreground/85">
                      {tOr('plan.sampleBlock', 'Example task')}
                    </span>
                  </div>
                  <div className="mt-1 font-mono tabular-nums text-[12px] text-muted-foreground/75">
                    {tOr('plan.sampleTimeRange', '09:00 → 10:00')} <span className="text-muted-foreground/50">• 1h</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Gap labels: full pill only when gap is roomy; short gaps stay quiet (subtle) */}
          {(() => {
            if (!SHOW_FREE_TIME_LABELS) return [];
            const MIN_PX = 22;
            /** Minutes between tasks — primary cue for readable “hero” pill vs quiet chip */
            const FULL_PILL_MIN_MINUTES = 28;
            const gaps: { startMin: number; endMin: number }[] = [];
            for (let i = 0; i < sortedPlanBlocks.length - 1; i++) {
              const gapStart = sortedPlanBlocks[i].endMin;
              const gapEnd = sortedPlanBlocks[i + 1].startMin;
              if (gapEnd - gapStart < 5) continue;
              // Note: we intentionally still show the gap pill even when the NEXT
              // block is an actively-timed task. The floating pomodoro shows the
              // live *elapsed* working time — a different number from the free
              // *gap* before it — so hiding the gap here dropped genuine info
              // (the "中间时间差" the user expects between two blocks).
              gaps.push({ startMin: gapStart, endMin: gapEnd });
            }
            if (sortedPlanBlocks.length > 0) {
              const lastEnd = sortedPlanBlocks[sortedPlanBlocks.length - 1].endMin;
              if (END_TOTAL_MIN - lastEnd >= 30) gaps.push({ startMin: lastEnd, endMin: END_TOTAL_MIN });
            }
            const elems: React.ReactNode[] = [];
            gaps.forEach((gap, i) => {
              const isTrailingGap = gap.endMin === END_TOTAL_MIN;
              const gapPx = minToY(gap.endMin) - minToY(gap.startMin);
              if (gapPx < MIN_PX) return;
              if (isTrailingGap) return;
              // On today, the "· left today" pill already labels the free stretch the
              // now-line sits in — skip this gap's pill so the same duration isn't
              // shown twice (avoids the duplicated remaining/gap time).
              if (isViewingToday && nowMin >= gap.startMin && nowMin < gap.endMin) return;
              const centerY = (minToY(gap.startMin) + minToY(gap.endMin)) / 2;
              const diffMin = gap.endMin - gap.startMin;
              const useFullPill = diffMin >= FULL_PILL_MIN_MINUTES;
              const labelOffset = useFullPill ? 11 : 7;
              elems.push(
                <div
                  key={`gap-${gap.startMin}-${gap.endMin}-${i}`}
                  className="absolute left-0 right-0 z-[3] pointer-events-none flex items-center justify-center"
                  style={{ top: centerY - labelOffset }}
                >
                  <TimelineIntervalPill isDarkMode={isDarkMode} variant={useFullPill ? 'default' : 'subtle'}>
                    {formatGapMinutesLabel(diffMin)}
                  </TimelineIntervalPill>
                </div>,
              );
            });
            return elems;
          })()}

          {/* Current time indicator — NOW (only show on today) */}
          {isViewingToday && nowMin >= WAKE_TOTAL_MIN && nowMin <= END_TOTAL_MIN && (
            <>
              {/* Past wash — a soft neutral tint over time that has already
                  elapsed. The future canvas stays clean white so it reads as
                  "still open". Sits at z-[1] so it only colors the empty
                  canvas; task blocks render above it untouched.
                  The gradient fades just before "now" so the transition into
                  the white future feels seamless rather than abrupt. */}
              {nowPreciseMin > WAKE_TOTAL_MIN + 2 && (
                <div
                  className="absolute left-0 right-0 pointer-events-none z-[1]"
                  style={{
                    top: 0,
                    height: minToY(nowPreciseMin),
                    background: isDarkMode
                      ? 'linear-gradient(to bottom, hsl(var(--foreground) / 0.032) 0%, hsl(var(--foreground) / 0.028) 80%, hsl(var(--foreground) / 0.012) 100%)'
                      : 'linear-gradient(to bottom, rgba(15,23,42,0.022) 0%, rgba(15,23,42,0.014) 82%, rgba(15,23,42,0.004) 100%)',
                  }}
                />
              )}
              {/* Now line — thin, soft, slightly blurred, fading to the right */}
              <div
                className="absolute left-0 right-0 z-[52] pointer-events-none"
                style={{
                  top: minToY(nowPreciseMin),
                  height: 1,
                  background: rhythmNowMarkers.lineGradient,
                  filter: 'blur(0.35px)',
                  transform: 'translateY(-0.5px)',
                }}
              />
              {/* Anchor dot — left edge, where the gradient line is strongest.
                  Marks "now begins here" as a structural emphasis. */}
              <div
                className="absolute left-0 z-[53] -translate-y-1/2 pointer-events-none"
                style={{ top: minToY(nowPreciseMin) }}
              >
                <span
                  aria-hidden
                  className="block h-1.5 w-1.5 rounded-full"
                  style={{
                    background: rhythmNowMarkers.dot,
                    boxShadow: rhythmNowMarkers.glow,
                  }}
                />
              </div>

              {/* Timestamp — right edge, away from the hour-label spine on the left.
                  Lightly backdropped so it stays readable when a task block
                  happens to extend across the now-line. */}
              <div
                className="absolute right-1 z-[53] -translate-y-1/2 pointer-events-none"
                style={{ top: minToY(nowPreciseMin) }}
              >
                <span className="inline-flex items-center rounded-full bg-background/72 px-1.5 py-[2px] font-mono text-[10px] tabular-nums tracking-[0.02em] text-foreground/55 backdrop-blur-[3px]">
                  {nowTimeLabel}
                </span>
              </div>
            </>
          )}

          {/* Today remaining — always tuck *below* the precise now line (not last block end alone, which can land on the line).
              Suppressed when the timeline is empty: the empty-state card already labels an unstarted day, and stacking a "13h left" pill on top of it just doubles the same signal in overlapping copy. */}
          {isViewingToday && nowMin < END_TOTAL_MIN - 5 && planBlocks.length > 0 && (() => {
            const GAP_AFTER_BLOCK_PX = 22;
            /** Clear the 1px now line + blur so the pill sits clearly in "future".
                Bumped past the 14px comfort floor because 14px still reads as "stuck to the
                block that just ended" when the block ends right on the now line. */
            const CLEAR_BELOW_NOW_PX = 24;
            const bedMin = BEDTIME_HOUR * 60 + BEDTIME_MINUTE;
            const remainingMin = Math.max(0, bedMin - nowMin);
            const remainingFullPill = remainingMin >= 45;
            const belowNowY = minToY(nowPreciseMin) + CLEAR_BELOW_NOW_PX;
            // Anchor to the live now-line, but never let the pill land on top of a
            // block whose vertical span it would overlap (e.g. a planned block that
            // straddles the now line). Tuck it just below any such block instead.
            const PILL_HEIGHT_PX = 30;
            /** Same rationale as CLEAR_BELOW_NOW_PX — the pill needs breathing room from
                the block above, not just non-overlap. 10px reads as visually glued. */
            const CLEAR_BELOW_BLOCK_PX = 22;
            const ranges = blocksForColumns
              .map(b => ({
                top: minToY(Math.min(b.startMin, b.planStartMin ?? Infinity, b.actualStartMin ?? Infinity)),
                bottom: minToY(Math.max(b.endMin, b.planEndMin ?? -Infinity, b.actualEndMin ?? -Infinity)),
              }))
              .sort((a, b) => a.bottom - b.bottom);
            let anchorY = belowNowY;
            for (const r of ranges) {
              if (r.bottom > anchorY - CLEAR_BELOW_BLOCK_PX && r.top < anchorY + PILL_HEIGHT_PX) {
                anchorY = r.bottom + CLEAR_BELOW_BLOCK_PX;
              }
            }
            const maxTopBeforeBed = Math.max(0, minToY(END_TOTAL_MIN) - 48);
            const topPx = Math.min(Math.max(GAP_AFTER_BLOCK_PX + minToY(WAKE_TOTAL_MIN), anchorY), maxTopBeforeBed);
            return (
              <div
                className="absolute left-0 right-0 z-[48] pointer-events-none flex justify-center px-3"
                style={{ top: topPx }}
              >
                <TimelineTodayRemainingPill
                  isDarkMode={isDarkMode}
                  time={remainingTimeStr}
                  label={lang === 'zh' ? '今日剩余' : 'left today'}
                  variant={remainingFullPill ? 'default' : 'subtle'}
                />
              </div>
            );
          })()}

        </div>
      </div>

      {/* inset-right clears PlanView's absolute rhythm preset (palette) — same corner, ~w-8 + margin */}
      <div className="pointer-events-none absolute right-12 top-3 z-30 flex items-start gap-1">
        <button
          onClick={handleRestToggle}
          className="pointer-events-auto flex items-center gap-1 px-2.5 py-[3px] text-[12px] font-medium rounded-full transition-all backdrop-blur-md shadow-[0_4px_12px_hsl(var(--foreground)/0.05)]"
          style={{
            background: restStartMin !== null
              ? `color-mix(in srgb, hsl(var(--surface-contrast)) 80%, ${REST_COLOR} 20%)`
              : 'hsl(var(--surface-contrast) / 0.9)',
            border: `1px solid ${restStartMin !== null ? REST_COLOR : 'hsl(var(--border) / 0.5)'}`,
            color: restStartMin !== null ? REST_COLOR : 'hsl(var(--muted-foreground))',
          }}
        >
          {restStartMin !== null ? (
            <>
              <span className="animate-pulse">●</span>
              <span>Stop Rest</span>
            </>
          ) : (
            <>
              <span>😴</span>
              <span>Rest</span>
            </>
          )}
        </button>
        {selectedRange && (
          <span className="text-[12px] text-muted-foreground bg-[hsl(var(--surface-contrast)/0.9)] backdrop-blur-md border border-border/50 rounded-full px-2.5 py-1 shadow-[0_4px_12px_hsl(var(--foreground)/0.06)] pointer-events-auto">
            {t('plan.selected')} <span className="font-semibold text-foreground">
              {Math.max(0, Math.round(selectedRange.endMin - selectedRange.startMin))}
            </span> {t('plan.minutes')}
          </span>
        )}
        {isViewingToday && (unscheduledTodos.length > 0 || suggestions) && (
          <div className="flex items-center gap-1 pointer-events-auto">
            {suggestions ? (
              <div
                className="flex items-center gap-1 rounded-full border p-[3px] backdrop-blur-md shadow-[0_8px_20px_hsl(var(--foreground)/0.08)]"
                style={{ background: suggestionToolbarBg, borderColor: suggestionToolbarBorder }}
                onPointerDown={e => e.stopPropagation()}
                onMouseDown={e => e.stopPropagation()}
                onClick={e => e.stopPropagation()}
              >
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2 py-[5px] text-[11px] font-medium leading-none"
                  style={{ background: suggestionToolbarLabelBg, color: suggestionToolbarLabelFg }}
                >
                  <CalendarDays size={11} />
                  {lang === 'zh' ? `${suggestions.length} 条建议` : `${suggestions.length} suggestions`}
                </span>
                <div
                  className="flex items-center gap-0.5 rounded-full border p-[2px]"
                  style={{ background: suggestionToolbarActionBg, borderColor: suggestionToolbarActionBorder }}
                >
                  <button
                    onPointerDown={e => e.stopPropagation()}
                    onMouseDown={e => e.stopPropagation()}
                    onClick={acceptAllSuggestions}
                    className="flex items-center gap-1 rounded-full px-2 py-[4px] text-[11px] font-medium transition-colors"
                    style={{
                      background: isDarkMode ? 'hsl(150 30% 40% / 0.22)' : 'hsl(150 40% 42% / 0.16)',
                      border: `1px solid ${isDarkMode ? 'hsl(150 32% 55% / 0.40)' : 'hsl(150 38% 40% / 0.38)'}`,
                      color: isDarkMode ? 'hsl(150 45% 68%)' : 'hsl(150 45% 34%)',
                    }}
                  >
                    <Check size={12} />
                    <span>{lang === 'zh' ? '全部接受' : 'Accept all'}</span>
                  </button>
                  <button
                    onPointerDown={e => e.stopPropagation()}
                    onMouseDown={e => e.stopPropagation()}
                    onClick={dismissSuggestions}
                    className="flex items-center gap-1 rounded-full px-2 py-[4px] text-[11px] font-medium text-muted-foreground/85 transition-colors hover:text-foreground"
                    style={{
                      background: isDarkMode ? 'hsl(0 0% 100% / 0.04)' : 'hsl(0 0% 100% / 0.46)',
                      border: `1px solid ${isDarkMode ? 'hsl(0 0% 100% / 0.08)' : 'hsl(24 12% 40% / 0.12)'}`,
                    }}
                  >
                    <X size={12} />
                    <span>{lang === 'zh' ? '取消' : 'Cancel'}</span>
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={handleAutoPlan}
                title={lang === 'zh' ? '按偏好把未排任务填进空隙' : 'Fill gaps with unscheduled tasks'}
                className="flex items-center gap-1 px-2.5 py-[3px] text-[12px] font-medium rounded-full transition-colors backdrop-blur-md shadow-[0_4px_12px_hsl(var(--foreground)/0.05)]"
                style={{
                  background: isDarkMode ? 'hsl(24 40% 50% / 0.16)' : 'hsl(24 55% 48% / 0.10)',
                  border: `1px solid ${isDarkMode ? 'hsl(24 45% 60% / 0.38)' : 'hsl(24 50% 46% / 0.34)'}`,
                  color: isDarkMode ? 'hsl(24 55% 70%)' : 'hsl(24 60% 42%)',
                }}
              >
                <CalendarDays size={13} />
                <span>{lang === 'zh' ? '自动填充' : 'Auto-plan'}</span>
              </button>
            )}
          </div>
        )}
        <div className="flex items-center bg-[hsl(var(--surface-contrast)/0.88)] backdrop-blur-md rounded-full p-[1.5px] shadow-[0_4px_12px_hsl(var(--foreground)/0.05)] border border-border/45 pointer-events-auto">
          {(['plan', 'actual', 'both'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => setDisplayMode(mode)}
              className={cn(
                "px-2.5 py-[3px] text-[12px] font-medium rounded-full transition-all",
                displayMode === mode
                  ? "bg-[hsl(var(--surface-soft))] text-foreground shadow-sm"
                  : "text-muted-foreground/85 hover:text-foreground"
              )}
            >
              {mode === 'plan' ? 'Planned' : mode === 'actual' ? 'Doing' : 'Both'}
            </button>
          ))}
        </div>
      </div>

      {photoLightbox && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-background/94 p-4 backdrop-blur-sm"
          onClick={() => setPhotoLightbox(null)}
        >
          <button
            type="button"
            onClick={() => setPhotoLightbox(null)}
            className="absolute right-4 top-4 z-10 rounded-full bg-background/70 p-2 text-muted-foreground shadow-sm transition-colors hover:text-foreground"
            aria-label="Close photo preview"
          >
            <X size={22} />
          </button>
          <div className="flex max-h-[88vh] max-w-[92vw] flex-col items-center gap-3" onClick={e => e.stopPropagation()}>
            <img
              src={photoLightbox.photos[photoLightbox.index]}
              alt=""
              className="max-h-[78vh] max-w-full rounded-2xl object-contain shadow-2xl"
            />
            {photoLightbox.photos.length > 1 && (
              <div className="flex max-w-full gap-2 overflow-x-auto rounded-full bg-background/75 px-2 py-2 shadow-sm">
                {photoLightbox.photos.map((photo, index) => (
                  <button
                    key={`${photo}-${index}`}
                    type="button"
                    onClick={() => setPhotoLightbox({ ...photoLightbox, index })}
                    className={cn(
                      "h-10 w-10 flex-shrink-0 overflow-hidden rounded-xl border transition-opacity",
                      index === photoLightbox.index ? "border-primary opacity-100" : "border-border/50 opacity-60 hover:opacity-90"
                    )}
                  >
                    <StorageImage src={photo} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
