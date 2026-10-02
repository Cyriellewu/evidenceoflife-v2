import { useState, useEffect, useRef, useCallback } from 'react';
import { Slider } from '@/components/ui/slider';
import { Pause, Play, Square, X, Check, Timer, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Todo } from '@/hooks/useTodos';
import { autoClassifyTag, TAG_CATEGORY_COLORS } from '@/lib/autoTag';
import { useLanguage } from '@/hooks/useLanguage';
import { buildTimerSpanISO } from '@/components/views/today/todayHelpers';

export interface PauseState {
  pausedAt: number | null;
  totalPausedMs: number;
}

// ── Tree growth system ──

const TREE_STAGES = [
  { maxPct: 20, emoji: '🌱', label: 'Seed', labelZh: '种子' },
  { maxPct: 50, emoji: '🌿', label: 'Sprout', labelZh: '嫩芽' },
  { maxPct: 80, emoji: '🌳', label: 'Tree', labelZh: '小树' },
  { maxPct: 101, emoji: '🌲', label: 'Big Tree', labelZh: '大树' },
];

const ACTIVITY_TREES: Record<string, { stages: string[]; color: string }> = {
  study:  { stages: ['🌱', '🌿', '🌲', '🌲'], color: 'hsl(var(--focus-green))' },
  event:  { stages: ['🌱', '🌿', '🌲', '🌲'], color: 'hsl(var(--focus-green))' },
  health: { stages: ['🌱', '🌸', '🌳', '🌳'], color: 'hsl(var(--focus-green))' },
  life:   { stages: ['🌱', '🌿', '🌸', '🌸'], color: 'hsl(var(--focus-green))' },
};

const DEAD_TREE = '🥀';

function colorWithAlpha(color: string, alpha: number): string {
  if (/^#[0-9A-Fa-f]{6}$/.test(color)) {
    return `${color}${Math.round(alpha * 255).toString(16).padStart(2, '0')}`;
  }
  return `color-mix(in srgb, ${color} ${Math.round(alpha * 100)}%, transparent)`;
}

function getTimerColor(tag: string): string {
  return TAG_CATEGORY_COLORS[tag.toLowerCase()] || '#6F7EF7';
}

function getActivityTag(todo: Todo): string {
  if (todo.tags?.length) return todo.tags[0];
  return autoClassifyTag(todo.title) || 'study';
}

function getStartedAtMs(startedAtISO: string | null | undefined, fallback: number): number {
  if (!startedAtISO) return fallback;
  const parsed = new Date(startedAtISO).getTime();
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getTreeEmoji(tag: string, pct: number): string {
  const trees = ACTIVITY_TREES[tag] || ACTIVITY_TREES.study;
  if (pct < 20) return trees.stages[0];
  if (pct < 50) return trees.stages[1];
  if (pct < 80) return trees.stages[2];
  return trees.stages[3];
}

function getTreeStageIndex(pct: number): number {
  if (pct < 20) return 0;
  if (pct < 50) return 1;
  if (pct < 80) return 2;
  return 3;
}

// Default session = 25 min (Pomodoro)
const DEFAULT_SESSION_SEC = 25 * 60;

// ── Focus Timer Overlay ──

interface FocusTimerOverlayProps {
  todo: Todo;
  onMinimize: () => void;
  onComplete: (elapsed: number, progress?: number) => void;
  onSaveAndContinue: (elapsed: number, progress?: number) => void;
  onFinishAt?: (elapsed: number, progress: number, completed: boolean, endedAtISO: string) => void;
  onCancel: () => void;
  pauseState?: PauseState;
  onPauseStateChange?: (pauseState: PauseState) => void;
  onUpdateStartTime?: (newStartedAt: string) => void;
  onUpdateEndTime?: (newEndedAt: string) => void;
  previewMode?: boolean;
  previewElapsedSec?: number;
  accentColor?: string;
}

export function FocusTimerOverlay({
  todo,
  onMinimize,
  onComplete,
  onSaveAndContinue,
  onFinishAt,
  onCancel,
  pauseState: externalPauseState,
  onPauseStateChange,
  onUpdateStartTime,
  onUpdateEndTime,
  previewMode = false,
  previewElapsedSec = 0,
  accentColor,
}: FocusTimerOverlayProps) {
  const { lang, t } = useLanguage();
  const [localPauseState, setLocalPauseState] = useState<PauseState>(externalPauseState ?? { pausedAt: null, totalPausedMs: 0 });
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [showStopConfirm, setShowStopConfirm] = useState(false);
  const [showDeath, setShowDeath] = useState(false);
  const [stageAnimating, setStageAnimating] = useState(false);
  const [editingStart, setEditingStart] = useState(false);
  const [startTimeInput, setStartTimeInput] = useState('');
  const [forgottenEndInput, setForgottenEndInput] = useState('');
  // Which calendar day the forgotten-timer end lands on, expressed as "days
  // ago" (0 = today, 1 = yesterday …). null = follow the default (the day the
  // session started). Lets the user correct the end day when the auto-derived
  // one is wrong, instead of being locked to the session-start day.
  const [endDayOffset, setEndDayOffset] = useState<number | null>(null);
  const pauseState = externalPauseState ?? localPauseState;
  const isPaused = pauseState.pausedAt !== null;
  const mountTimeRef = useRef(Date.now());
  const fallbackStartedAtRef = useRef(Date.now());

  const tag = getActivityTag(todo);
  const treeColor = accentColor || getTimerColor(tag);

  useEffect(() => {
    const interval = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const now = Date.now();
    fallbackStartedAtRef.current = now;
    mountTimeRef.current = now;
    setNowMs(now);
    // This overlay instance can be reused when the user switches between
    // concurrent timers. Never carry one timer's local Rest state into the
    // next timer when that timer has no persisted pause state of its own.
    setLocalPauseState(externalPauseState ?? { pausedAt: null, totalPausedMs: 0 });
  }, [todo.id]);

  useEffect(() => {
    if (!externalPauseState) return;
    setLocalPauseState(externalPauseState);
  }, [externalPauseState?.pausedAt, externalPauseState?.totalPausedMs]);

  const updatePauseState = useCallback((next: PauseState) => {
    setLocalPauseState(next);
    onPauseStateChange?.(next);
  }, [onPauseStateChange]);

  // accumulatedSec = total time logged across PREVIOUS focus sessions on this task.
  // It is intentionally NOT folded into the session timer — each focus session is
  // a discrete pomodoro cycle. The accumulated total shows up only as quiet context.
  const accumulatedSec = previewMode ? 0 : Math.max(0, todo.timer_seconds || 0);
  const startedAt = previewMode
    ? fallbackStartedAtRef.current
    : getStartedAtMs(todo.timer_started_at, fallbackStartedAtRef.current);
  const now = nowMs;
  const rawElapsed = previewMode ? 0 : now - startedAt;
  const currentPauseMs = isPaused ? (now - pauseState.pausedAt!) : 0;
  const totalPaused = pauseState.totalPausedMs + currentPauseMs;
  const workingMs = Math.max(0, rawElapsed - totalPaused);
  // Only cap during the first 2s for freshly started timers (prevents DB round-trip flash).
  // For ongoing timers being resumed, skip the cap so elapsed shows correctly immediately.
  const mountElapsed = now - mountTimeRef.current;
  const cappedWorkingMs = (mountElapsed < 2000 && rawElapsed < 10000) ? Math.min(workingMs, mountElapsed + 500) : workingMs;
  // sessionDisplaySec = current focus session only (resets on each new "Focus" press).
  // sessionWorkingSec = same value, just without the mount-cap, used for DB writes.
  const sessionDisplaySec = previewMode ? previewElapsedSec : Math.floor(cappedWorkingMs / 1000);
  const sessionWorkingSec = previewMode ? previewElapsedSec : Math.floor(workingMs / 1000);
  const restSec = isPaused ? Math.floor(currentPauseMs / 1000) : 0;
  const startedDate = Number.isFinite(startedAt) ? new Date(startedAt) : null;
  const crossedDay = startedDate ? startedDate.toDateString() !== new Date().toDateString() : false;
  const looksForgotten = !previewMode && !isPaused && (sessionWorkingSec >= 4 * 3600 || crossedDay);
  const suggestedEndDate = (() => {
    if (!startedDate) return null;
    const plannedEnd = todo.plan_ended_at ? new Date(todo.plan_ended_at) : null;
    // Only trust the planned end when it sits on the SAME calendar day the
    // session actually started. A timer forgotten overnight gets its plan
    // window rolled forward to today by rollOverYesterdayTodos, so an
    // unguarded plan end would wrongly suggest "today" for yesterday's work.
    if (
      plannedEnd &&
      plannedEnd.getTime() > startedAt &&
      plannedEnd.getTime() < Date.now() &&
      plannedEnd.toDateString() === startedDate.toDateString()
    ) {
      return plannedEnd;
    }
    return new Date(startedAt + DEFAULT_SESSION_SEC * 1000);
  })();
  const suggestedEndLabel = suggestedEndDate
    ? `${String(suggestedEndDate.getHours()).padStart(2, '0')}:${String(suggestedEndDate.getMinutes()).padStart(2, '0')}`
    : null;
  // How many calendar days behind "today" the session start sits. We use this
  // (not raw elapsed hours) so the UI can label the suggested end time with
  // "Yesterday" / "N days ago" instead of an ambiguous bare HH:mm.
  const startedDaysAgo = (() => {
    if (!startedDate) return 0;
    const start = new Date(startedDate.getFullYear(), startedDate.getMonth(), startedDate.getDate()).getTime();
    const today = new Date();
    const todayKey = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    return Math.max(0, Math.round((todayKey - start) / 86400000));
  })();
  const dayOffsetLabel = (() => {
    if (startedDaysAgo <= 0) return null;
    if (lang === 'zh') return startedDaysAgo === 1 ? '昨天' : `${startedDaysAgo} 天前`;
    return startedDaysAgo === 1 ? 'Yesterday' : `${startedDaysAgo} days ago`;
  })();
  // Human label for an arbitrary "days ago" offset — drives the editable end-day
  // stepper (0 = today, 1 = yesterday, N = N days ago).
  const dayLabelForOffset = (offset: number) => {
    if (offset <= 0) return lang === 'zh' ? '今天' : 'Today';
    if (lang === 'zh') return offset === 1 ? '昨天' : `${offset} 天前`;
    return offset === 1 ? 'Yesterday' : `${offset} days ago`;
  };
  // The effective end day: user override when set, else the session-start day.
  // Clamped to [0, startedDaysAgo] so the end can never be earlier than the day
  // the timer started nor later than today.
  const effectiveEndDayOffset = Math.min(
    startedDaysAgo,
    Math.max(0, endDayOffset ?? startedDaysAgo)
  );
  const suggestedEndElapsedSec = suggestedEndDate && Number.isFinite(startedAt)
    ? Math.max(60, Math.floor((suggestedEndDate.getTime() - startedAt - totalPaused) / 1000))
    : DEFAULT_SESSION_SEC;

  // Progress + tree growth tied to the CURRENT session only — one pomodoro cycle.
  // Each new "Focus" press starts a fresh seed → tree growth, no carry-over.
  const progressPct = Math.min(100, (sessionDisplaySec / DEFAULT_SESSION_SEC) * 100);
  const currentStage = getTreeStageIndex(progressPct);
  const prevStageRef = useRef(currentStage);
  const treeEmoji = getTreeEmoji(tag, progressPct);

  // Detect stage change for animation
  useEffect(() => {
    if (currentStage !== prevStageRef.current) {
      prevStageRef.current = currentStage;
      setStageAnimating(true);
      const t = setTimeout(() => setStageAnimating(false), 500);
      return () => clearTimeout(t);
    }
  }, [currentStage]);

  const pad = (n: number) => String(n).padStart(2, '0');
  // Big timer display = current focus session, never the lifetime sum.
  const hrs = Math.floor(sessionDisplaySec / 3600);
  const mins = Math.floor((sessionDisplaySec % 3600) / 60);
  const secs = sessionDisplaySec % 60;

  // Quiet "previously" indicator — shows the total time already logged on this
  // task across earlier Continue Later sessions. Only appears when relevant.
  const accumulatedLabel = (() => {
    if (accumulatedSec < 30) return null;
    const aH = Math.floor(accumulatedSec / 3600);
    const aM = Math.floor((accumulatedSec % 3600) / 60);
    if (aH > 0) return aM > 0 ? `${aH}h ${aM}m` : `${aH}h`;
    return `${aM}m`;
  })();

  // Progress ring geometry
  const ringR = 88;
  const ringCx = 96;
  const ringCy = 96;
  const circumference = 2 * Math.PI * ringR;
  const dashOffset = circumference * (1 - progressPct / 100);

  const handlePauseResume = useCallback(() => {
    updatePauseState((() => {
      const prev = pauseState;
      if (prev.pausedAt !== null) {
        const pausedDuration = Date.now() - prev.pausedAt;
        return { pausedAt: null, totalPausedMs: prev.totalPausedMs + pausedDuration };
      } else {
        return { ...prev, pausedAt: Date.now() };
      }
    })());
  }, [pauseState, updatePauseState]);

  // Slider: when continuing a task that already has partial progress, seed from
  // that value so "Record / Complete" reflects where you left off — defaulting
  // to 100% made continue sessions look like progress was wiped. Fresh tasks
  // still default to 100% (untouched) so one-tap Complete stays frictionless.
  const seedCompletion = (progress: number | null | undefined) => {
    const p = Math.max(0, Math.min(100, progress || 0));
    if (p > 0 && p < 100) return { value: p, touched: true as const };
    return { value: 100, touched: false as const };
  };
  const [completionProgress, setCompletionProgress] = useState(() => seedCompletion(todo.progress).value);
  const [progressTouched, setProgressTouched] = useState(() => seedCompletion(todo.progress).touched);

  useEffect(() => {
    const seeded = seedCompletion(todo.progress);
    setCompletionProgress(seeded.value);
    setProgressTouched(seeded.touched);
    setForgottenEndInput('');
    setEndDayOffset(null);
    setShowStopConfirm(false);
  }, [todo.id]);

  // Seed the forgotten-timer editor with the suggested HH:mm whenever the
  // suggestion is available and the user hasn't typed their own value yet.
  // Re-seeds when the suggestion changes (e.g. plan window updated) but never
  // clobbers a value the user is currently editing.
  useEffect(() => {
    if (!suggestedEndLabel) return;
    setForgottenEndInput((prev) => (prev ? prev : suggestedEndLabel));
  }, [suggestedEndLabel]);

  // Partial slider (< 100%) → primary becomes "Record" and saves progress without
  // completing. At 100% (default), "Complete" still means fully done.
  const isRecordingPartial = progressTouched && completionProgress < 100;

  const handleComplete = useCallback(() => {
    onComplete(sessionWorkingSec, 100);
  }, [onComplete, sessionWorkingSec]);

  // 阶段性结束 / Record：保存本段计入历史、结束本轮计时器，任务仍开放。进度封顶 99%
  // （与「完成任务」区分开）。若用户没动滑块，保留任务原有进度，避免凭空抬到 99%。
  const handleContinueLater = useCallback(() => {
    const nextProgress = progressTouched
      ? Math.min(99, completionProgress)
      : Math.max(0, Math.min(99, todo.progress || 0));
    onSaveAndContinue(sessionWorkingSec, nextProgress);
  }, [completionProgress, progressTouched, todo.progress, onSaveAndContinue, sessionWorkingSec]);

  const handlePrimaryEndAction = useCallback(() => {
    if (isRecordingPartial) handleContinueLater();
    else handleComplete();
  }, [isRecordingPartial, handleContinueLater, handleComplete]);

  const handleFinishAtSuggestion = useCallback((completed: boolean) => {
    if (!onFinishAt || !startedDate) return;
    // Resolve the actual end the user committed to. The end date is anchored to
    // the day the user picked in the stepper (effectiveEndDayOffset: 0 = today,
    // 1 = yesterday …) at the typed HH:mm. If that lands on/before the start
    // (e.g. an overnight session where the end clock time is earlier than the
    // start), roll forward one day. Falls back to the auto-suggestion when the
    // input is empty or unusable.
    const trimmed = forgottenEndInput.trim();
    let chosenEndDate: Date | null = null;
    const hm = /^(\d{1,2}):(\d{2})$/.exec(trimmed);
    if (hm) {
      const hours = Number(hm[1]);
      const minutes = Number(hm[2]);
      if (hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) {
        const end = new Date();
        end.setDate(end.getDate() - effectiveEndDayOffset);
        end.setHours(hours, minutes, 0, 0);
        // Overnight guard: an end that isn't strictly after the start belongs to
        // the next calendar day (only rolled once — a further mismatch means the
        // input is invalid and we fall back to the suggestion).
        if (end.getTime() <= startedAt) end.setDate(end.getDate() + 1);
        if (end.getTime() > startedAt) chosenEndDate = end;
      }
    }
    if (!chosenEndDate) chosenEndDate = suggestedEndDate;
    if (!chosenEndDate) return;

    const chosenElapsedSec = Math.max(
      60,
      Math.floor((chosenEndDate.getTime() - startedAt - totalPaused) / 1000)
    );

    // When NOT completing (e.g. closing a forgotten timer), never fabricate a
    // 100%-but-unfinished state from the default slider — that muddies the
    // resume gating. Keep the task's existing progress unless the user dragged
    // the slider, and cap at 99% to stay distinct from "complete".
    const nextProgress = completed
      ? 100
      : progressTouched
        ? Math.min(99, completionProgress)
        : Math.max(0, Math.min(99, todo.progress || 0));
    onFinishAt(chosenElapsedSec, nextProgress, completed, chosenEndDate.toISOString());
  }, [
    completionProgress,
    progressTouched,
    todo.progress,
    onFinishAt,
    suggestedEndDate,
    forgottenEndInput,
    effectiveEndDayOffset,
    startedDate,
    startedAt,
    totalPaused,
  ]);

  // Checking the editable "Ends at HH:mm" must actually STOP the timer at that
  // time — not merely tweak plan_ended_at while the clock keeps running. We end
  // the session at the chosen moment (logging it via onFinishAt), mirroring the
  // forgotten-timer flow's end-at logic so an overnight HH:mm rolls forward
  // instead of jumping to today.
  const handleStopAtEndTime = useCallback((hm: string) => {
    const trimmed = hm.trim();
    if (!trimmed || !startedDate) return;
    const anchorISO = todo.timer_started_at
      ?? (Number.isFinite(startedAt) ? new Date(startedAt).toISOString() : null);
    if (!anchorISO) return;
    const startHM = `${String(startedDate.getHours()).padStart(2, '0')}:${String(startedDate.getMinutes()).padStart(2, '0')}`;
    const fallbackDateStr = `${startedDate.getFullYear()}-${String(startedDate.getMonth() + 1).padStart(2, '0')}-${String(startedDate.getDate()).padStart(2, '0')}`;
    const span = buildTimerSpanISO(startHM, trimmed, { anchorISO, fallbackDateStr });
    if (!span) return;
    const endDate = new Date(span.endISO);
    const elapsedSec = Math.max(60, Math.floor((endDate.getTime() - startedAt - totalPaused) / 1000));
    if (onFinishAt) {
      const nextProgress = progressTouched
        ? Math.min(99, completionProgress)
        : Math.max(0, Math.min(99, todo.progress || 0));
      onFinishAt(elapsedSec, nextProgress, false, endDate.toISOString());
    } else if (onUpdateEndTime) {
      onUpdateEndTime(endDate.toISOString());
    }
  }, [
    todo.timer_started_at,
    todo.progress,
    startedAt,
    startedDate,
    totalPaused,
    onFinishAt,
    onUpdateEndTime,
    completionProgress,
    progressTouched,
  ]);

  const handleCancel = useCallback(() => {
    setShowDeath(true);
    setTimeout(() => {
      onCancel();
    }, 1500);
  }, [onCancel]);

  // Death screen
  if (showDeath) {
    return (
      <div className="fixed inset-0 z-[80] bg-[hsl(var(--surface-contrast))]/92 backdrop-blur-md flex flex-col items-center justify-center gap-6 animate-fade-in">
        <div className="text-7xl opacity-60">{DEAD_TREE}</div>
        <p className="text-sm text-muted-foreground/60">
          {lang === 'zh' ? '专注被中断了...' : 'Session interrupted...'}
        </p>
      </div>
    );
  }

  const stageInfo = TREE_STAGES[currentStage];

  // Worked-so-far label for quiet context on the rest screen.
  const workedLabel = (() => {
    const wH = Math.floor(sessionDisplaySec / 3600);
    const wM = Math.floor((sessionDisplaySec % 3600) / 60);
    if (wH > 0) return wM > 0 ? `${wH}h ${wM}m` : `${wH}h`;
    return `${wM}m`;
  })();

  // ── Dedicated REST screen ──
  // When paused, the focus chrome (ring, tree, stop/complete flow) is the wrong
  // mental model — the user is taking a breather, not finishing. Render a calm,
  // breathing rest card instead: big break time, one obvious Resume action.
  if (isPaused && !previewMode) {
    return (
      <div
        className="fixed inset-0 z-[80] cursor-pointer overflow-hidden animate-fade-in backdrop-blur-md"
        style={{ backgroundColor: 'hsl(var(--overlay-backdrop))' }}
        onClick={() => onMinimize()}
      >
        <div className="absolute inset-0 pointer-events-none">
          <div
            className="absolute left-1/2 top-1/2 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
            style={{ backgroundColor: colorWithAlpha(treeColor, 0.06) }}
          />
        </div>

        <div className="relative z-10 flex min-h-full items-center justify-center px-4 py-6 sm:px-6 sm:py-8">
          <div
            className="w-full max-w-[360px] rounded-[32px] border border-border/60 bg-[hsl(var(--surface-contrast)/0.97)] px-6 py-8 shadow-[0_18px_54px_hsl(var(--foreground)/0.15)] backdrop-blur-xl sm:max-w-[376px]"
            onClick={e => e.stopPropagation()}
          >
            {/* Eyebrow */}
            <div className="flex items-center justify-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ backgroundColor: treeColor }} />
                <span className="relative inline-flex h-2 w-2 rounded-full" style={{ backgroundColor: treeColor }} />
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-[0.28em] text-muted-foreground/55">
                {lang === 'zh' ? '休息中' : 'On a break'}
              </span>
            </div>

            {/* Breathing circle with the rest time at its heart */}
            <div className="mt-7 flex justify-center">
              <div className="relative flex h-[180px] w-[180px] items-center justify-center">
                {/* breathing rings */}
                <span
                  className="absolute inset-0 rounded-full border"
                  style={{ borderColor: colorWithAlpha(treeColor, 0.18), animation: 'breathe 4s ease-in-out infinite' }}
                />
                <span
                  className="absolute inset-[14px] rounded-full border"
                  style={{ borderColor: colorWithAlpha(treeColor, 0.12), animation: 'breathe 4s ease-in-out infinite 0.4s' }}
                />
                <div
                  className="absolute inset-[26px] rounded-full"
                  style={{ background: `radial-gradient(circle at 50% 45%, ${colorWithAlpha(treeColor, 0.14)}, transparent 70%)` }}
                />
                <div className="relative z-10 flex flex-col items-center">
                  <span className="font-mono text-[40px] font-light leading-none tabular-nums tracking-[0.02em] text-foreground/90">
                    {pad(Math.floor(restSec / 60))}:{pad(restSec % 60)}
                  </span>
                  <span className="mt-2 text-[11px] tracking-[0.05em] text-muted-foreground/50">
                    {lang === 'zh' ? '已休息' : 'resting'}
                  </span>
                </div>
              </div>
            </div>

            {/* Task context — quiet, the break is the focus now */}
            <div className="mt-6 text-center">
              <p className="text-[13px] font-medium leading-snug text-foreground/80">
                {todo.title}
              </p>
              <p className="mt-1.5 text-[11px] tabular-nums text-muted-foreground/45">
                {lang === 'zh' ? `本次已专注 ${workedLabel}` : `${workedLabel} focused so far`}
                {accumulatedLabel && (lang === 'zh' ? ` · 累计 ${accumulatedLabel}` : ` · ${accumulatedLabel} total`)}
              </p>
            </div>

            {/* Resume — the one obvious action */}
            <button
              onClick={handlePauseResume}
              className="mt-7 flex h-14 w-full items-center justify-center gap-2.5 rounded-full text-[15px] font-semibold text-white/95 transition-all hover:brightness-[0.97] active:brightness-[0.93]"
              style={{
                backgroundColor: treeColor,
                boxShadow: `0 6px 20px ${colorWithAlpha(treeColor, 0.32)}`,
              }}
            >
              <Play size={18} className="fill-current" />
              {lang === 'zh' ? '继续专注' : 'Resume focus'}
            </button>

            {/* Secondary actions — calm, low-emphasis */}
            <div className="mt-3 flex items-center justify-center gap-5">
              <button
                onClick={() => onMinimize()}
                className="text-[12px] font-medium text-muted-foreground/55 transition-colors hover:text-foreground/75"
              >
                {lang === 'zh' ? '收起' : 'Minimize'}
              </button>
              <span className="h-3 w-px bg-border/60" />
              <button
                onClick={handleCancel}
                className="text-[12px] font-medium text-destructive/55 transition-colors hover:text-destructive/80"
              >
                {lang === 'zh' ? '放弃本次' : 'Discard'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }


  return (
    <div
      className="fixed inset-0 z-[80] cursor-pointer overflow-hidden animate-fade-in backdrop-blur-md"
      style={{ backgroundColor: 'hsl(var(--overlay-backdrop))' }}
      onClick={() => onMinimize()}
    >
      <div className="absolute inset-0 opacity-35 pointer-events-none">
        <div className="absolute left-1/2 top-[18%] h-48 w-48 -translate-x-1/2 rounded-full blur-3xl" style={{ backgroundColor: colorWithAlpha(treeColor, 0.09) }} />
        <div className="absolute left-1/2 top-[54%] h-64 w-64 -translate-x-1/2 rounded-full border border-border/20" />
      </div>

      <div className="relative z-10 flex min-h-full items-center justify-center px-3 py-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-8">
        <div
          className="max-h-[calc(100dvh-1.5rem)] w-full max-w-[min(100%,360px)] overflow-y-auto overscroll-contain rounded-[28px] border border-border/70 bg-[hsl(var(--surface-contrast)/0.98)] px-3.5 py-4 shadow-[0_18px_54px_hsl(var(--foreground)/0.13)] backdrop-blur-xl sm:max-h-[calc(100vh-3rem)] sm:max-w-[376px] sm:rounded-[32px] sm:px-5 sm:py-5"
          onClick={e => e.stopPropagation()}
        >
          <div className="text-center">
            <p className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground/52">
              {isPaused
                ? (lang === 'zh' ? '已暂停' : 'Paused')
                : accumulatedSec > 0
                  ? t('focus.overlayContinuing')
                  : t('focus.overlayFocusing')}
            </p>

            <div className="mt-2.5 flex items-center justify-center gap-2 sm:mt-3">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: treeColor }} />
              <span className="rounded-full bg-[hsl(var(--surface-soft))] px-3 py-1 text-[11px] font-medium capitalize text-[hsl(var(--text-soft))] shadow-[inset_0_0_0_1px_hsl(var(--border)/0.7)]">
                {tag}
              </span>
            </div>

            <h2 className="mx-auto mt-3 max-w-[280px] text-balance text-[16px] font-semibold leading-snug tracking-[-0.02em] text-foreground line-clamp-2 sm:mt-4 sm:max-w-[300px] sm:text-[20px] sm:leading-[1.2] sm:tracking-[-0.03em] sm:line-clamp-none">
              {todo.title}
            </h2>
          </div>

          {/* Compact chrome once the end/progress panel is open — the big ring
              ate the whole phone viewport and hid Complete / Back actions. */}
          {showStopConfirm ? (
            <div className="mt-3 flex items-center justify-center gap-2 rounded-2xl border border-border/45 bg-[hsl(var(--surface-soft))] px-3 py-2">
              <span className="text-[22px] leading-none">{treeEmoji}</span>
              <span className="font-mono text-[16px] font-light tabular-nums tracking-[0.02em] text-foreground/80">
                {pad(hrs)}:{pad(mins)}:{pad(secs)}
              </span>
              <span className="text-[10px] text-muted-foreground/55">· {Math.round(progressPct)}%</span>
            </div>
          ) : (
          <div className="mt-3.5 flex justify-center sm:mt-5">
            <div className="relative flex h-[132px] w-[132px] items-center justify-center rounded-full bg-[hsl(var(--surface-soft))] shadow-[inset_0_0_0_1px_hsl(var(--border)/0.55)] sm:h-[172px] sm:w-[172px]">
              <svg width={122} height={122} viewBox="4 4 184 184" className="absolute inset-1/2 -translate-x-1/2 -translate-y-1/2 sm:h-[160px] sm:w-[160px]" style={{ transform: 'translate(-50%, -50%) rotate(-90deg)' }}>
                <circle cx={ringCx} cy={ringCy} r={ringR} fill="none" stroke="hsl(var(--focus-track))" strokeWidth={7} />
                <circle
                  cx={ringCx}
                  cy={ringCy}
                  r={ringR}
                  fill="none"
                  stroke={treeColor}
                  strokeWidth={7}
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={dashOffset}
                  className="transition-all duration-1000"
                  style={{ opacity: 0.9 }}
                />
              </svg>

              <div className="relative z-10 flex flex-col items-center">
                <span
                  className={cn(
                    "text-[32px] leading-none transition-transform duration-500 sm:text-[44px]",
                    stageAnimating && "animate-scale-in",
                    isPaused && "opacity-45 grayscale"
                  )}
                >
                  {treeEmoji}
                </span>
                <span className="mt-1.5 font-mono text-[20px] font-light tabular-nums tracking-[0.03em] text-foreground/78 sm:mt-2 sm:text-[24px]">
                  {pad(hrs)}:{pad(mins)}:{pad(secs)}
                </span>
                <div className="mt-1 flex items-center gap-2 text-[10px] text-[hsl(var(--text-soft))]">
                  <span>{lang === 'zh' ? stageInfo.labelZh : stageInfo.label}</span>
                  <span>·</span>
                  <span title={lang === 'zh' ? '本轮专注' : 'This session'}>{Math.round(progressPct)}%</span>
                  {(todo.progress || 0) > 0 && (todo.progress || 0) < 100 && (
                    <>
                      <span>·</span>
                      <span className="font-medium text-foreground/55" title={lang === 'zh' ? '任务总进度' : 'Task progress'}>
                        {lang === 'zh' ? '任务' : 'task'} {Math.round(todo.progress || 0)}%
                      </span>
                    </>
                  )}
                  {isPaused && (
                    <>
                      <span>·</span>
                      <span>{lang === 'zh' ? '暂停' : 'Rest'} {pad(Math.floor(restSec / 60))}:{pad(restSec % 60)}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
          )}

          {/* Quiet "previously" hint — surfaces only when this task already has
              prior focus sessions. Confirms continuity ("you've spent Xh on
              this before") without inflating the live session timer. */}
          {!showStopConfirm && accumulatedLabel && (
            <div className="mt-2 flex items-center justify-center">
              <span className="font-mono text-[10px] tabular-nums tracking-[0.08em] text-muted-foreground/45">
                {lang === 'zh' ? `之前累计 ${accumulatedLabel}` : `Previously ${accumulatedLabel}`}
              </span>
            </div>
          )}

          {/* Adjustable end time */}
          {!showStopConfirm && !previewMode && (onUpdateEndTime || onUpdateStartTime) && todo.timer_started_at && (
            <div className="mt-3 flex justify-center" onClick={e => e.stopPropagation()}>
              {(() => {
                const endTime = todo.plan_ended_at
                  ? new Date(todo.plan_ended_at)
                  : null;
                const endDisplay = endTime
                  ? `${String(endTime.getHours()).padStart(2,'0')}:${String(endTime.getMinutes()).padStart(2,'0')}`
                  : null;
                return editingStart ? (
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-muted-foreground/55">{lang === 'zh' ? '结束于' : 'Ends at'}</span>
                    <input
                      type="time"
                      autoFocus
                      defaultValue={endDisplay ?? (() => {
                        const d = new Date(todo.timer_started_at as string);
                        return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
                      })()}
                      onChange={e => setStartTimeInput(e.target.value)}
                      className="font-mono text-[12px] bg-[hsl(var(--surface-soft))] border border-border rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary/40"
                    />
                    <button
                      className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/12 text-primary hover:bg-primary/20"
                      onClick={() => {
                        // Confirming the end time STOPS the timer at that moment
                        // (ends + records the session), rather than silently
                        // editing plan_ended_at while the clock keeps ticking.
                        handleStopAtEndTime(startTimeInput || endDisplay || '');
                        setEditingStart(false);
                      }}
                    >
                      <Check size={11} />
                    </button>
                    <button
                      className="flex h-6 w-6 items-center justify-center rounded-full bg-muted/60 text-muted-foreground hover:bg-muted"
                      onClick={() => setEditingStart(false)}
                    >
                      <X size={11} />
                    </button>
                  </div>
                ) : (
                  <button
                    className="flex items-center gap-1.5 text-[11px] text-muted-foreground/45 hover:text-muted-foreground/70 transition-colors"
                    onClick={() => setEditingStart(true)}
                  >
                    <Timer size={11} />
                    <span>{lang === 'zh' ? '结束于' : 'Ends at'} {endDisplay ?? '--:--'}</span>
                  </button>
                );
              })()}
            </div>
          )}

          {!showStopConfirm && looksForgotten && suggestedEndLabel && onFinishAt && (
            <div className="mt-3 rounded-2xl border border-border/55 bg-[hsl(var(--surface-soft))] px-3 py-2.5 text-left sm:mt-4 sm:px-3.5 sm:py-3">
              <p className="flex items-start gap-2 text-[12px] font-semibold leading-snug tracking-[-0.01em] text-foreground/85">
                <span aria-hidden className="mt-1.5 inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full bg-destructive/70" />
                <span className="min-w-0">
                  {lang === 'zh'
                    ? dayOffsetLabel
                      ? `可能从${dayOffsetLabel}起忘了结束`
                      : '可能忘记结束了'
                    : dayOffsetLabel
                      ? `Left running since ${dayOffsetLabel.toLowerCase()}`
                      : 'Maybe left running'}
                </span>
              </p>
              {/* Phone: stack label / day / time so nothing clips in one row. */}
              <div
                className="mt-2 flex flex-col gap-2 sm:mt-1.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2"
                onClick={e => e.stopPropagation()}
              >
                <span className="text-[11px] text-muted-foreground">{lang === 'zh' ? '结束于' : 'End at'}</span>
                <div className="flex min-w-0 items-center gap-2">
                  {startedDaysAgo > 0 && (
                    <span className="inline-flex min-w-0 flex-1 items-center justify-between gap-0.5 rounded-full bg-secondary px-1 py-0.5 sm:flex-none sm:justify-center sm:px-1 sm:py-[1px]">
                      <button
                        type="button"
                        onClick={() => setEndDayOffset(Math.min(startedDaysAgo, effectiveEndDayOffset + 1))}
                        disabled={effectiveEndDayOffset >= startedDaysAgo}
                        className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground sm:h-5 sm:w-5"
                        aria-label={lang === 'zh' ? '往前一天' : 'Earlier day'}
                      >
                        <ChevronLeft size={14} />
                      </button>
                      <span className="min-w-0 flex-1 truncate px-1 text-center text-[11px] font-semibold uppercase tracking-[0.04em] text-muted-foreground sm:min-w-[46px] sm:flex-none sm:text-[10px]">
                        {dayLabelForOffset(effectiveEndDayOffset)}
                      </span>
                      <button
                        type="button"
                        onClick={() => setEndDayOffset(Math.max(0, effectiveEndDayOffset - 1))}
                        disabled={effectiveEndDayOffset <= 0}
                        className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground sm:h-5 sm:w-5"
                        aria-label={lang === 'zh' ? '往后一天' : 'Later day'}
                      >
                        <ChevronRight size={14} />
                      </button>
                    </span>
                  )}
                  <input
                    type="time"
                    value={forgottenEndInput}
                    onChange={e => setForgottenEndInput(e.target.value)}
                    className="h-8 min-w-0 flex-[0.9] rounded-lg border border-border/55 bg-[hsl(var(--surface-contrast))] px-2 py-0.5 font-mono text-[13px] tabular-nums text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 sm:h-auto sm:flex-none sm:text-[12px]"
                  />
                </div>
              </div>
              <p className="mt-1.5 text-[11px] leading-5 text-muted-foreground/65">
                {lang === 'zh' ? '也可以继续计时。' : 'Or keep it running.'}
              </p>
              <div className="mt-2">
                <button
                  onClick={() => handleFinishAtSuggestion(true)}
                  className="flex h-10 w-full flex-col items-center justify-center rounded-full bg-primary px-3 text-primary-foreground transition-colors hover:brightness-105 sm:h-8 sm:flex-row sm:gap-1.5"
                >
                  <span className="text-[12px] font-semibold leading-none sm:text-[11px]">
                    {lang === 'zh' ? '完成于' : 'Complete'}
                  </span>
                  <span className="mt-0.5 max-w-full truncate text-[11px] font-medium tabular-nums leading-none opacity-90 sm:mt-0">
                    {startedDaysAgo > 0 ? `${dayLabelForOffset(effectiveEndDayOffset)} ` : ''}
                    {forgottenEndInput || suggestedEndLabel}
                  </span>
                </button>
              </div>
            </div>
          )}

          <div className="mt-3 sm:mt-4" onClick={e => e.stopPropagation()}>
            {!showStopConfirm ? (
              <div className="space-y-3">
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-3">
                  <button
                    onClick={handlePauseResume}
                    className="flex h-10 items-center justify-center gap-1.5 rounded-2xl border border-border bg-[hsl(var(--surface-contrast))] text-foreground/72 transition-colors hover:bg-[hsl(var(--surface-soft-hover))] sm:h-11 sm:gap-2"
                  >
                    {isPaused ? <Play size={16} /> : <Pause size={16} />}
                    <span className="text-[12px] font-medium">{isPaused ? (lang === 'zh' ? '继续' : 'Resume') : (lang === 'zh' ? '暂停' : 'Pause')}</span>
                  </button>
                  <button
                    onClick={() => setShowStopConfirm(true)}
                    className="flex h-10 w-10 items-center justify-center rounded-full text-white shadow-[0_4px_14px_hsl(var(--foreground)/0.12)] transition-[filter] hover:brightness-[1.06] sm:h-11 sm:w-11"
                    style={{ backgroundColor: treeColor }}
                    title="Stop"
                  >
                    <Square size={15} className="fill-current" />
                  </button>
                  <button
                    onClick={handleCancel}
                    className="flex h-10 items-center justify-center gap-1.5 rounded-2xl border border-destructive/18 bg-[hsl(var(--surface-contrast))] text-destructive/72 transition-colors hover:bg-destructive/8 sm:h-11 sm:gap-2"
                    title="Cancel timer"
                  >
                    <X size={16} />
                    <span className="text-[12px] font-medium">{lang === 'zh' ? '取消' : 'Cancel'}</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="rounded-[22px] border border-border/60 bg-[hsl(var(--surface-soft)/0.72)] p-2.5 shadow-[inset_0_1px_0_hsl(var(--surface-contrast)/0.5)] sm:rounded-[24px] sm:p-3">
                {/* Back affordance — a mis-tapped stop must never trap the user
                    in the end panel. This returns to the live timer untouched. */}
                <button
                  type="button"
                  onClick={() => setShowStopConfirm(false)}
                  className="mb-2 flex items-center gap-1 rounded-full px-1.5 py-1 text-[11px] font-medium text-muted-foreground/60 transition-colors hover:text-foreground/80"
                >
                  <ChevronLeft size={14} />
                  <span>{lang === 'zh' ? '返回计时' : 'Back to timer'}</span>
                </button>
                <div className="rounded-[18px] border border-border/60 bg-[hsl(var(--surface-contrast)/0.78)] px-3.5 py-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-[0.14em] text-[hsl(var(--text-soft))]">
                      {lang === 'zh' ? '完成进度' : 'Progress'}
                    </span>
                    <span className={cn(
                      'font-mono text-[11px] tabular-nums transition-colors',
                      progressTouched ? 'text-foreground/80' : 'text-muted-foreground/40',
                    )}>
                      {completionProgress}%
                    </span>
                  </div>
                  <Slider
                    value={[completionProgress]}
                    onValueChange={([v]) => { setCompletionProgress(v); setProgressTouched(true); }}
                    max={100}
                    step={5}
                    style={{ ['--slider-range' as string]: treeColor }}
                    className={cn('mt-2 w-full transition-opacity', progressTouched ? 'opacity-100' : 'opacity-45')}
                  />
                </div>
                <p className="mt-2 px-0.5 text-center text-[10px] leading-relaxed text-muted-foreground/50">
                  {isRecordingPartial ? t('focus.recordProgressHint') : t('focus.endPhaseHint')}
                </p>
                <div className={cn('mt-2.5 gap-2', isRecordingPartial ? 'flex' : 'grid grid-cols-2')}>
                  {!isRecordingPartial && (
                    <button
                      type="button"
                      onClick={handleContinueLater}
                      className="flex h-11 w-full items-center justify-center rounded-full border border-border/55 bg-[hsl(var(--surface-contrast)/0.85)] px-3 text-[12.5px] font-medium tracking-[-0.005em] text-foreground/70 transition-colors hover:bg-[hsl(var(--surface-contrast))] hover:text-foreground/85"
                    >
                      {t('focus.endPhase')}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handlePrimaryEndAction}
                    className="group flex h-11 w-full items-center justify-center gap-1.5 rounded-full px-3 text-[12.5px] font-medium tracking-[-0.005em] text-white/95 transition-all hover:brightness-[0.96] active:brightness-[0.92]"
                    // Soften the raw treeColor: blend ~22% with the warm card
                    // surface so it sits as a CALM affirmative button, not a
                    // saturated CTA shouting at the user. Keeps the tag-color
                    // identity for consistency with the timer ring.
                    style={{
                      backgroundColor: `color-mix(in srgb, ${treeColor} 78%, hsl(var(--card)) 22%)`,
                      boxShadow: `0 2px 10px color-mix(in srgb, ${treeColor} 30%, transparent)`,
                    }}
                  >
                    {isRecordingPartial ? (
                      <span className="font-mono text-[11px] tabular-nums opacity-90">{completionProgress}%</span>
                    ) : (
                      <Check size={14} strokeWidth={2.2} className="opacity-90" />
                    )}
                    {isRecordingPartial ? t('focus.recordProgress') : t('focus.completeTask')}
                  </button>
                </div>
              </div>
            )}
          </div>
          {!showStopConfirm && (
            <p className="mt-3 text-center text-[11px] text-muted-foreground/45 sm:mt-5">
              {lang === 'zh' ? '轻触空白处最小化' : 'Tap outside to minimize'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Floating mini timer widget ── */

interface FloatingTimerProps {
  todo: Todo;
  isPaused: boolean;
  pauseState?: PauseState;
  onClick: () => void;
  onTogglePause?: () => void;
  accentColor?: string;
}

export function FloatingTimer({ todo, isPaused, pauseState, onClick, onTogglePause, accentColor }: FloatingTimerProps) {
  const { lang } = useLanguage();
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const i = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);

  const tag = getActivityTag(todo);
  const treeColor = accentColor || getTimerColor(tag);

  const mountTimeRef2 = useRef(Date.now());
  const fallbackStartedAtRef = useRef(Date.now());
  useEffect(() => {
    const now = Date.now();
    fallbackStartedAtRef.current = now;
    mountTimeRef2.current = now;
    setNowMs(now);
  }, [todo.id]);

  const startedAt = getStartedAtMs(todo.timer_started_at, fallbackStartedAtRef.current);
  const now = nowMs;
  const rawElapsed = now - startedAt;
  const currentPauseMs = isPaused && pauseState?.pausedAt ? (now - pauseState.pausedAt) : 0;
  const totalPaused = (pauseState?.totalPausedMs || 0) + currentPauseMs;
  const rawWorkingMs = Math.max(0, rawElapsed - totalPaused);
  const mountElapsed2 = now - mountTimeRef2.current;
  // Floating widget shows the CURRENT session only — same semantics as the
  // full overlay. Lifetime/accumulated time is intentionally not shown here;
  // it would defeat the pomodoro rhythm and balloon to absurd values.
  const sessionSec = (mountElapsed2 < 2000 && rawWorkingMs < 10000)
    ? Math.max(0, Math.floor(Math.min(rawWorkingMs, mountElapsed2 + 500) / 1000))
    : Math.max(0, Math.floor(rawWorkingMs / 1000));
  const progressPct = Math.min(100, (sessionSec / DEFAULT_SESSION_SEC) * 100);
  const treeEmoji = getTreeEmoji(tag, progressPct);
  const pad = (n: number) => String(n).padStart(2, '0');
  // While paused, count up rest seconds and swap the display to a rest clock
  // so the float stays in sync with the full overlay's REST screen.
  const restSec = Math.floor(currentPauseMs / 1000);
  const restLabel = lang === 'zh' ? '休息中' : 'resting';
  const restClock = restSec >= 3600
    ? `${Math.floor(restSec / 3600)}:${pad(Math.floor((restSec % 3600) / 60))}:${pad(restSec % 60)}`
    : `${pad(Math.floor(restSec / 60))}:${pad(restSec % 60)}`;
  const sessionClock = sessionSec >= 3600
    ? `${Math.floor(sessionSec / 3600)}:${pad(Math.floor((sessionSec % 3600) / 60))}:${pad(sessionSec % 60)}`
    : `${pad(Math.floor(sessionSec / 60))}:${pad(sessionSec % 60)}`;

  return (
    <div
      role="button"
      tabIndex={0}
      data-floating-timer="true"
      onClick={e => { e.stopPropagation(); onClick(); }}
      onPointerDown={e => { e.stopPropagation(); }}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
      className={cn(
        "flex h-9 w-max max-w-[min(340px,calc(100vw-32px))] items-center gap-1.5 pl-2 pr-2 rounded-2xl border shadow-[0_6px_18px_hsl(var(--foreground)/0.1)] transition-colors text-left cursor-pointer select-none overflow-hidden animate-in slide-in-from-bottom-2 fade-in-0 duration-300",
        isPaused && "bg-[hsl(var(--surface-soft))] border-border text-muted-foreground"
      )}
      style={!isPaused ? {
        backgroundColor: colorWithAlpha(treeColor, 0.12),
        borderColor: colorWithAlpha(treeColor, 0.45),
        color: treeColor,
      } : undefined}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 flex-shrink-0 rounded-full",
          isPaused ? "bg-muted-foreground/55" : "animate-pulse"
        )}
        style={
          isPaused
            ? { animation: 'breathe 3s ease-in-out infinite' }
            : { backgroundColor: treeColor }
        }
        aria-hidden
      />
      <span className="text-base leading-none flex-shrink-0">{treeEmoji}</span>
      <span
        className={cn(
          "min-w-0 flex-shrink truncate text-[11px] font-medium leading-none",
          isPaused ? "max-w-[120px]" : "max-w-[170px]"
        )}
      >
        {todo.title}
      </span>
      <span
        className={cn(
          "flex-shrink-0 rounded-md font-mono tabular-nums leading-none",
          isPaused
            ? "flex items-center gap-1 px-1.5 py-1 text-[11px] font-semibold"
            : "px-1.5 py-1 text-[12px] font-semibold"
        )}
        style={!isPaused ? { backgroundColor: colorWithAlpha(treeColor, 0.16) } : undefined}
      >
        {isPaused ? (
          <>
            <span className="text-[9.5px] font-medium normal-case tracking-wide opacity-70">
              {restLabel}
            </span>
            <span>{restClock}</span>
          </>
        ) : (
          sessionClock
        )}
      </span>
      {onTogglePause && (
        <button
          type="button"
          data-block-action="true"
          aria-label={isPaused ? (lang === 'zh' ? '继续' : 'Resume') : (lang === 'zh' ? '暂停' : 'Pause')}
          title={isPaused ? (lang === 'zh' ? '继续' : 'Resume') : (lang === 'zh' ? '暂停' : 'Pause')}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onTogglePause();
          }}
          onPointerDown={(e) => e.stopPropagation()}
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-xl border border-border/50 bg-[hsl(var(--surface-contrast)/0.85)] text-foreground/70 transition-colors hover:bg-[hsl(var(--surface-soft-hover))] hover:text-foreground"
        >
          {isPaused ? <Play size={13} className="fill-current" /> : <Pause size={13} />}
        </button>
      )}
    </div>
  );
}
