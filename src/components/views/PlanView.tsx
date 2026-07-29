import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useLanguage } from '@/hooks/useLanguage';
import { Plus, Trash2, Timer, Circle, CheckCircle2, ChevronDown, ChevronRight, Square, Pause, Play, Check, X, Loader2, Mic, ArrowUp, Bell, Repeat, ListTodo, CalendarDays, NotebookPen, Camera, MapPin, List, LayoutGrid, CornerDownLeft, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn, isImeComposing } from '@/lib/utils';
import { mergeCarriedTodos } from '@/lib/carryTodos';
import { extractLeadingEmoji } from '@/lib/emoji';
import { computeStepSession } from '@/lib/stepSession';
import { useTodos, Todo, TodoStep } from '@/hooks/useTodos';
import { useImportedEvents, type ImportedEvent } from '@/hooks/useImportedEvents';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu';
import { showUndoToast } from '@/lib/undoToast';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';


import { useCustomOptions } from '@/hooks/useCustomOptions';
import { useTaskHistory, useTaskSuggestions } from '@/hooks/useTaskHistory';
import { useReminders } from '@/hooks/useReminders';
import { PlanTimelineView } from '@/components/views/PlanTimelineView';
import { autoClassifyTag, TAG_CATEGORY_COLORS } from '@/lib/autoTag';
import { PlanDrift } from '@/components/today/PlanDrift';
import { FocusTimerOverlay, FloatingTimer } from '@/components/FocusTimerOverlay';
import { Moment } from '@/types';
import type { MomentLinkPreview } from '@/types';
import { AnytimeIcon, MorningIcon, AfternoonIcon, EveningIcon } from './segmentIcons';
import { useAuth } from '@/hooks/useAuth';
import { LocationPopover } from '@/components/LocationPopover';
import { LinkPreviewCard } from '@/components/LinkPreviewCard';
import { extractFirstUrl, normalizeUrl } from '@/lib/linkUtils';
import { isStandaloneUrl } from '@/components/views/today/todayHelpers';
import { useWorkTypes } from '@/hooks/useWorkTypes';
import { WorkType, WORK_TYPE_META, resolveWorkType, getWorkTypeKey } from '@/lib/workType';
import { tidyTaskTitle } from '@/lib/tidyTaskTitle';
import { useIsDarkMode } from '@/hooks/useIsDarkMode';
import { getActivityAccentColor } from '@/lib/activityColors';
import { buildTimerSpanISO } from '@/components/views/today/todayHelpers';
import { createTodoDoneUndoSnapshot, restoreTodoDoneFromUndo } from '@/lib/todoDoneUndo';
import {
  getPlanTimelineRhythmPreset,
  loadPlanTimelineRhythmPresetId,
  presetToRhythmPalette,
} from '@/lib/planTimelineRhythmPresets';

function isActivelyRunningTodo(todo: Pick<Todo, 'timer_started_at' | 'timer_ended_at'>) {
  if (!todo.timer_started_at || todo.timer_ended_at) return false;
  const startedAt = new Date(todo.timer_started_at).getTime();
  return Number.isFinite(startedAt) && startedAt <= Date.now();
}



const PLAN_LIST_MODE_KEY = 'plan-list-default';

function readPlanListMode(): 'grouped' | 'flat' {
  if (typeof window === 'undefined') return 'flat';
  return localStorage.getItem(PLAN_LIST_MODE_KEY) === 'grouped' ? 'grouped' : 'flat';
}

/** Above this movement (px, L1) we treat as dock drag and call setPointerCapture — below, leave click to FloatingTimer */
const TIMER_DOCK_DRAG_COMMIT_PX = 10;

const TIME_SEGMENTS = [
  { id: 'anytime' as const, label: 'Anytime', emoji: '🗂️', Icon: AnytimeIcon },
  { id: 'morning' as const, label: 'Morning', emoji: '☀', Icon: MorningIcon },
  { id: 'afternoon' as const, label: 'Afternoon', emoji: '🌤', Icon: AfternoonIcon },
  { id: 'evening' as const, label: 'Evening', emoji: '🌙', Icon: EveningIcon },
];

const TASK_EMOJIS = ['📚', '💻', '🏋️', '✍️', '🎯', '📝', '🔬', '🎨', '🏃', '🧹', '📞', '🛒'];
const CAPTURE_NOTE_TAG = 'capture-note';
const CAPTURE_TYPES = ['win', 'blocker', 'thought', 'gratitude', 'idea', 'progress'] as const;
const CAPTURE_MOODS = ['good', 'neutral', 'tired', 'stressed', 'excited'] as const;
const CAPTURE_MOOD_EMOJIS: Record<(typeof CAPTURE_MOODS)[number], string> = {
  good: '🙂',
  neutral: '😌',
  tired: '😮‍💨',
  stressed: '😵‍💫',
  excited: '🤩',
};

const WORK_TYPE_ORDER: WorkType[] = ['deep', 'shallow', 'admin', 'errand', 'recovery'];
function getTaskTagPillStyle(tag?: string | null) {
  if (!tag) return { bg: '#F3F3F3', color: '#707070' };
  const color = TAG_CATEGORY_COLORS[tag.toLowerCase()] || '#707070';
  // bg is the same base hex — callers apply their own alpha via hexWithAlpha
  return { bg: color, color };
}

function hexWithAlpha(hex: string, alphaHex: string) {
  return /^#[0-9A-Fa-f]{6}$/.test(hex) ? `${hex}${alphaHex}` : hex;
}

function autoDetectCaptureType(text: string): (typeof CAPTURE_TYPES)[number] | null {
  const lower = text.toLowerCase();
  if (/\b(win|won|finished|completed|accomplished|nailed|shipped)\b/.test(lower)) return 'win';
  if (/\b(block|blocked|stuck|issue|problem|can't|cannot|error|fail)\b/.test(lower)) return 'blocker';
  if (/\b(grateful|thankful|appreciate|blessed)\b/.test(lower)) return 'gratitude';
  if (/\b(idea|what if|how about)\b/.test(lower)) return 'idea';
  if (/\b(progress|worked|built|implemented|fixed|pushed)\b/.test(lower)) return 'progress';
  return 'thought';
}

function getTimeSegmentForHour(hour: number): Todo['time_segment'] {
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

function getAutoDoneDurationMinutes(todo: Todo): number {
  const normalizedTags = (todo.tags || []).map(tag => tag.toLowerCase());
  const inferredTag = autoClassifyTag(todo.title);
  const workType = resolveWorkType({
    entity: 'todo',
    id: todo.id,
    title: todo.title,
    tags: todo.tags,
  });
  const title = todo.title.toLowerCase();
  const isTinyTask =
    normalizedTags.some(tag => ['tiny', 'quick', 'small'].includes(tag)) ||
    /\b(quick|small|tiny|minor|reply|email|message|text|call|check|submit|upload|print|scan)\b/.test(title) ||
    /小任务|快速|回复|邮件|消息|检查|提交|上传|打印|电话/.test(title);

  if (isTinyTask) return 5;
  if (normalizedTags.some(tag => ['admin', 'shallow'].includes(tag))) return 10;
  if (normalizedTags.some(tag => ['errand', 'shopping', 'travel'].includes(tag))) return 15;
  if (normalizedTags.some(tag => ['health', 'recovery'].includes(tag))) return 20;
  if (normalizedTags.some(tag => ['deep', 'study'].includes(tag))) return 60;
  if (inferredTag === 'shopping' || inferredTag === 'travel') return 15;
  if (inferredTag === 'health') return 20;
  if (inferredTag === 'study') return workType === 'deep' ? 60 : 30;
  if (inferredTag === 'work') return workType === 'deep' ? 60 : 20;

  switch (workType) {
    case 'deep':
      return 60;
    case 'errand':
      return 15;
    case 'recovery':
      return 20;
    case 'shallow':
    case 'admin':
    default:
      return 10;
  }
}

function getAutoDoneTimerUpdates(todo: Todo): Partial<Todo> {
  const durationMinutes = getAutoDoneDurationMinutes(todo);
  const endedAt = new Date();
  const startedAt = new Date(endedAt.getTime() - durationMinutes * 60_000);

  return {
    timer_started_at: startedAt.toISOString(),
    timer_ended_at: endedAt.toISOString(),
    timer_seconds: durationMinutes * 60,
  };
}

/* ── Rotating second tick SVG ── */
function SecondTick({ elapsed, size = 56 }: { elapsed: number; size?: number }) {
  const secs = elapsed % 60;
  const angle = (secs / 60) * 360 - 90;
  const r = size / 2 - 4;
  const cx = size / 2;
  const cy = size / 2;
  const tickLen = 6;
  const rad = (angle * Math.PI) / 180;
  const x1 = cx + (r - tickLen) * Math.cos(rad);
  const y1 = cy + (r - tickLen) * Math.sin(rad);
  const x2 = cx + r * Math.cos(rad);
  const y2 = cy + r * Math.sin(rad);

  return (
    <svg width={size} height={size} className="absolute inset-0">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="currentColor" strokeWidth={1} className="text-border/30" />
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="text-primary" />
    </svg>
  );
}

/* ── Immersive Focusing Overlay ── */
function FocusingOverlay({ taskTitle, elapsed, isPaused, onTogglePause, onStop, onCancel, onMinimize }: {
  taskTitle: string; elapsed: number; isPaused: boolean;
  onTogglePause: () => void; onStop: () => void; onCancel: () => void; onMinimize: () => void;
}) {
  const hrs = Math.floor(elapsed / 3600);
  const mins = Math.floor((elapsed % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    <div className="fixed inset-0 z-50 bg-background/92 backdrop-blur-md flex flex-col items-center justify-center gap-10 animate-fade-in cursor-pointer" onClick={onMinimize}>
      <p className="text-xs text-muted-foreground/60 tracking-[0.3em] uppercase">{isPaused ? 'Paused' : 'Focusing'}</p>
      <p className="text-base font-medium text-foreground/80">{taskTitle}</p>
      <div className="relative w-56 h-56 flex items-center justify-center">
        <SecondTick elapsed={isPaused ? 0 : elapsed} size={224} />
        <span className="text-4xl font-mono font-extralight text-foreground/35 tabular-nums">{pad(hrs)}:{pad(mins)}</span>
      </div>
      <div className="flex items-center gap-8" onClick={e => e.stopPropagation()}>
        <button onClick={onTogglePause} aria-label={isPaused ? 'Resume timer' : 'Pause timer'} className="w-12 h-12 rounded-full border border-border/50 flex items-center justify-center text-foreground/60 hover:text-foreground transition-colors">
          {isPaused ? <Play size={20} /> : <Pause size={20} />}
        </button>
        <button onClick={onStop} aria-label="Finish timer" className="w-10 h-10 rounded-full border border-border/30 flex items-center justify-center text-primary/60 hover:text-primary transition-colors" title="Finish"><Square size={14} /></button>
        <button onClick={onCancel} aria-label="Cancel timer" className="w-10 h-10 rounded-full border border-border/30 flex items-center justify-center text-destructive/50 hover:text-destructive transition-colors" title="Cancel"><X size={14} /></button>
      </div>
      <p className="text-xs text-muted-foreground/30 mt-4">tap anywhere to minimize</p>
    </div>
  );
}

/* ── Timer Completion Summary ── */
function TimerCompletionOverlay({ taskTitle, elapsed, startedAt, onConfirm, onCancel }: {
  taskTitle: string; elapsed: number; startedAt: string;
  onConfirm: (data: { progress: number; isCompleted: boolean; startTime: string; endTime: string }) => void;
  onCancel: () => void;
}) {
  const startDate = new Date(startedAt);
  const endDate = new Date();
  const [startTime, setStartTime] = useState(format(startDate, 'HH:mm'));
  const [endTime, setEndTime] = useState(format(endDate, 'HH:mm'));
  const [progress, setProgress] = useState(0);
  const [showConfirmComplete, setShowConfirmComplete] = useState(false);
  const hrs = Math.floor(elapsed / 3600);
  const mins = Math.floor((elapsed % 3600) / 60);
  const secs = elapsed % 60;
  const pad = (n: number) => String(n).padStart(2, '0');

  const handleConfirm = () => {
    if (progress >= 100) { onConfirm({ progress: 100, isCompleted: true, startTime, endTime }); }
    else { setShowConfirmComplete(true); }
  };

  if (showConfirmComplete) {
    return (
      <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center animate-fade-in">
        <div className="w-[300px] bg-card border border-border rounded-2xl p-6 space-y-5 shadow-xl text-center">
          <p className="text-sm text-foreground/80">Mark this task as complete?</p>
          <p className="text-xs text-muted-foreground">Progress: {progress}%</p>
          <div className="flex items-center gap-4 justify-center pt-2">
            <button onClick={() => onConfirm({ progress, isCompleted: false, startTime, endTime })} className="w-12 h-12 rounded-full border border-border/50 flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors" title="Keep open"><X size={20} /></button>
            <button onClick={() => onConfirm({ progress, isCompleted: true, startTime, endTime })} className="w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90 transition-opacity" title="Mark complete"><Check size={20} /></button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center animate-fade-in"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="w-[320px] bg-card border border-border rounded-2xl p-6 space-y-5 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="text-center space-y-1">
          <p className="text-xs text-muted-foreground/60 tracking-[0.2em] uppercase">Session complete</p>
          <p className="text-base font-medium text-foreground">{taskTitle}</p>
        </div>
        <div className="text-center">
          <span className="text-3xl font-mono font-light text-foreground/40 tabular-nums">{hrs > 0 ? `${pad(hrs)}:` : ''}{pad(mins)}:{pad(secs)}</span>
        </div>
        <div className="flex items-center justify-center gap-3">
          <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="bg-secondary rounded-lg px-2 py-1 text-sm font-mono text-center w-24 focus:outline-none focus:ring-1 focus:ring-primary" />
          <span className="text-muted-foreground text-sm">→</span>
          <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="bg-secondary rounded-lg px-2 py-1 text-sm font-mono text-center w-24 focus:outline-none focus:ring-1 focus:ring-primary" />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">Progress</span><span className="text-xs font-mono text-muted-foreground">{progress}%</span></div>
          <Slider value={[progress]} onValueChange={([v]) => setProgress(v)} max={100} step={5} className="w-full" />
        </div>
        <div className="flex items-center gap-3 justify-center pt-1">
          <button onClick={onCancel} aria-label="Discard" className="w-12 h-12 rounded-full border border-border/50 flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors" title="Discard"><X size={20} /></button>
          <button onClick={handleConfirm} aria-label="Save" className="w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90 transition-opacity" title="Save"><Check size={20} /></button>
        </div>
      </div>
    </div>
  );
}

/* ── Floating mini timer ── */
function FloatingTimerWidgets({ timers, onClickTimer }: { timers: { id: string; title: string; elapsed: number; isPaused: boolean }[]; onClickTimer: (id: string) => void; }) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    <div className="fixed bottom-20 right-3 z-[70] flex flex-col gap-2" style={{ pointerEvents: 'auto' }}>
      {timers.map(t => (
        <div
          key={t.id}
          role="button"
          tabIndex={0}
          onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
          onPointerUp={(e) => { e.stopPropagation(); onClickTimer(t.id); }}
          onKeyDown={(e) => { if (e.key === 'Enter') onClickTimer(t.id); }}
          className={cn("flex items-center gap-2.5 px-4 py-2.5 rounded-2xl shadow-lg transition-colors text-left border cursor-pointer select-none", t.isPaused ? "bg-muted border-border text-muted-foreground" : "bg-primary/10 border-primary/20 text-primary")}
        >
          <Timer size={16} />
          <div className="flex flex-col">
            <span className="text-xs truncate max-w-[120px] leading-tight font-medium">{t.title}</span>
            <span className="text-base font-mono font-semibold tabular-nums">{pad(Math.floor(t.elapsed / 60))}:{pad(t.elapsed % 60)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Progress dialog ── */
function ProgressDialog({ taskTitle, initialProgress, onConfirm, onCancel }: {
  taskTitle: string; initialProgress: number;
  onConfirm: (progress: number, isCompleted: boolean) => void; onCancel: () => void;
}) {
  const [progress, setProgress] = useState(initialProgress);
  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center animate-fade-in">
      <div className="w-[300px] bg-card border border-border rounded-2xl p-6 space-y-4 shadow-xl">
        <p className="text-sm font-medium text-foreground text-center">{taskTitle}</p>
        <div className="space-y-2">
          <div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">How much done?</span><span className="text-xs font-mono text-muted-foreground">{progress}%</span></div>
          <Slider value={[progress]} onValueChange={([v]) => setProgress(v)} max={100} step={5} className="w-full" />
        </div>
        <div className="flex items-center gap-3 justify-center">
          <button onClick={() => onConfirm(progress, false)} className="w-10 h-10 rounded-full border border-border/50 flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors" title="Save progress, keep open"><X size={18} /></button>
          <button onClick={() => onConfirm(progress, true)} className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90 transition-opacity" title="Mark complete"><Check size={18} /></button>
        </div>
      </div>
    </div>
  );
}

/* ── Todo item for the left list ── */
function fmtSec(sec: number): string {
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) {
    const rm = m % 60;
    return rm > 0 ? `${h}h${rm}m` : `${h}h`;
  }
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return rh > 0 ? `${d}d${rh}h` : `${d}d`;
}

function TodoItem({ todo, onToggle, onDelete, onFocus, onUpdateTitle, onUpdateTime, onUpdateProgress, isTiming, timerElapsed, isPaused, onDragStart, onDragEnd, onToggleWithProgress, steps, onAddStep, onToggleStep, onDeleteStep, onStartStepTimer, onStopStepTimer, onUpdateStepPlanTime, onUpdateStepTitle, carriedFromDate, onToggleRecurring, onReopen }: {
  todo: Todo; onToggle: () => void; onDelete: () => void; onFocus: () => void;
  onUpdateTitle: (title: string) => void; onUpdateTime: (startTime: string, endTime: string) => void;
  onUpdateProgress: (progress: number) => void;
  isTiming: boolean; timerElapsed: number; isPaused: boolean;
  onDragStart: (e: React.DragEvent) => void; onDragEnd: () => void; onToggleWithProgress: () => void;
  steps: TodoStep[]; onAddStep: (title: string) => void;
  onToggleStep: (stepId: string, completed: boolean) => void;
  onDeleteStep: (stepId: string) => void;
  onStartStepTimer: (stepId: string) => void;
  onStopStepTimer: (stepId: string) => void;
  onUpdateStepPlanTime: (stepId: string, startTime: string, endTime: string) => void;
  onUpdateStepTitle: (stepId: string, title: string) => void;
  carriedFromDate?: string | null;
  onToggleRecurring: (next: boolean) => void;
  onReopen?: () => void;
}) {
  const { t: tLang, lang } = useLanguage();
  const { getWorkType, setWorkType, overrides } = useWorkTypes();
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(todo.title);
  const [isEditingTime, setIsEditingTime] = useState(false);
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [newStepTitle, setNewStepTitle] = useState('');
  const [showAddStepInput, setShowAddStepInput] = useState(false);
  // Inline step-title rename. Click a step's title to edit it in place; Enter
  // saves (guarded against IME composition so a Chinese/Japanese candidate
  // confirmation doesn't submit early), Escape cancels, blur saves.
  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const [editingStepTitle, setEditingStepTitle] = useState('');
  // Two-step delete for steps: a bare X was too easy to hit by accident. The
  // first click "arms" the specific step (button turns into a red confirm),
  // the second click within the window actually deletes. Auto-disarms after a
  // few seconds so a stray first click can't linger as a loaded trigger.
  const [confirmDeleteStepId, setConfirmDeleteStepId] = useState<string | null>(null);
  useEffect(() => {
    if (!confirmDeleteStepId) return;
    const timer = setTimeout(() => setConfirmDeleteStepId(null), 3000);
    return () => clearTimeout(timer);
  }, [confirmDeleteStepId]);
  // Per-step plan-time editor. Only one step's time inputs are open at a time.
  const [planTimeStepId, setPlanTimeStepId] = useState<string | null>(null);
  const [planStart, setPlanStart] = useState('');
  const [planEnd, setPlanEnd] = useState('');
  const hasProgress = todo.progress > 0 && todo.progress < 100 && !todo.is_completed;
  const stepCount = steps.length;
  const stepsDone = steps.filter(s => s.is_completed).length;
  const hasSteps = stepCount > 0;

  // "Resting" = a recorded session ended but the task isn't done. Any prior
  // work (timer_seconds > 0 with an ended_at) marks the task as resumable, even
  // when progress is still 0 — "Continue Later" without moving the slider is a
  // valid path, and the row should still surface the Resume chip so the list
  // reflects that time was logged on the timeline.
  const priorWorkSec = todo.timer_seconds || 0;
  const isResting = !isTiming && !todo.is_completed && priorWorkSec > 0 && !!todo.timer_ended_at;
  const canContinueWhenDone = !!todo.is_completed && priorWorkSec > 0 && !!todo.timer_ended_at;
  const restSec = isResting
    ? Math.max(0, Math.floor((Date.now() - new Date(todo.timer_ended_at!).getTime()) / 1000))
    : 0;

  const handleSaveTitle = () => {
    const cleaned = tidyTaskTitle(editTitle);
    if (cleaned && cleaned !== todo.title) onUpdateTitle(cleaned);
    else setEditTitle(todo.title);
    setIsEditing(false);
  };

  const handleStartEditTime = () => {
    const start = todo.timer_started_at ? format(new Date(todo.timer_started_at), 'HH:mm') : format(new Date(), 'HH:mm');
    const end = todo.timer_ended_at ? format(new Date(todo.timer_ended_at), 'HH:mm') : format(new Date(), 'HH:mm');
    setEditStart(start); setEditEnd(end); setIsEditingTime(true);
  };

  const handleSaveTime = () => { onUpdateTime(editStart, editEnd); setIsEditingTime(false); };
  const handleDoubleClickDelete = () => {
    if (isEditing) return;
    // No blocking confirm — delete is instantly undoable via the toast.
    onDelete();
  };

  const isScheduled = !!todo.plan_started_at && !todo.is_completed;
  const isDoing = isActivelyRunningTodo(todo);
  // A task is "ongoing" when its own timer runs OR any of its steps is being
  // timed. A running step means the user is actively working the task even
  // though the parent's own timer was never started — so the row should read
  // as live, not merely "Planned".
  const hasRunningStep = steps.some(s => !!s.timer_started_at);
  const isOngoing = isDoing || hasRunningStep;
  const inferredTag = todo.tags?.[0] || autoClassifyTag(todo.title);
  const tagLabel = inferredTag
    ? inferredTag.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    : null;
  const tagPillStyle = getTaskTagPillStyle(inferredTag);
  const workType = getWorkType({ entity: 'todo', id: todo.id, title: todo.title, tags: todo.tags });
  const workTypeMeta = WORK_TYPE_META[workType];
  // Only treat the work type as "set" when the user deliberately picked one
  // (an explicit override). Otherwise the pill is just auto-inferred noise, so
  // we reveal it on row hover instead of cluttering every row.
  const hasExplicitWorkType = !!overrides[getWorkTypeKey('todo', todo.id)];
  // The work-type pill is redundant when it would just repeat the tag pill
  // (e.g. a task tagged "Admin" whose work type also resolves to Admin) — show
  // a single chip instead of two identical "Admin" pills.
  const workTypeMatchesTag = !!tagLabel &&
    workTypeMeta?.shortLabel.toLowerCase() === tagLabel.toLowerCase();
  const statusLabel = todo.is_completed
    ? 'Done'
    : isDoing
      ? null
      : hasRunningStep
        ? (lang === 'zh' ? '进行中' : 'Ongoing')
        : isResting
          ? tLang('focus.resumeChip')
          : isScheduled
            ? 'Planned'
            : null;

  const isDark = useIsDarkMode();

  // Live color for state signaling — always the page accent (terracotta), never
  // the tag's own hex. Tag identity lives inside the tag chip; the row-level
  // "ongoing" signal must not repaint the whole card in whatever hue the tag
  // happens to be (Work=purple, Study=blue, etc.). Locking to `--primary` keeps
  // the page's Color Consistency intact regardless of category.
  const liveTint = (a: number) => `hsl(var(--primary) / ${a})`;

  // ── Visual hierarchy (the whole point of this block) ─────────────
  // Goal:   active   ▓▓▓ dominates
  //         inactive ░░░ recedes (especially on dark)
  //         done     ·   barely there
  //
  // Light mode keeps the original "white card on warm paper" treatment
  // because that already reads correctly. The interesting logic is the
  // dark mode branch, where we INVERT the previous mistake: bright
  // surfaces had been making inactive rows louder than the active one.
  // Now inactive rows go transparent with a hairline border, the
  // active row leans hard into its tag color (stronger tint + ring +
  // soft glow halo), and completed rows fade with opacity.

  // A single, quiet tint for each state. One signal, not four.
  //   Ongoing  → 2px live-colored spine on the left edge (see below), plus a
  //              whisper of tint. No pulsing dot, no gradient, no ring.
  //   Planned  → hairline accent border only. No fill. The row still reads as
  //              "reserved" at rest, but stays out of the way.
  //   Idle     → nothing. Silence is the strongest baseline.
  const activeCategoryStyle: React.CSSProperties | undefined = isOngoing
    ? {
        background: liveTint(isDark ? 0.09 : 0.05),
        borderColor: liveTint(isDark ? 0.22 : 0.18),
        boxShadow: `inset 2px 0 0 0 ${liveTint(isDark ? 0.7 : 0.55)}`,
      }
    : isScheduled
      ? { borderColor: `hsl(var(--accent) / ${isDark ? 0.22 : 0.28})` }
      : undefined;

  const containerCls = todo.is_completed
    // Done: maximally recede in both modes — no surface, no border, faded.
    ? "bg-transparent border-transparent opacity-65 hover:opacity-90 dark:opacity-45 dark:hover:opacity-75"
    : isOngoing
      // Active: surface comes from inline activeCategoryStyle. Hover just
      // bumps it slightly so the user feels feedback without us fighting
      // the carefully tuned tint.
      ? "hover:brightness-[0.985] dark:hover:brightness-[1.06]"
      : isScheduled
        ? "hover:brightness-[0.99] dark:hover:brightness-[1.04]"
      : isResting
        // Resting = "you have a paused session here". Use a whisper of
        // amber warmth in dark mode so it reads as "come back to me"
        // instead of just another inactive row.
        ? "bg-transparent border-[#F1E6DD] hover:bg-[#FFF6EE] dark:border-amber-500/22 dark:hover:bg-amber-500/[0.04]"
      // Inactive (default): bright in light (cards on paper) → in dark, a
      // whisper of raised surface INSTEAD of a hairline border, so a column of
      // tasks reads as one calm stack rather than a grid of boxes. Borders are
      // reserved for stateful rows (resting/active); default rows lean on
      // surface + spacing (quieter, more iOS-like).
      : "bg-white/75 border-[#EFEFEF] hover:bg-[#F9F9F9] dark:bg-white/[0.02] dark:border-transparent dark:hover:bg-white/[0.05]";

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
    <div className="flex w-full max-w-[920px] flex-col">
    <div
      className={cn(
        "flex h-[50px] w-full items-center gap-3 px-3.5 group rounded-[16px] transition-colors relative select-none border",
        containerCls
      )}
      style={activeCategoryStyle}
      draggable={!isEditing}
      onDragStart={e => { if (isEditing) { e.preventDefault(); return; } onDragStart(e); }}
      onDragEnd={onDragEnd}
      onDoubleClick={e => {
        e.preventDefault();
        e.stopPropagation();
        handleDoubleClickDelete();
      }}
    >
      <button onClick={onToggleWithProgress} className="flex-shrink-0">
        {todo.is_completed ? <CheckCircle2 size={18} className="text-primary/85" /> : <Circle size={18} className="text-muted-foreground/45" />}
      </button>
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        {isEditing ? (
          <input value={editTitle} onChange={e => setEditTitle(e.target.value)}
            onBlur={handleSaveTitle}
            onKeyDown={e => { if (e.key === 'Enter') handleSaveTitle(); if (e.key === 'Escape') { setEditTitle(todo.title); setIsEditing(false); } }}
            className="min-w-0 flex-1 text-[12px] font-medium bg-transparent border-b border-primary/30 focus:outline-none focus:border-primary py-0.5" autoFocus />
        ) : (
          <div className="min-w-0 flex-1">
            <p
              className={cn(
                "text-[16px] font-semibold leading-tight cursor-pointer transition-colors truncate",
                todo.is_completed
                  // Done — already faded by container opacity, plus muted
                  // strikethrough for unambiguous semantics.
                  ? "text-muted-foreground line-through decoration-muted-foreground/40"
                  : isOngoing
                    // Active — pure foreground. Hover tones slightly down
                    // (instead of brightening) since it's already maxed.
                    ? "text-foreground hover:text-foreground/90"
                    // Inactive — full in light mode, recede in dark so the
                    // active row visually wins. Hover invites by lifting
                    // the title back to full brightness.
                    : "text-foreground hover:text-foreground/85 dark:text-foreground/72 dark:hover:text-foreground"
              )}
              onClick={() => { setEditTitle(todo.title); setIsEditing(true); }}
            >
              {todo.title}
            </p>
          </div>
        )}
        {!isEditing && carriedFromDate && (
          <span
            className="flex-shrink-0 rounded-full bg-amber-500/[0.14] px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-amber-600/90 dark:text-amber-400/85"
            title={lang === 'zh' ? '从往日延续 · 还没做' : 'Carried over from a past day'}
          >
            {format(new Date(`${carriedFromDate}T00:00:00`), lang === 'zh' ? 'M月d日' : 'MMM d')}
          </span>
        )}
        {!isEditing && hasSteps && (
          <span
            className="flex-shrink-0 inline-flex items-center gap-1.5"
            title={lang === 'zh' ? '完成步骤 / 总步骤' : 'Completed / total steps'}
          >
            <span className="h-1 w-6 overflow-hidden rounded-full bg-foreground/[0.12]">
              <span
                className="block h-full rounded-full transition-all"
                style={{
                  width: `${stepCount ? (stepsDone / stepCount) * 100 : 0}%`,
                  backgroundColor: stepsDone === stepCount ? 'hsl(var(--primary))' : 'hsl(var(--primary) / 0.55)',
                }}
              />
            </span>
            <span
              className={cn(
                "font-mono text-[11px] tabular-nums transition-colors",
                stepsDone === stepCount ? "text-primary/80" : "text-muted-foreground/75"
              )}
            >
              {stepsDone}/{stepCount}
            </span>
          </span>
        )}
        {!isEditing && (
          <div className="flex flex-shrink-0 items-center gap-1.5 whitespace-nowrap">
            <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground/45">
              {statusLabel && (
                isResting ? (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onFocus?.(); }}
                    className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 -mx-1 text-amber-500/75 transition-colors hover:bg-amber-500/10"
                    title={tLang('plan.resumeTimer')}
                  >
                    <Timer size={11} strokeWidth={2} className="text-amber-500/65" />
                    <span className="font-medium text-amber-500/75">{statusLabel}</span>
                  </button>
                ) : (
                <span className="inline-flex items-center gap-1">
                  {todo.is_completed
                    ? <CheckCircle2 size={11} strokeWidth={2} className="text-primary/70" />
                  : isOngoing
                      // No icon and no dot for Ongoing. The 2px live-colored
                      // spine on the row's left edge is the signal — a second
                      // visual marker here would just be noise.
                      ? null
                      : isResting
                        ? <Timer size={11} strokeWidth={2} className="text-amber-500/65" />
                        : <CalendarDays size={11} strokeWidth={2} className="text-muted-foreground/45" />}
                  <span className={cn(
                    "font-medium",
                    todo.is_completed && "text-primary/70",
                    isResting && "text-amber-500/65",
                    !todo.is_completed && !isOngoing && !isResting && "text-muted-foreground/55"
                  )}
                    style={isOngoing ? { color: liveTint(0.85) } : undefined}
                  >{statusLabel}</span>
                </span>
                )
              )}
              {/* Resting: show work time + rest duration */}
              {isResting && (
                <span className="inline-flex items-center gap-1 text-amber-500/70">
                  <span>{fmtSec(priorWorkSec)}</span>
                  <span className="text-muted-foreground/40">·</span>
                  <span className="text-muted-foreground/55">{lang === 'zh' ? `休${fmtSec(restSec)}` : `${fmtSec(restSec)} ago`}</span>
                </span>
              )}
              {!isResting && tagLabel && (
                <span
                  // dark:saturate softens the inline-style tag color (which
                  // is a fully-saturated hex designed for white canvas) so it
                  // doesn't read as neon on the dark surface.
                  className="inline-flex max-w-[88px] min-w-0 items-center gap-1 rounded-full px-1.5 py-[2px] text-[12px] font-medium dark:saturate-[0.78] dark:opacity-90"
                  style={{ backgroundColor: hexWithAlpha(tagPillStyle.bg, '20'), color: tagPillStyle.color }}
                >
                  <ListTodo size={11} strokeWidth={2} />
                  <span className="truncate">{tagLabel}</span>
                </span>
              )}
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      "items-center gap-1 rounded-full px-1.5 py-[2px] text-[12px] font-medium transition-colors hover:brightness-95 dark:saturate-[0.85] dark:!text-foreground/80 dark:!bg-white/[0.06]",
                      workTypeMatchesTag
                        ? "hidden"
                        : hasExplicitWorkType ? "inline-flex" : "hidden group-hover:inline-flex"
                    )}
                    style={{ color: hexWithAlpha(workTypeMeta.color, 'B3'), backgroundColor: `${workTypeMeta.bg}73` }}
                    title="Work type"
                  >
                    <span className="truncate">{workTypeMeta.shortLabel}</span>
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-40 rounded-2xl p-1.5">
                  <div className="mb-1 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/70">
                    Work Type
                  </div>
                  <div className="space-y-1">
                    {WORK_TYPE_ORDER.map((type) => {
                      const meta = WORK_TYPE_META[type];
                      const active = type === workType;
                      return (
                        <button
                          key={type}
                          type="button"
                          onClick={() => setWorkType('todo', todo.id, type)}
                          className={cn(
                            'flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-xs transition-colors',
                            active ? 'bg-secondary text-foreground' : 'hover:bg-secondary/70 text-muted-foreground'
                          )}
                        >
                          <span>{meta.label}</span>
                          {active && <Check size={12} />}
                        </button>
                      );
                    })}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            {hasProgress && (
              <span className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-full bg-primary/8 px-1.5 py-0.5 text-[9px] font-medium text-primary">
                <span className="inline-block h-1 w-4 overflow-hidden rounded-full bg-primary/14">
                  <span className="block h-full rounded-full bg-primary/60" style={{ width: `${todo.progress}%` }} />
                </span>
                <span>{todo.progress}%</span>
              </span>
            )}
          </div>
        )}
        {isEditingTime ? (
          <div className="flex items-center gap-1 mt-1" onClick={e => e.stopPropagation()}>
            <input type="time" value={editStart} onChange={e => setEditStart(e.target.value)} className="bg-secondary rounded px-1 py-0.5 text-xs font-mono w-[70px] focus:outline-none focus:ring-1 focus:ring-primary" />
            <span className="text-muted-foreground text-xs">→</span>
            <input type="time" value={editEnd} onChange={e => setEditEnd(e.target.value)} className="bg-secondary rounded px-1 py-0.5 text-xs font-mono w-[70px] focus:outline-none focus:ring-1 focus:ring-primary" />
            <button onClick={handleSaveTime} aria-label="Save time" className="text-primary hover:text-primary/80"><Check size={12} /></button>
            <button onClick={() => setIsEditingTime(false)} aria-label="Cancel editing time" className="text-muted-foreground hover:text-destructive"><X size={12} /></button>
          </div>
        ) : null}
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {todo.is_completed && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleStartEditTime();
            }}
            className="flex h-[34px] w-[34px] rounded-full items-center justify-center border border-transparent text-muted-foreground/55 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity transition-colors hover:border-primary/25 hover:bg-primary/[0.08] hover:text-primary"
            title={lang === 'zh' ? '编辑完成时间' : 'Edit completion time'}
            aria-label={lang === 'zh' ? '编辑完成时间' : 'Edit completion time'}
          >
            <Clock size={14} />
          </button>
        )}
        {todo.is_completed && onReopen && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onReopen();
            }}
            className="flex h-[34px] w-[34px] rounded-full items-center justify-center border border-transparent text-muted-foreground/55 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity transition-colors hover:border-primary/25 hover:bg-primary/[0.08] hover:text-primary"
            title={lang === 'zh' ? '恢复为未完成' : 'Reopen task'}
            aria-label={lang === 'zh' ? '恢复为未完成' : 'Reopen task'}
          >
            <CornerDownLeft size={14} />
          </button>
        )}
        {!isEditing && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(v => !v);
              if (!isExpanded && stepCount === 0) setShowAddStepInput(true);
            }}
            className={cn(
              "flex h-[28px] w-[28px] rounded-full items-center justify-center text-muted-foreground/55 transition-all",
              hasSteps
                ? "opacity-60 hover:opacity-100 hover:text-foreground"
                : "opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:text-foreground",
              isExpanded && "rotate-90 opacity-100 text-foreground"
            )}
            title={isExpanded
              ? (lang === 'zh' ? '收起步骤' : 'Collapse steps')
              : (lang === 'zh' ? (hasSteps ? '展开步骤' : '添加步骤') : (hasSteps ? 'Show steps' : 'Add steps'))}
            aria-label={isExpanded ? 'Collapse steps' : 'Expand steps'}
            aria-expanded={isExpanded}
          >
            <ChevronRight size={14} />
          </button>
        )}
        <button
          onClick={onDelete}
          className="flex h-[34px] w-[34px] rounded-full items-center justify-center border border-transparent text-muted-foreground/55 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity transition-colors hover:border-destructive/25 hover:bg-destructive/[0.08] hover:text-destructive"
          title={lang === 'zh' ? '删除' : 'Delete'}
          aria-label={lang === 'zh' ? '删除' : 'Delete'}
        >
          <Trash2 size={14} />
        </button>
        {(!todo.is_completed || canContinueWhenDone) && (
          <button
            onClick={onFocus}
            className={cn(
              "h-[34px] w-[34px] rounded-full flex items-center justify-center transition-colors border",
              canContinueWhenDone
                ? "border-primary/30 bg-primary/10 text-primary hover:bg-primary/16 dark:border-primary/28 dark:bg-primary/14"
                : isTiming
                ? (isPaused ? "border-border bg-secondary text-foreground/55 opacity-70" : "border-border bg-secondary text-foreground/70 shadow-sm")
                : isResting
                  ? "border-[#8A6A4F]/45 bg-transparent text-[#8A6A4F] hover:bg-[#FFF4EA] dark:border-foreground/20 dark:text-foreground/72 dark:hover:bg-foreground/[0.06]"
                  : "border-[#2F2D29]/45 bg-transparent text-[#2F2D29] hover:bg-[#F2F1EF] dark:border-foreground/20 dark:text-foreground/72 dark:hover:bg-foreground/[0.06]"
            )}
            title={
              canContinueWhenDone
                ? (lang === 'zh' ? '继续计时（自动恢复任务）' : 'Continue timing (reopen task)')
                : isTiming
                ? (lang === 'zh' ? '查看计时器' : 'Show timer')
                : isResting
                  ? tLang('plan.resumeTimer')
                  : tLang('plan.startFocusTimer')
            }
          >
            <Timer size={15} />
          </button>
        )}
      </div>
    </div>
    {isExpanded && !isEditing && (
      <div className="relative mt-1 flex flex-col gap-0 pl-9 pr-3 pb-3 pt-2 border-t border-foreground/[0.04] before:absolute before:left-4 before:top-3 before:bottom-3 before:w-px before:bg-foreground/[0.1] before:content-['']">
        {steps.map(step => {
          const stepRunning = !!step.timer_started_at;
          const stepBaseSec = step.timer_seconds || 0;
          const stepElapsed = stepBaseSec + (stepRunning
            ? Math.max(0, Math.floor((Date.now() - new Date(step.timer_started_at!).getTime()) / 1000))
            : 0);
          const pad2 = (n: number) => String(n).padStart(2, '0');
          const stepLiveLabel = `${pad2(Math.floor(stepElapsed / 60))}:${pad2(stepElapsed % 60)}`;
          const planLabel = step.plan_started_at && step.plan_ended_at
            ? `${format(new Date(step.plan_started_at), 'HH:mm')}–${format(new Date(step.plan_ended_at), 'HH:mm')}`
            : null;
          const isEditingPlan = planTimeStepId === step.id;
          const timerActive = stepRunning || stepElapsed > 0;
          const openPlanEditor = () => {
            if (isEditingPlan) { setPlanTimeStepId(null); return; }
            setPlanStart(step.plan_started_at ? format(new Date(step.plan_started_at), 'HH:mm') : format(new Date(), 'HH:mm'));
            setPlanEnd(step.plan_ended_at ? format(new Date(step.plan_ended_at), 'HH:mm') : format(new Date(), 'HH:mm'));
            setPlanTimeStepId(step.id);
          };
          return (
          <div key={step.id} className="group/step">
          <div className="flex items-center gap-2.5 py-1.5">
            <button
              type="button"
              onClick={() => onToggleStep(step.id, !step.is_completed)}
              className="flex-shrink-0 text-muted-foreground/55 hover:text-primary transition-colors"
              aria-label={step.is_completed ? 'Mark step incomplete' : 'Mark step complete'}
            >
              {step.is_completed
                ? <CheckCircle2 size={14} className="text-primary/75" />
                : <Circle size={14} />}
            </button>
            {editingStepId === step.id ? (
              <input
                autoFocus
                value={editingStepTitle}
                onChange={e => setEditingStepTitle(e.target.value)}
                onKeyDown={e => {
                  // Guard against IME composition: while composing a Chinese /
                  // Japanese candidate, Enter confirms the candidate — it must
                  // NOT commit the rename. Only a "real" Enter saves.
                  if (e.key === 'Enter' && !isImeComposing(e.nativeEvent as KeyboardEvent)) {
                    if (editingStepTitle.trim()) onUpdateStepTitle(step.id, editingStepTitle);
                    setEditingStepId(null);
                  } else if (e.key === 'Escape') {
                    setEditingStepId(null);
                  }
                }}
                onBlur={() => {
                  if (editingStepTitle.trim() && editingStepTitle.trim() !== step.title) {
                    onUpdateStepTitle(step.id, editingStepTitle);
                  }
                  setEditingStepId(null);
                }}
                className={cn(
                  "flex-1 min-w-0 bg-transparent text-[13px] leading-relaxed focus:outline-none",
                  "border-b border-primary/40 text-foreground"
                )}
              />
            ) : (
              <button
                type="button"
                onClick={() => { setEditingStepId(step.id); setEditingStepTitle(step.title); }}
                title={lang === 'zh' ? '点击编辑步骤' : 'Click to edit step'}
                className={cn(
                  "flex-1 min-w-0 truncate text-left text-[13px] leading-relaxed bg-transparent border-none p-0",
                  "cursor-text hover:text-foreground transition-colors",
                  step.is_completed
                    // Line-through + foreground/45 keeps text ≥4.5:1 on both light
                    // and dark backgrounds (AA), while still reading as "past".
                    // Decoration is muted separately so the strike doesn't add its
                    // own noise on top of the already-faded title.
                    ? "line-through text-foreground/45 decoration-foreground/25"
                    : stepRunning
                      // The currently-timing step: full foreground, no color fill.
                      // The live time on the right + the parent header's spine are
                      // the "live" signals. This row is just fully legible.
                      ? "text-foreground"
                      : "text-foreground/80"
                )}
              >
                {step.title}
              </button>
            )}

            {/* One persistent time chip — the live/elapsed timer takes priority
                over the plan window so the row never shows two competing time
                readouts. No fill, no dot. Color and font weight carry the
                state; the chip stops being a "pill" and starts being a label. */}
            {timerActive ? (
              <button
                type="button"
                onClick={() => { if (stepRunning) onStopStepTimer(step.id); else onStartStepTimer(step.id); }}
                className={cn(
                  "flex-shrink-0 inline-flex items-center gap-1 px-1 py-0.5 rounded transition-colors",
                  stepRunning
                    ? "text-primary hover:bg-primary/8"
                    : "text-muted-foreground/60 hover:text-primary hover:bg-primary/8"
                )}
                title={stepRunning
                  ? (lang === 'zh' ? '停止步骤计时' : 'Stop step timer')
                  : (lang === 'zh' ? '继续步骤计时' : 'Resume step timer')}
                aria-label={stepRunning
                  ? (lang === 'zh' ? '停止步骤计时' : 'Stop step timer')
                  : (lang === 'zh' ? '继续步骤计时' : 'Resume step timer')}
              >
                {stepRunning ? (
                  <span className="font-mono text-[11px] tabular-nums leading-none">{stepLiveLabel}</span>
                ) : (
                  <>
                    <Timer size={11} strokeWidth={1.75} />
                    <span className="font-mono text-[10px] tabular-nums leading-none">{fmtSec(stepElapsed)}</span>
                  </>
                )}
              </button>
            ) : planLabel ? (
              <button
                type="button"
                onClick={openPlanEditor}
                className="flex-shrink-0 inline-flex items-center gap-1 px-1 py-0.5 rounded text-muted-foreground/55 transition-colors hover:text-primary hover:bg-primary/8"
                title={lang === 'zh' ? '编辑计划时间' : 'Edit planned time'}
                aria-label={lang === 'zh' ? '编辑计划时间' : 'Edit planned time'}
              >
                <Clock size={11} strokeWidth={1.75} />
                <span className="font-mono text-[10px] tabular-nums leading-none">{planLabel}</span>
              </button>
            ) : null}

            {/* Hover-only action cluster: whatever the persistent chip doesn't
                already cover, plus delete. Hidden at rest to keep the row calm. */}
            <div className="flex flex-shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/step:opacity-100">
              {!timerActive && (
                <button
                  type="button"
                  onClick={() => onStartStepTimer(step.id)}
                  className="rounded-full p-1 text-muted-foreground/40 transition-colors hover:text-primary"
                  title={lang === 'zh' ? '开始步骤计时' : 'Start step timer'}
                  aria-label={lang === 'zh' ? '开始步骤计时' : 'Start step timer'}
                >
                  <Timer size={12} strokeWidth={1.75} />
                </button>
              )}
              {(!timerActive && !planLabel) && (
                <button
                  type="button"
                  onClick={openPlanEditor}
                  className={cn(
                    "rounded-full p-1 transition-colors",
                    isEditingPlan ? "text-primary" : "text-muted-foreground/40 hover:text-primary"
                  )}
                  title={lang === 'zh' ? '设置计划时间' : 'Set planned time'}
                  aria-label={lang === 'zh' ? '设置计划时间' : 'Set planned time'}
                >
                  <Clock size={12} strokeWidth={1.75} />
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  if (confirmDeleteStepId === step.id) {
                    onDeleteStep(step.id);
                    setConfirmDeleteStepId(null);
                  } else {
                    setConfirmDeleteStepId(step.id);
                  }
                }}
                onMouseLeave={() => {
                  if (confirmDeleteStepId === step.id) setConfirmDeleteStepId(null);
                }}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full transition-colors",
                  confirmDeleteStepId === step.id
                    ? "px-1.5 py-0.5 bg-destructive/12 text-destructive"
                    : "p-1 text-muted-foreground/40 hover:text-destructive"
                )}
                title={confirmDeleteStepId === step.id
                  ? (lang === 'zh' ? '再次点击确认删除' : 'Click again to confirm')
                  : (lang === 'zh' ? '删除步骤' : 'Delete step')}
                aria-label={confirmDeleteStepId === step.id
                  ? (lang === 'zh' ? '确认删除步骤' : 'Confirm delete step')
                  : (lang === 'zh' ? '删除步骤' : 'Delete step')}
              >
                {confirmDeleteStepId === step.id ? (
                  <>
                    <Trash2 size={11} strokeWidth={1.75} />
                    <span className="text-[10px] font-medium leading-none">
                      {lang === 'zh' ? '确认' : 'Delete'}
                    </span>
                  </>
                ) : (
                  <Trash2 size={12} strokeWidth={1.75} />
                )}
              </button>
            </div>
          </div>
          {isEditingPlan && (
            <div className="flex items-center gap-1 pl-6 pb-1" onClick={e => e.stopPropagation()}>
              <input
                type="time"
                value={planStart}
                onChange={e => setPlanStart(e.target.value)}
                className="bg-secondary rounded px-1 py-0.5 text-xs font-mono w-[70px] focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <span className="text-muted-foreground text-xs">→</span>
              <input
                type="time"
                value={planEnd}
                onChange={e => setPlanEnd(e.target.value)}
                className="bg-secondary rounded px-1 py-0.5 text-xs font-mono w-[70px] focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <button
                type="button"
                onClick={() => { onUpdateStepPlanTime(step.id, planStart, planEnd); setPlanTimeStepId(null); }}
                aria-label={lang === 'zh' ? '保存计划时间' : 'Save planned time'}
                className="text-primary hover:text-primary/80"
              >
                <Check size={12} />
              </button>
              {planLabel && (
                <button
                  type="button"
                  onClick={() => { onUpdateStepPlanTime(step.id, '', ''); setPlanTimeStepId(null); }}
                  className="text-[11px] text-muted-foreground/70 hover:text-destructive"
                >
                  {lang === 'zh' ? '清除' : 'Clear'}
                </button>
              )}
              <button
                type="button"
                onClick={() => setPlanTimeStepId(null)}
                aria-label={lang === 'zh' ? '取消' : 'Cancel'}
                className="text-muted-foreground hover:text-destructive"
              >
                <X size={12} />
              </button>
            </div>
          )}
          </div>
          );
        })}
        {(showAddStepInput || stepCount === 0) ? (
          <div className="flex items-center gap-2.5 py-1.5">
            <Circle size={14} className="flex-shrink-0 text-muted-foreground/30" />
            <input
              type="text"
              value={newStepTitle}
              onChange={e => setNewStepTitle(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !isImeComposing(e.nativeEvent as KeyboardEvent) && newStepTitle.trim()) {
                  onAddStep(newStepTitle);
                  setNewStepTitle('');
                } else if (e.key === 'Escape') {
                  setNewStepTitle('');
                  setShowAddStepInput(false);
                }
              }}
              onBlur={() => {
                if (newStepTitle.trim()) {
                  onAddStep(newStepTitle);
                  setNewStepTitle('');
                }
                if (stepCount > 0) setShowAddStepInput(false);
              }}
              placeholder={lang === 'zh' ? '添加步骤…' : 'Add step…'}
              className="flex-1 min-w-0 bg-transparent text-[13px] placeholder:text-muted-foreground/40 focus:outline-none"
              autoFocus={showAddStepInput}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowAddStepInput(true)}
            className="flex items-center gap-2.5 py-1.5 text-[13px] text-muted-foreground/55 transition-colors hover:text-foreground/70 self-start"
          >
            <Plus size={14} strokeWidth={1.75} className="text-muted-foreground/40" />
            <span>{lang === 'zh' ? '添加步骤' : 'Add step'}</span>
          </button>
        )}
      </div>
    )}
    </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        <ContextMenuItem onSelect={() => onToggleRecurring(!todo.is_recurring)}>
          <Repeat size={14} className={cn("mr-2", todo.is_recurring ? "text-primary" : "text-muted-foreground")} />
          <span>{todo.is_recurring
            ? (lang === 'zh' ? '停止每天重复' : 'Stop repeating daily')
            : (lang === 'zh' ? '每天重复' : 'Repeat daily')}</span>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

/* ══════════════════════════════════════════════════════════════
   Main PlanView — Split layout: Task List (left) + Timeline (right)
   ══════════════════════════════════════════════════════════════ */
export function PlanView({
  onTodosChanged,
  date,
  onViewDues,
  onViewFullTimeline,
  onOpenVoiceSheet,
  voiceSheetOpen,
  overlayOpen,
  onSwitchToRecap,
  moments = [],
  todos: todosProp,
  importedEvents: importedEventsProp = [],
  prevDayTodos = [],
  prevDayMoments = [],
  onAddMoment,
  onEditMoment,
  onDeleteMoment,
}: {
  onTodosChanged?: () => void;
  date?: string;
  onViewDues?: () => void;
  onViewFullTimeline?: () => void;
  onOpenVoiceSheet?: () => void;
  voiceSheetOpen?: boolean;
  overlayOpen?: boolean;
  onSwitchToRecap?: () => void;
  moments?: Moment[];
  todos?: Todo[];
  importedEvents?: ImportedEvent[];
  prevDayTodos?: Todo[];
  prevDayMoments?: Moment[];
  onAddMoment?: (data: {
    text?: string;
    emoji?: string;
    photos: string[];
    links?: MomentLinkPreview[];
    tags?: string[];
    isSpecial?: boolean;
    location?: { name: string; lat: number; lng: number; category?: 'restaurant' | 'coffee' | 'grocery' | 'park' | 'museum' | 'other' };
    timer_started_at?: string | null;
    timer_ended_at?: string | null;
    timer_seconds?: number | null;
    date?: string;
  }) => Promise<unknown>;
  onEditMoment?: (id: string, updates: Partial<Moment>) => void;
  onDeleteMoment?: (id: string) => void;
}) {
  const todayStr = date || format(new Date(), 'yyyy-MM-dd');
  const {
    todos: hookTodos,
    pastDayOpenTodos,
    stepsByParent,
    addTodo: rawAddTodo,
    updateTodo: rawUpdateTodo,
    deleteTodo: rawDeleteTodo,
    restoreTodo: rawRestoreTodo,
    toggleComplete: rawToggleComplete,
    addStep: rawAddStep,
    toggleStep: rawToggleStep,
    deleteStep: rawDeleteStep,
    startStepTimer: rawStartStepTimer,
    stopStepTimer: rawStopStepTimer,
    updateStepPlanTime: rawUpdateStepPlanTime,
    updateStepTitle: rawUpdateStepTitle,
    toggleRecurring,
  } = useTodos(todayStr);
  
  const { events: importedEvents } = useImportedEvents();
  const todos = todosProp ?? hookTodos;
  const dateMoments = moments;
  const dateImportedEvents = useMemo(() => {
    if (importedEventsProp.length > 0) return importedEventsProp;
    return importedEvents.filter(e => format(new Date(e.start_time), 'yyyy-MM-dd') === todayStr);
  }, [importedEvents, importedEventsProp, todayStr]);
  const { defaultPlanTags, customPlanTags, orderedPlanTags } = useCustomOptions();
  const { getWorkType: getPlanWorkType } = useWorkTypes();
  const { t: tLang, lang } = useLanguage();
  const planViewIsDark = useIsDarkMode();
  const { addReminder } = useReminders();
  const getElapsedRef = useRef<(todo: Todo) => number>(() => 0);
  const getCurrentSessionElapsedRef = useRef<(todo: Todo) => number>(() => 0);
  const clearFreshTimerStartRef = useRef<(todoId: string) => void>(() => {});
  const planTags = orderedPlanTags.map(key => {
    const def = defaultPlanTags.find(d => d.key === key);
    return def ? tLang(key) : key;
  });
  const addTodo = useCallback(async (title: string, timeSegment: Todo['time_segment'] = 'anytime', dueDate?: string, options?: { isRecurring?: boolean }) => {
    const cleanTitle = tidyTaskTitle(title);
    const result = await rawAddTodo(cleanTitle, timeSegment, dueDate, options);
    // Auto-classify tag if none assigned
    if (result && (!result.tags || result.tags.length === 0)) {
      const autoTag = autoClassifyTag(cleanTitle);
      if (autoTag) {
        await rawUpdateTodo(result.id, { tags: [autoTag] });
      }
    }
    onTodosChanged?.();
    return result;
  }, [rawAddTodo, rawUpdateTodo, onTodosChanged]);

  const updateTodo = useCallback(async (id: string, updates: Partial<Todo>) => {
    await rawUpdateTodo(id, updates);
    onTodosChanged?.();
  }, [rawUpdateTodo, onTodosChanged]);

  const deleteTodo = useCallback(async (id: string) => {
    setPausedTimers(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setShowOverlayForId(prev => prev === id ? null : prev);
    await rawDeleteTodo(id);
    onTodosChanged?.();
  }, [rawDeleteTodo, onTodosChanged]);

  // Delete with an Undo affordance: remove immediately (no blocking dialog),
  // then offer a brief window to restore the exact task that was removed.
  const deleteTodoWithUndo = useCallback((id: string) => {
    const snapshot = todos.find(t => t.id === id);
    deleteTodo(id);
    if (!snapshot) return;
    showUndoToast({
      description: lang === 'zh' ? `已删除“${snapshot.title}”` : `Deleted “${snapshot.title}”`,
      undoLabel: lang === 'zh' ? '撤销' : 'Undo',
      onUndo: () => { rawRestoreTodo(snapshot); onTodosChanged?.(); },
    });
  }, [todos, deleteTodo, rawRestoreTodo, lang, onTodosChanged]);

  const showDoneUndo = useCallback((opts: {
    todo: Pick<Todo, 'id' | 'title' | 'parent_due_id'>;
    previous: ReturnType<typeof createTodoDoneUndoSnapshot>;
  }) => {
    showUndoToast({
      description: lang === 'zh' ? `已完成"${opts.todo.title}"` : `Completed "${opts.todo.title}"`,
      undoLabel: lang === 'zh' ? '撤销' : 'Undo',
      onUndo: async () => {
        await updateTodo(opts.todo.id, restoreTodoDoneFromUndo(opts.previous));
        if (opts.todo.parent_due_id) {
          await supabase
            .from('todos')
            .update({
              progress: opts.previous.progress,
              is_completed: opts.previous.is_completed,
            })
            .eq('id', opts.todo.parent_due_id);
        }
      },
    });
  }, [lang, updateTodo]);

  const toggleComplete = useCallback(async (id: string) => {
    const todo = todos.find(t => t.id === id);
    if (!todo) return;

    const newCompleted = !todo.is_completed;
    const previousSnapshot = createTodoDoneUndoSnapshot(todo);
    const updates: Partial<Todo> = {
      is_completed: newCompleted,
      progress: newCompleted ? 100 : todo.progress,
    };

    if (newCompleted && todo.timer_started_at && !todo.timer_ended_at) {
      // Task was actively running — record end time
      updates.timer_ended_at = new Date().toISOString();
      updates.timer_seconds = getElapsedRef.current(todo);
      clearFreshTimerStartRef.current(todo.id);
      setPausedTimers(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setShowOverlayForId(prev => prev === id ? null : prev);
    } else if (newCompleted && todo.plan_started_at && !todo.timer_started_at) {
      // Plan-only completion — treat plan time as actual so Doing view matches Plan view
      const endedAt = todo.plan_ended_at ?? new Date().toISOString();
      updates.timer_started_at = todo.plan_started_at;
      updates.timer_ended_at = endedAt;
      updates.timer_seconds = Math.max(0, Math.floor(
        (new Date(endedAt).getTime() - new Date(todo.plan_started_at).getTime()) / 1000
      ));
    } else if (newCompleted && !todo.timer_started_at && !todo.plan_started_at) {
      Object.assign(updates, getAutoDoneTimerUpdates(todo));
    }

    await rawUpdateTodo(id, updates);
    onTodosChanged?.();

    // Only offer undo when we're marking Done (accidental clicks); reverting
    // to open state is already trivial (re-click the circle).
    if (newCompleted) {
      showDoneUndo({
        todo,
        previous: previousSnapshot,
      });
    }
  }, [todos, rawUpdateTodo, onTodosChanged, showDoneUndo]);

  const isEnterSubmit = (e: React.KeyboardEvent) => {
    const native = e.nativeEvent as KeyboardEvent;
    return e.key === 'Enter' && !e.shiftKey && !isImeComposing(native);
  };

  const [newTitle, setNewTitle] = useState('');
  const [selectedEmoji, setSelectedEmoji] = useState<string | null>(null);
  const taskHistory = useTaskHistory();
  const [suggestionsDismissed, setSuggestionsDismissed] = useState(false);
  const taskSuggestions = useTaskSuggestions(taskHistory, suggestionsDismissed ? '' : newTitle);
  const taskInputRef = useRef<HTMLTextAreaElement>(null);
  const taskColumnRef = useRef<HTMLDivElement>(null);
  const timelineFrameRef = useRef<HTMLDivElement>(null);
  const [taskInputDock, setTaskInputDock] = useState<{ left: number; width: number } | null>(null);
  const [recapDock, setRecapDock] = useState<{ right: number; bottom: number } | null>(null);
  
  const [collapsedSegments, setCollapsedSegments] = useState<Set<string>>(new Set());
  const [archiveCollapsed, setArchiveCollapsed] = useState(true);

  const [addingSegment, setAddingSegment] = useState<string | null>(null);
  const [segmentNewTitle, setSegmentNewTitle] = useState('');
  const [isAddingQuick, setIsAddingQuick] = useState(false);
  const [listMode, setListModeState] = useState<'grouped' | 'flat'>(() => readPlanListMode());
  const setListMode = useCallback((mode: 'grouped' | 'flat') => {
    setListModeState(mode);
    if (typeof window !== 'undefined') {
      localStorage.setItem(PLAN_LIST_MODE_KEY, mode);
      window.dispatchEvent(new CustomEvent('plan-list-mode-change', { detail: mode }));
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(PLAN_LIST_MODE_KEY, listMode);
  }, [listMode]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleListModeChange = (event: Event) => {
      const next = (event as CustomEvent<'grouped' | 'flat'>).detail;
      if (next === 'grouped' || next === 'flat') setListModeState(next);
    };
    window.addEventListener('plan-list-mode-change', handleListModeChange);
    return () => window.removeEventListener('plan-list-mode-change', handleListModeChange);
  }, []);

  const [_initPauseStates] = useState<Map<string, { pausedAt: number | null; totalPausedMs: number }>>(() => {
    try {
      const raw = localStorage.getItem('plan-pause-states');
      if (raw) {
        const obj = JSON.parse(raw) as Record<string, { pausedAt: number | null; totalPausedMs: number }>;
        return new Map(Object.entries(obj));
      }
    } catch {
      // Ignore malformed persisted pause state and fall back to defaults.
    }
    return new Map();
  });
  const pauseStatesRef = useRef(_initPauseStates);
  const [pausedTimers, setPausedTimers] = useState<Set<string>>(() => {
    const s = new Set<string>();
    _initPauseStates.forEach((v, k) => { if (v.pausedAt !== null) s.add(k); });
    return s;
  });
  const [pauseStateVersion, setPauseStateVersion] = useState(0);
  const [showOverlayForId, setShowOverlayForId] = useState<string | null>(null);
  const startFocusInFlightRef = useRef<Set<string>>(new Set());
  const [pendingStopIds, setPendingStopIds] = useState<Set<string>>(new Set());
  const [freshTimerStarts, setFreshTimerStarts] = useState<Record<string, string>>({});
  const [tick, setTick] = useState(0);
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const [recurringUntilDone, setRecurringUntilDone] = useState(false);
  const [reminderConfig, setReminderConfig] = useState<{ enabled: boolean; type: 'browser' | 'email'; intervalDays: number }>({ enabled: false, type: 'browser', intervalDays: 1 });
  // User-picked time slot for the next quick-add. null = auto-follow the current
  // hour's segment (so it stays correct through the day until explicitly chosen).
  const [quickSegmentOverride, setQuickSegmentOverride] = useState<Todo['time_segment'] | null>(null);
  const [showFullTimeline, setShowFullTimeline] = useState(false);
  const [timelineRhythmPresetId] = useState(loadPlanTimelineRhythmPresetId);
  const timelineRhythmPreset = useMemo(() => getPlanTimelineRhythmPreset(timelineRhythmPresetId), [timelineRhythmPresetId]);
  const timelineRhythmPalette = useMemo(() => presetToRhythmPalette(timelineRhythmPreset), [timelineRhythmPreset]);
  const [captureSheetOpen, setCaptureSheetOpen] = useState(false);
  const [captureDraft, setCaptureDraft] = useState('');
  const [captureMood, setCaptureMood] = useState<(typeof CAPTURE_MOODS)[number] | null>(null);
  const [capturePhotos, setCapturePhotos] = useState<string[]>([]);
  const [captureLinks, setCaptureLinks] = useState<MomentLinkPreview[]>([]);
  const [isResolvingCaptureLink, setIsResolvingCaptureLink] = useState(false);
  const [captureLocation, setCaptureLocation] = useState<{ name: string; lat: number; lng: number; category: 'restaurant' | 'coffee' | 'grocery' | 'park' | 'museum' | 'other' } | null>(null);
  const [captureLocationAutoFilled, setCaptureLocationAutoFilled] = useState(false);
  const [showCaptureLocationPopover, setShowCaptureLocationPopover] = useState(false);
  const [showMoodDrawer, setShowMoodDrawer] = useState(false);
  const captureFileInputRef = useRef<HTMLInputElement>(null);
  const [isSavingCapture, setIsSavingCapture] = useState(false);
  const [timerDockPos, setTimerDockPos] = useState<{ x: number; y: number } | null>(() => {
    try {
      const saved = localStorage.getItem('plan-floating-timer-pos');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const timerDockRef = useRef<HTMLDivElement>(null);
  const timerDockDragRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startX: number;
    startY: number;
    /** True only after user moved past TIMER_DOCK_DRAG_COMMIT_PX — then we hold pointer capture */
    committed: boolean;
  } | null>(null);
  const suppressTimerClickRef = useRef(false);
  const { user } = useAuth();
  const captureDraftStorageKey = useMemo(
    () => `plan-capture-draft:${user?.id || 'guest'}:${todayStr}`,
    [todayStr, user?.id]
  );
  const todayActiveTimerTodos = useMemo(
    () => todos.filter(t => isActivelyRunningTodo(t) && !pendingStopIds.has(t.id)),
    [todos, pendingStopIds],
  );
  // A focus timer started yesterday and never stopped keeps running past
  // midnight. Its todo record stays filed under yesterday (rollOverYesterdayTodos
  // deliberately skips timers), so without this it would vanish from today's
  // live bookkeeping — the timeline tail would freeze and no FloatingTimer would
  // show. Fold those still-running prev-day todos in (deduped) so the timer
  // "follows" into today: live growth + floating pill + reset-on-new-task all
  // treat it as active. Only bookkeeping/overlay consume this list, never the
  // task-list render, so no duplicate row appears.
  const prevDayActiveTimerTodos = useMemo(
    () => (prevDayTodos || []).filter(
      t => isActivelyRunningTodo(t) && !pendingStopIds.has(t.id) && !todos.some(td => td.id === t.id),
    ),
    [prevDayTodos, pendingStopIds, todos],
  );
  const activeTimerTodos = useMemo(
    () => [...todayActiveTimerTodos, ...prevDayActiveTimerTodos],
    [todayActiveTimerTodos, prevDayActiveTimerTodos],
  );
  const restingTodos = todos.filter(t => !t.is_completed && !isActivelyRunningTodo(t) && (t.timer_seconds || 0) > 0 && !!t.timer_ended_at);
  // Tasks whose work is happening via a running STEP timer (not the task's own
  // timer). Maps parentId → the running step's `timer_started_at`. Used to
  // surface the parent on the timeline as an "ongoing" block (synthesized from
  // the step) and to keep the per-second tick alive while only a step runs.
  const runningStepByParent = useMemo(() => {
    const map = new Map<string, string>();
    for (const [pid, steps] of Object.entries(stepsByParent)) {
      // A finished parent's block must not keep live-extending to "now". Once the
      // user has ended/completed the parent, a still-running (or forgotten) child
      // step is stale — ignoring it here stops the timeline block from following
      // the clock forever.
      const parent = todos.find(t => t.id === pid);
      if (parent?.is_completed) continue;
      const running = steps.find(s => !!s.timer_started_at);
      if (running?.timer_started_at) map.set(pid, running.timer_started_at);
    }
    return map;
  }, [stepsByParent, todos]);
  const defaultQuickSegment = getTimeSegmentForHour(new Date().getHours()) as Todo['time_segment'];
  // Effective slot the next quick-add lands in: the user's explicit pick, or —
  // until they pick — the segment for the current hour.
  const effectiveQuickSegment = quickSegmentOverride ?? defaultQuickSegment;

  // Clean up pendingStopIds only once todos reflects the task has actually stopped —
  // prevents the FloatingTimer from briefly remounting (which resets its mountTime cap).
  useEffect(() => {
    if (pendingStopIds.size === 0) return;
    setPendingStopIds(prev => {
      const next = new Set(prev);
      let changed = false;
      prev.forEach(id => {
        const todo = todos.find(t => t.id === id);
        if (!todo || !isActivelyRunningTodo(todo)) { next.delete(id); changed = true; }
      });
      return changed ? next : prev;
    });
  }, [todos]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (activeTimerTodos.length === 0 && restingTodos.length === 0 && runningStepByParent.size === 0) return;
    const interval = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, [activeTimerTodos.length, restingTodos.length, runningStepByParent.size]);

  useEffect(() => {
    const saved = localStorage.getItem(captureDraftStorageKey);
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved) as {
        draft?: string;
        mood?: (typeof CAPTURE_MOODS)[number] | null;
        photos?: string[];
        links?: MomentLinkPreview[];
        location?: { name: string; lat: number; lng: number; category: 'restaurant' | 'coffee' | 'grocery' | 'park' | 'museum' | 'other' } | null;
      };
      setCaptureDraft(parsed.draft || '');
      setCaptureMood(parsed.mood || null);
      setCapturePhotos(Array.isArray(parsed.photos) ? parsed.photos : []);
      setCaptureLinks(Array.isArray(parsed.links) ? parsed.links : []);
      setCaptureLocation(parsed.location || null);
      // A location restored from a saved draft is a USER choice, not auto-filled —
      // it should look like a normal chip, not the muted "auto" variant.
      if (parsed.location) setCaptureLocationAutoFilled(false);
    } catch {
      localStorage.removeItem(captureDraftStorageKey);
    }
  }, [captureDraftStorageKey]);

  // Auto-tag current location when the user opens the Capture sheet, unless:
  //   - they already have a location (manual or restored draft)
  //   - they denied geolocation earlier in this browser session
  //   - the browser has no geolocation support
  // Failures (denied, unavailable, reverse-geocode error) are silent and set
  // a session-scoped "denied" flag so we don't re-prompt every time the user
  // re-opens the sheet within the same session. A new browser session retries.
  useEffect(() => {
    if (!captureSheetOpen) return;
    if (captureLocation) return;
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    if (sessionStorage.getItem('capture-geo-denied') === '1') return;

    let cancelled = false;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        if (cancelled) return;
        const { latitude: lat, longitude: lng } = pos.coords;
        try {
          const { data, error } = await supabase.functions.invoke('geo', {
            body: { type: 'reverse', lat, lng },
          });
          if (cancelled) return;
          if (error) throw error;
          const rawName = String(data?.name ?? '').trim();
          const city = String(data?.city ?? '').trim();
          const name = (!rawName || rawName === 'Nearby') ? (city || 'Current location') : rawName;
          const category = (data?.category || 'other') as 'restaurant' | 'coffee' | 'grocery' | 'park' | 'museum' | 'other';
          // Re-check in case the user picked one manually while we were
          // resolving — never clobber an explicit choice.
          setCaptureLocation((prev) => prev ?? { name, lat, lng, category });
          setCaptureLocationAutoFilled(true);
        } catch {
          // reverse-geocode failed but we still know coords — fall back to a
          // generic "Current location" tag rather than dropping the data.
          if (cancelled) return;
          setCaptureLocation((prev) => prev ?? { name: 'Current location', lat, lng, category: 'other' });
          setCaptureLocationAutoFilled(true);
        }
      },
      () => {
        // Denied / unavailable / timeout. Stay quiet for the rest of the session.
        try { sessionStorage.setItem('capture-geo-denied', '1'); } catch { /* private mode */ }
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60_000 },
    );
    return () => { cancelled = true; };
  }, [captureSheetOpen, captureLocation]);

  useEffect(() => {
    const hasDraft = Boolean(
      captureDraft.trim() ||
      captureMood ||
      capturePhotos.length > 0 ||
      captureLinks.length > 0 ||
      captureLocation
    );
    if (!hasDraft) {
      localStorage.removeItem(captureDraftStorageKey);
      return;
    }
    localStorage.setItem(
      captureDraftStorageKey,
      JSON.stringify({
        draft: captureDraft,
        mood: captureMood,
        photos: capturePhotos,
        links: captureLinks,
        location: captureLocation,
      })
    );
  }, [captureDraft, captureDraftStorageKey, captureLocation, captureMood, capturePhotos, captureLinks]);
  void pauseStateVersion;

  const getElapsed = (todo: Todo) => {
    const accumulatedSec = Math.max(0, todo.timer_seconds || 0);
    const startedAtISO = freshTimerStarts[todo.id] ?? todo.timer_started_at;
    if (!startedAtISO) return accumulatedSec;
    const startedAt = new Date(startedAtISO).getTime();
    if (!Number.isFinite(startedAt)) return accumulatedSec;
    const pauseState = pauseStatesRef.current.get(todo.id);
    const now = Date.now();
    const currentPauseMs = pauseState?.pausedAt ? (now - pauseState.pausedAt) : 0;
    const totalPausedMs = (pauseState?.totalPausedMs || 0) + currentPauseMs;
    const sessionSec = Math.max(0, Math.floor((now - startedAt - totalPausedMs) / 1000));
    return accumulatedSec + sessionSec;
  };

  const getCurrentSessionElapsed = (todo: Todo) => {
    const startedAtISO = freshTimerStarts[todo.id] ?? todo.timer_started_at;
    if (!startedAtISO) return 0;
    const startedAt = new Date(startedAtISO).getTime();
    if (!Number.isFinite(startedAt)) return 0;
    const pauseState = pauseStatesRef.current.get(todo.id);
    const now = Date.now();
    const currentPauseMs = pauseState?.pausedAt ? (now - pauseState.pausedAt) : 0;
    const totalPausedMs = (pauseState?.totalPausedMs || 0) + currentPauseMs;
    return Math.max(0, Math.floor((now - startedAt - totalPausedMs) / 1000));
  };
  getElapsedRef.current = getElapsed;
  getCurrentSessionElapsedRef.current = getCurrentSessionElapsed;

  const savePauseStatesToStorage = useCallback(() => {
    try {
      const obj: Record<string, { pausedAt: number | null; totalPausedMs: number }> = {};
      pauseStatesRef.current.forEach((v, k) => { obj[k] = v; });
      localStorage.setItem('plan-pause-states', JSON.stringify(obj));
    } catch {
      // Ignore storage failures in private mode.
    }
  }, []);

  const clearPauseState = useCallback((todoId: string) => {
    pauseStatesRef.current.delete(todoId);
    savePauseStatesToStorage();
    setPausedTimers(prev => {
      const next = new Set(prev);
      next.delete(todoId);
      return next;
    });
    setPauseStateVersion(v => v + 1);
  }, [savePauseStatesToStorage]);

  const clearFreshTimerStart = useCallback((todoId: string) => {
    setFreshTimerStarts(prev => {
      if (!prev[todoId]) return prev;
      const next = { ...prev };
      delete next[todoId];
      return next;
    });
  }, []);
  clearFreshTimerStartRef.current = clearFreshTimerStart;

  // The floating timer lives WITHIN the timeline column, not the whole viewport
  // (the logged-in layout has a chat panel on the right). Bound dragging/snapping
  // to the timeline frame so "靠边" means the timeline's visible edges, never
  // stranded mid-screen or hidden behind the chat panel.
  const getTimelineBounds = useCallback(() => {
    const r = timelineFrameRef.current?.getBoundingClientRect();
    if (r && r.width > 0) return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    return { left: 0, right: window.innerWidth, top: 0, bottom: window.innerHeight };
  }, []);

  const clampTimerDock = useCallback((x: number, y: number) => {
    const rect = timerDockRef.current?.getBoundingClientRect();
    const width = rect?.width || 220;
    const height = rect?.height || 72;
    const margin = 10;
    const b = getTimelineBounds();
    return {
      x: Math.min(Math.max(b.left + margin, x), Math.max(b.left + margin, b.right - width - margin)),
      y: Math.min(Math.max(b.top + margin, y), Math.max(b.top + margin, b.bottom - height - margin)),
    };
  }, [getTimelineBounds]);

  const handleTimerDockPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const rect = timerDockRef.current?.getBoundingClientRect();
    if (!rect) return;
    timerDockDragRef.current = {
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startX: rect.left,
      startY: rect.top,
      committed: false,
    };
    /* Defer setPointerCapture until committed — immediate capture steals the gesture and blocks FloatingTimer click */
  }, []);

  const handleTimerDockPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = timerDockDragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const dx = e.clientX - drag.startClientX;
    const dy = e.clientY - drag.startClientY;
    if (!drag.committed) {
      if (Math.abs(dx) + Math.abs(dy) < TIMER_DOCK_DRAG_COMMIT_PX) return;
      drag.committed = true;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
    const next = clampTimerDock(drag.startX + dx, drag.startY + dy);
    setTimerDockPos(next);
  }, [clampTimerDock]);

  const handleTimerDockPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = timerDockDragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const committed = drag.committed;
    timerDockDragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
    if (committed) {
      suppressTimerClickRef.current = true;
      setTimerDockPos((current) => {
        if (!current) return current;
        // iOS-PiP-style: snap to the nearest horizontal edge so the pill never
        // strands awkwardly floating in the middle of the screen.
        const rect = timerDockRef.current?.getBoundingClientRect();
        const width = rect?.width || 220;
        const margin = 10;
        const b = getTimelineBounds();
        const centerX = current.x + width / 2;
        const snappedX = centerX < (b.left + b.right) / 2
          ? b.left + margin
          : Math.max(b.left + margin, b.right - width - margin);
        const snapped = clampTimerDock(snappedX, current.y);
        localStorage.setItem('plan-floating-timer-pos', JSON.stringify(snapped));
        return snapped;
      });
      window.setTimeout(() => {
        suppressTimerClickRef.current = false;
      }, 0);
    }
  }, [clampTimerDock, getTimelineBounds]);

  const handleTimerDockPointerCancel = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = timerDockDragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    timerDockDragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
  }, []);

  // After mount/reload, re-snap any saved dock position INTO the timeline's
  // bounds and onto its nearest edge. We retry on a few frames because the
  // timeline frame may not be measured yet on the first frame — without this
  // the bounds fall back to the full viewport and the pill wrongly snaps to the
  // far-left task panel.
  const didSnapOnMountRef = useRef(false);
  useEffect(() => {
    if (didSnapOnMountRef.current) return;
    if (!timerDockPos) return;

    let raf = 0;
    let attempts = 0;
    const trySnap = () => {
      const frame = timelineFrameRef.current?.getBoundingClientRect();
      // Wait until the timeline frame is actually laid out.
      if (!frame || frame.width < 50) {
        if (attempts++ < 30) { raf = requestAnimationFrame(trySnap); }
        return;
      }
      didSnapOnMountRef.current = true;
      setTimerDockPos((current) => {
        if (!current) return current;
        const dockRect = timerDockRef.current?.getBoundingClientRect();
        const width = dockRect?.width || 220;
        const margin = 10;
        // Always re-home to the RIGHT edge of the timeline on load, so a
        // previously dragged/stale position never strands the pill on the left.
        const snappedX = Math.max(frame.left + margin, frame.right - width - margin);
        const snapped = clampTimerDock(snappedX, current.y);
        if (snapped.x === current.x && snapped.y === current.y) return current;
        localStorage.setItem('plan-floating-timer-pos', JSON.stringify(snapped));
        return snapped;
      });
    };
    raf = requestAnimationFrame(trySnap);
    return () => cancelAnimationFrame(raf);
  }, [timerDockPos, clampTimerDock]);

  // Re-clamp a saved dock position back into view on window resize. Without
  // this, a position saved while the window was wider can leave the pills (and
  // their clipped timers) stranded off the right/bottom edge.
  useEffect(() => {
    if (!timerDockPos) return;
    const reclamp = () => {
      setTimerDockPos((current) => {
        if (!current) return current;
        const clamped = clampTimerDock(current.x, current.y);
        if (clamped.x === current.x && clamped.y === current.y) return current;
        return clamped;
      });
    };
    reclamp();
    window.addEventListener('resize', reclamp);
    // Also re-clamp when the dock's own size changes (e.g. a longer task title
    // makes the pill wider), so growth never pushes it off the right edge.
    const dockEl = timerDockRef.current;
    let ro: ResizeObserver | undefined;
    if (dockEl && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => reclamp());
      ro.observe(dockEl);
    }
    return () => {
      window.removeEventListener('resize', reclamp);
      ro?.disconnect();
    };
  }, [timerDockPos, clampTimerDock]);

  const withFreshTimerStart = useCallback((todo: Todo) => {
    const timerStartedAt = freshTimerStarts[todo.id];
    return timerStartedAt ? { ...todo, timer_started_at: timerStartedAt } : todo;
  }, [freshTimerStarts]);

  const handlePauseStateChange = useCallback((todoId: string, pauseState: { pausedAt: number | null; totalPausedMs: number }) => {
    if (pauseState.pausedAt === null && pauseState.totalPausedMs === 0) {
      pauseStatesRef.current.delete(todoId);
    } else {
      pauseStatesRef.current.set(todoId, pauseState);
    }
    savePauseStatesToStorage();
    setPausedTimers(prev => {
      const next = new Set(prev);
      if (pauseState.pausedAt !== null) next.add(todoId);
      else next.delete(todoId);
      return next;
    });
    setPauseStateVersion(v => v + 1);
  }, [savePauseStatesToStorage]);

  const [resetPromptTodoId, setResetPromptTodoId] = useState<string | null>(null);

  const handleStartFocus = (todo: Todo) => {
    if (startFocusInFlightRef.current.has(todo.id)) return;
    startFocusInFlightRef.current.add(todo.id);
    try {
      // If already actively timing (started but not ended), check if it's a scheduled task
      if (todo.timer_started_at && !todo.timer_ended_at) {
        // Check if this was a pre-scheduled timer (started time is in the past, more than 30s ago)
        const startedAt = new Date(todo.timer_started_at).getTime();
        const diff = Date.now() - startedAt;
        if (diff > 30000) {
          // Show reset/resume prompt
          setResetPromptTodoId(todo.id);
          return;
        }
        setShowOverlayForId(todo.id);
        return;
      }
      // Start a fresh timer from now, keep plan fields intact
      const startISO = new Date().toISOString();
      clearPauseState(todo.id);
      setFreshTimerStarts(prev => ({ ...prev, [todo.id]: startISO }));
      const hasAnotherActiveTimer =
        activeTimerTodos.some(t => t.id !== todo.id) ||
        (showOverlayForId !== null && showOverlayForId !== todo.id);
      if (!hasAnotherActiveTimer) {
        setShowOverlayForId(todo.id);
      }
      updateTodo(todo.id, { timer_started_at: startISO, timer_ended_at: null });
      window.dispatchEvent(new Event('eol-timer-started'));
    } finally {
      setTimeout(() => startFocusInFlightRef.current.delete(todo.id), 400);
    }
  };

  const reopenTodoFromDone = useCallback(async (todo: Todo) => {
    if (!todo.is_completed) return todo;
    const reopenProgress = Math.min(99, Math.max(0, todo.progress || 0));
    await updateTodo(todo.id, {
      is_completed: false,
      progress: reopenProgress,
    });

    if (todo.parent_due_id) {
      await supabase
        .from('todos')
        .update({ progress: reopenProgress, is_completed: false })
        .eq('id', todo.parent_due_id);
    }

    return {
      ...todo,
      is_completed: false,
      progress: reopenProgress,
    };
  }, [updateTodo]);

  const handleContinueTimingFromDone = async (todo: Todo) => {
    if (!todo.is_completed) {
      handleStartFocus(todo);
      return;
    }

    const reopened = await reopenTodoFromDone(todo);

    handleStartFocus(reopened);
  };

  const handleResetTimer = (todoId: string) => {
    const startISO = new Date().toISOString();
    clearPauseState(todoId);
    setFreshTimerStarts(prev => ({ ...prev, [todoId]: startISO }));
    updateTodo(todoId, { timer_started_at: startISO, timer_ended_at: null, timer_seconds: 0 });
    window.dispatchEvent(new Event('eol-timer-started'));
    setResetPromptTodoId(null);
    setShowOverlayForId(todoId);
  };

  const handleResumeTimer = (todoId: string) => {
    setResetPromptTodoId(null);
    setShowOverlayForId(todoId);
  };

  const handleTogglePause = (todoId: string) => {
    setPausedTimers(prev => {
      const next = new Set(prev);
      if (next.has(todoId)) next.delete(todoId);
      else next.add(todoId);
      return next;
    });
  };

  const handleStopTimer = async (todoId: string) => {
    const todo = todos.find(t => t.id === todoId) ?? (prevDayTodos || []).find(t => t.id === todoId);
    if (!todo?.timer_started_at) return;

    const elapsed = getElapsed(todo);
    const isDueChild = Boolean(todo.parent_due_id);
    const nextProgress = isDueChild ? Math.max(0, Math.min(100, todo.progress || 0)) : 100;
    const nextCompleted = isDueChild ? nextProgress >= 100 : true;

    await updateTodo(todoId, {
      timer_ended_at: new Date().toISOString(),
      timer_seconds: elapsed,
      progress: nextProgress,
      is_completed: nextCompleted,
    });

    if (isDueChild) {
      await supabase.from('todos').update({ progress: nextProgress, is_completed: nextProgress >= 100 }).eq('id', todo.parent_due_id!);
    }

    clearPauseState(todoId);
    setShowOverlayForId(null);
  };

  const handleCancelTimer = (todoId: string) => {
    updateTodo(todoId, { timer_started_at: null, timer_ended_at: null });
    clearPauseState(todoId);
    setShowOverlayForId(null);
  };

  const handleToggleWithProgress = async (todo: Todo) => {
    const next = todo.is_completed ? 0 : 100;
    const willComplete = !todo.is_completed;
    const previousSnapshot = createTodoDoneUndoSnapshot(todo);
    const updates: Partial<Todo> = { progress: next, is_completed: willComplete };

    if (willComplete && todo.timer_started_at && !todo.timer_ended_at) {
      updates.timer_ended_at = new Date().toISOString();
      updates.timer_seconds = getElapsed(todo);
      clearFreshTimerStart(todo.id);
      setPausedTimers(prev => {
        const n = new Set(prev);
        n.delete(todo.id);
        return n;
      });
      setShowOverlayForId(prev => prev === todo.id ? null : prev);
    } else if (willComplete && todo.plan_started_at && !todo.timer_started_at) {
      const endedAt = todo.plan_ended_at ?? new Date().toISOString();
      updates.timer_started_at = todo.plan_started_at;
      updates.timer_ended_at = endedAt;
      updates.timer_seconds = Math.max(0, Math.floor(
        (new Date(endedAt).getTime() - new Date(todo.plan_started_at).getTime()) / 1000
      ));
    } else if (willComplete && !todo.timer_started_at && !todo.plan_started_at) {
      Object.assign(updates, getAutoDoneTimerUpdates(todo));
    }

    await updateTodo(todo.id, updates);
    if (todo.parent_due_id) {
      await supabase.from('todos').update({ progress: next, is_completed: next >= 100 }).eq('id', todo.parent_due_id);
    }

    if (willComplete) {
      showDoneUndo({
        todo,
        previous: previousSnapshot,
      });
    }
  };

  const handleAdd = async (startTimer = false) => {
    if (isAddingQuick || !newTitle.trim()) return;
    const plainTitle = newTitle.trim();
    const emoji = selectedEmoji;
    setNewTitle(''); setSelectedEmoji(null); setIsAddingQuick(true);
    setPlusMenuOpen(false); // collapse the time-slot/options menu on submit
    try {
      const title = emoji ? `${emoji} ${plainTitle}` : plainTitle;
      const wasRecurring = recurringUntilDone;
      const newTodo = await addTodo(title, effectiveQuickSegment, undefined, { isRecurring: wasRecurring });
      if (newTodo && reminderConfig.enabled) {
        await addReminder(title, reminderConfig.intervalDays, `Task reminder (${todayStr})`, reminderConfig.type);
      }
      if (wasRecurring) {
        setRecurringUntilDone(false);
        if (newTodo) {
          toast(lang === 'zh' ? '已设为每天重复·明天起自动出现' : 'Set to repeat daily · appears automatically from tomorrow');
        }
      }
      if (startTimer && newTodo) {
        const startISO = new Date().toISOString();
        setFreshTimerStarts(prev => ({ ...prev, [newTodo.id]: startISO }));
        await updateTodo(newTodo.id, { timer_started_at: startISO });
        if (activeTimerTodos.length === 0 && showOverlayForId === null) {
          setShowOverlayForId(newTodo.id);
        }
      }
    } finally { setIsAddingQuick(false); }
  };

  const acceptSuggestion = (title: string) => {
    setNewTitle(title);
    setSuggestionsDismissed(true);
    requestAnimationFrame(() => {
      const el = taskInputRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(title.length, title.length);
    });
  };

  const toggleSegment = (id: string) => {
    setCollapsedSegments(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const [dragTodoId, setDragTodoId] = useState<string | null>(null);

  useEffect(() => {
    const updateTaskInputDock = () => {
      if (!taskColumnRef.current) return;
      const rect = taskColumnRef.current.getBoundingClientRect();
      setTaskInputDock({
        left: rect.left + 8,
        width: Math.max(240, rect.width - 16),
      });
    };

    updateTaskInputDock();

    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => updateTaskInputDock())
      : null;
    if (resizeObserver && taskColumnRef.current) resizeObserver.observe(taskColumnRef.current);

    window.addEventListener('resize', updateTaskInputDock);
    window.addEventListener('scroll', updateTaskInputDock, true);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', updateTaskInputDock);
      window.removeEventListener('scroll', updateTaskInputDock, true);
    };
  }, []);

  useEffect(() => {
    const updateRecapDock = () => {
      if (!timelineFrameRef.current) return;
      const rect = timelineFrameRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
      setRecapDock({
        right: Math.max(18, viewportWidth - rect.right + 18),
        bottom: 22,
      });
    };

    updateRecapDock();

    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => updateRecapDock())
      : null;
    if (resizeObserver && timelineFrameRef.current) resizeObserver.observe(timelineFrameRef.current);

    window.addEventListener('resize', updateRecapDock);
    window.addEventListener('scroll', updateRecapDock, true);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', updateRecapDock);
      window.removeEventListener('scroll', updateRecapDock, true);
    };
  }, []);

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; };
  const handleDrop = (segmentId: string, dropIndex?: number) => (e: React.DragEvent) => {
    e.preventDefault();
    if (!dragTodoId) return;
    const draggedTodo = todos.find(t => t.id === dragTodoId);
    if (!draggedTodo) { setDragTodoId(null); return; }
    const segTodos = todos.filter(t => t.time_segment === segmentId && t.id !== dragTodoId);
    const insertAt = dropIndex != null ? Math.min(dropIndex, segTodos.length) : segTodos.length;
    segTodos.splice(insertAt, 0, draggedTodo);
    const updates: Promise<void>[] = [];
    if (draggedTodo.time_segment !== segmentId) updates.push(updateTodo(dragTodoId, { time_segment: segmentId as Todo['time_segment'], sort_order: insertAt }));
    else updates.push(updateTodo(dragTodoId, { sort_order: insertAt }));
    segTodos.forEach((t, i) => { if (t.id !== dragTodoId && t.sort_order !== i) updates.push(updateTodo(t.id, { sort_order: i })); });
    Promise.all(updates);
    setDragTodoId(null);
  };

  // Handle dropping a todo from the list onto the timeline
  const handleDropOnTimeline = useCallback((todoId: string, startMin: number) => {
    const todo = todos.find(t => t.id === todoId);
    if (!todo) return;
    const targetDay = todayStr;
    const startH = Math.floor(startMin / 60);
    const startM = startMin % 60;
    const tag = todo.tags?.[0] || autoClassifyTag(todo.title) || '';
    const smartDur = ['admin','finance','shopping','travel'].includes(tag) ? 15
      : ['life'].includes(tag) ? 20
      : ['social'].includes(tag) ? 30
      : ['health'].includes(tag) ? 45
      : ['study','work','event'].includes(tag) ? 60
      : 30;
    const endMin = startMin + smartDur;
    const endH = Math.floor(endMin / 60);
    const endM = endMin % 60;
    const startISO = new Date(`${targetDay}T${String(startH).padStart(2, '0')}:${String(startM).padStart(2, '0')}:00`).toISOString();
    const endISO = new Date(`${targetDay}T${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}:00`).toISOString();
    // 只设置计划时间；实际执行(actual)只能通过番茄钟或在 Actual 模式下补记
    updateTodo(todoId, {
      plan_started_at: startISO,
      plan_ended_at: endISO,
    });
  }, [todos, todayStr, updateTodo]);

  // Carried-over unfinished tasks from prior days now live directly in the
  // main task list (the user wants them mixed in, not tucked in a separate
  // collapsed section). mergeCarriedTodos collapses same-title copies to a
  // single row so a task left unfinished across several days doesn't show up as
  // two or three "ghosts". See src/lib/carryTodos.ts for the dedupe rules.
  const mainListTodos = useMemo(
    () => mergeCarriedTodos(todos, pastDayOpenTodos),
    [todos, pastDayOpenTodos]
  );

  const grouped = TIME_SEGMENTS.map(seg => {
    const segTodos = mainListTodos.filter(t => t.time_segment === seg.id && !t.is_completed);
    segTodos.sort((a, b) => {
      const aDoing = isActivelyRunningTodo(a) ? 1 : 0;
      const bDoing = isActivelyRunningTodo(b) ? 1 : 0;
      if (aDoing !== bDoing) return bDoing - aDoing;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    return { ...seg, todos: segTodos };
  });

  const archivedTodos = useMemo(() => {
    const done = todos.filter(t => t.is_completed);
    done.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return done;
  }, [todos]);
  const captureMoments = useMemo(() => {
    return [...dateMoments]
      .filter(moment => moment.tags?.includes(CAPTURE_NOTE_TAG))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [dateMoments]);
  const latestCaptureMoments = captureMoments.slice(0, 3);

  const getInheritedPlanActualRange = useCallback((todo: Todo) => {
    if (!todo.plan_started_at || !todo.plan_ended_at) return null;
    if (!todo.timer_started_at) return null;
    if ((todo.timer_seconds || 0) > 0 || todo.timer_ended_at) return null;

    const planStartMs = new Date(todo.plan_started_at).getTime();
    const planEndMs = new Date(todo.plan_ended_at).getTime();
    if (!Number.isFinite(planStartMs) || !Number.isFinite(planEndMs) || planEndMs <= planStartMs) {
      return null;
    }

    // Only inherit the plan window as the actual span when the plan and the
    // running timer started on the SAME day. A timer forgotten overnight has
    // its plan rolled forward to today (rollOverYesterdayTodos), so inheriting
    // it would drag yesterday's session onto today. Fall back to the real
    // timer_started_at in that case.
    const timerStartMs = new Date(todo.timer_started_at).getTime();
    if (
      !Number.isFinite(timerStartMs) ||
      new Date(planStartMs).toDateString() !== new Date(timerStartMs).toDateString()
    ) {
      return null;
    }

    return {
      startISO: todo.plan_started_at,
      endISO: todo.plan_ended_at,
    };
  }, []);

  const logFocusSessionMoment = useCallback(async (todo: Todo, workingSec: number, endedAtISO: string) => {
    if (!onAddMoment || !todo.timer_started_at || workingSec <= 0) return;
    const inheritedPlanRange = getInheritedPlanActualRange(todo);
    const sessionStartISO = inheritedPlanRange?.startISO ?? todo.timer_started_at;
    // Bucket the moment on the day the session actually STARTED, not the day
    // currently being viewed. Otherwise a timer forgotten overnight (started
    // yesterday, closed today) lands on today and shows as a phantom block.
    const sessionStartMs = new Date(sessionStartISO).getTime();
    const sessionDate = Number.isFinite(sessionStartMs)
      ? format(new Date(sessionStartMs), 'yyyy-MM-dd')
      : undefined;
    await onAddMoment({
      ...(sessionDate ? { date: sessionDate } : {}),
      text: todo.title,
      emoji: extractLeadingEmoji(todo.title),
      photos: [],
      tags: ['focus-session', `todo-session:${todo.id}`, ...(todo.tags || [])],
      timer_started_at: sessionStartISO,
      timer_ended_at: endedAtISO,
      timer_seconds: workingSec,
    });
  }, [getInheritedPlanActualRange, onAddMoment]);

  // Record a just-ended STEP timer session as a focus-session moment tagged to
  // the parent todo. This is what makes finished step work persist on the
  // timeline: the moment flows through the existing moments → buildPlanBlocks
  // pipeline and renders as a truthfully-positioned segment, grouped with the
  // parent (and its other step sessions) via `todo-session:<parentId>`.
  const logStepSessionMoment = useCallback(async (
    step: TodoStep,
    session: { startISO: string; endISO: string; seconds: number },
  ) => {
    if (!onAddMoment || session.seconds <= 0) return;
    const parentId = step.parent_due_id;
    const parent = todos.find(t => t.id === parentId)
      ?? (prevDayTodos || []).find(t => t.id === parentId);
    const startMs = new Date(session.startISO).getTime();
    const sessionDate = Number.isFinite(startMs)
      ? format(new Date(startMs), 'yyyy-MM-dd')
      : undefined;
    await onAddMoment({
      ...(sessionDate ? { date: sessionDate } : {}),
      text: step.title,
      emoji: extractLeadingEmoji(step.title) || extractLeadingEmoji(parent?.title || ''),
      photos: [],
      // `focus-session` + `todo-session:<parentId>` make it render and group
      // exactly like the parent's own focus sessions; `step-session` marks its
      // origin for any future step-specific handling. Parent tags carry color.
      tags: ['focus-session', 'step-session', `todo-session:${parentId}`, ...(parent?.tags || [])],
      timer_started_at: session.startISO,
      timer_ended_at: session.endISO,
      timer_seconds: session.seconds,
    });
  }, [onAddMoment, todos, prevDayTodos]);

  // Find a step (and confirm it's currently running) from the parent map.
  const findRunningStep = useCallback((stepId: string): TodoStep | null => {
    for (const steps of Object.values(stepsByParent)) {
      const s = steps.find(x => x.id === stepId);
      if (s) return s.timer_started_at ? s : null;
    }
    return null;
  }, [stepsByParent]);

  // Wrapped step handlers: capture the session window BEFORE the raw call folds
  // elapsed into timer_seconds and clears timer_started_at (which loses "when").
  const stopStepTimer = useCallback(async (stepId: string) => {
    const running = findRunningStep(stepId);
    const session = running ? computeStepSession(running, Date.now()) : null;
    await rawStopStepTimer(stepId);
    if (running && session) await logStepSessionMoment(running, session);
  }, [findRunningStep, rawStopStepTimer, logStepSessionMoment]);

  const toggleStep = useCallback(async (stepId: string, completed: boolean) => {
    // Completing a running step stops its timer too — capture that final session.
    const running = completed ? findRunningStep(stepId) : null;
    const session = running ? computeStepSession(running, Date.now()) : null;
    await rawToggleStep(stepId, completed);
    if (running && session) await logStepSessionMoment(running, session);
  }, [findRunningStep, rawToggleStep, logStepSessionMoment]);

  const getCaptureTypeLabel = useCallback((moment: Moment) => {
    const value = moment.tags?.find(tag => tag !== CAPTURE_NOTE_TAG && !tag.startsWith('mood:'));
    return value ? value.charAt(0).toUpperCase() + value.slice(1) : null;
  }, []);
  const getCaptureMoodLabel = useCallback((moment: Moment) => {
    const value = moment.tags?.find(tag => tag.startsWith('mood:'))?.replace('mood:', '');
    return value ? value.charAt(0).toUpperCase() + value.slice(1) : null;
  }, []);

  // Unscheduled tasks = tasks without a time set on the timeline
  const unscheduledTodos = useMemo(() => todos.filter(t => !t.plan_started_at && !t.is_completed), [todos]);
  const scheduledCount = useMemo(() => todos.filter(t => t.plan_started_at || t.is_completed).length, [todos]);
  const activeTimerIdSet = useMemo(() => new Set(activeTimerTodos.map(t => t.id)), [activeTimerTodos]);
  const getTimerElapsedForId = useCallback((id: string) => {
    const todo = todos.find(t => t.id === id) ?? (prevDayTodos || []).find(t => t.id === id);
    return todo ? getCurrentSessionElapsedRef.current(todo) : 0;
  }, [todos, prevDayTodos]);

  // ── Timeline inputs: reflect a running STEP as an "ongoing" block ────────
  // A task with a running step (but no own timer) should read as in-progress
  // on the timeline, not a dashed plan outline. We synthesize a timer from the
  // step's start so the existing actual/live/running machinery lights it up —
  // no changes needed in buildPlanBlocks or the primitives. These inputs are
  // used ONLY by the timeline; the task list and FloatingTimer keep using the
  // real timer fields, so no phantom floating timer appears for the parent.
  const timelineTodos = useMemo(() => {
    if (runningStepByParent.size === 0) return todos;
    return todos.map(t => {
      const startedAt = runningStepByParent.get(t.id);
      if (startedAt && !isActivelyRunningTodo(t)) {
        return { ...t, timer_started_at: startedAt, timer_ended_at: null };
      }
      return t;
    });
  }, [todos, runningStepByParent]);
  const timelineActiveTimerIds = useMemo(() => {
    if (runningStepByParent.size === 0) return activeTimerIdSet;
    const set = new Set(activeTimerIdSet);
    for (const pid of runningStepByParent.keys()) set.add(pid);
    return set;
  }, [activeTimerIdSet, runningStepByParent]);
  const getTimelineTimerElapsed = useCallback((id: string) => {
    const startedAt = runningStepByParent.get(id);
    const todo = todos.find(t => t.id === id);
    if (startedAt && todo && !isActivelyRunningTodo(todo)) {
      return Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
    }
    return getTimerElapsedForId(id);
  }, [runningStepByParent, todos, getTimerElapsedForId]);

  // Currently-running step timers, surfaced as LIVE step sub-segments on the
  // timeline. A step's durable `step-session` moment is only written when it
  // STOPS, so without this a running step is invisible on the timeline until
  // then — and if the parent already shows a block (its own timer or plan),
  // starting a step looks like nothing happened. We synthesize a transient
  // step-session moment per running step (end = now) so it renders as a live
  // sub-segment inside the parent and grows every tick. Once the step stops,
  // its timer_started_at clears (dropping it here) and the real logged moment
  // takes over — no double render.
  const liveStepSessionMoments = useMemo<Moment[]>(() => {
    void tick; // recompute each second so the live segment grows
    if (runningStepByParent.size === 0) return [];
    const nowISO = new Date().toISOString();
    const out: Moment[] = [];
    for (const [pid, steps] of Object.entries(stepsByParent)) {
      const parent = todos.find(t => t.id === pid);
      if (!parent || parent.is_completed) continue;
      for (const s of steps) {
        if (!s.timer_started_at) continue;
        out.push({
          id: `live-step-${s.id}`,
          date: todayStr,
          text: s.title,
          emoji: extractLeadingEmoji(s.title) || extractLeadingEmoji(parent.title || ''),
          photos: [],
          tags: ['focus-session', 'step-session', `todo-session:${pid}`, ...(parent.tags || [])],
          createdAt: s.timer_started_at,
          timer_started_at: s.timer_started_at,
          timer_ended_at: nowISO,
          timer_seconds: null,
        });
      }
    }
    return out;
  }, [stepsByParent, todos, todayStr, runningStepByParent.size, tick]);

  const timelineMoments = useMemo(
    () => (liveStepSessionMoments.length > 0 ? [...dateMoments, ...liveStepSessionMoments] : dateMoments),
    [dateMoments, liveStepSessionMoments],
  );

  const overlayTodo = showOverlayForId
    ? (todos.find(t => t.id === showOverlayForId) ?? (prevDayTodos || []).find(t => t.id === showOverlayForId))
    : null;
  const floatingTimers = activeTimerTodos.filter(t => t.id !== showOverlayForId)
    .map(t => ({ id: t.id, title: t.title, elapsed: getElapsed(t), isPaused: pausedTimers.has(t.id) }));
  const uploadCapturePhoto = useCallback(async (file: File): Promise<string | null> => {
    if (!user || file.size > 5 * 1024 * 1024) return null;
    const { uploadMomentPhotoObject } = await import('@/lib/momentPhotos');
    const ext = file.type.split('/')[1] || file.name.split('.').pop() || 'jpg';
    return uploadMomentPhotoObject(user.id, file, file.type || `image/${ext}`, ext);
  }, [user]);

  const handleCaptureFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    for (const file of Array.from(files)) {
      const url = await uploadCapturePhoto(file);
      if (url) setCapturePhotos(prev => [...prev, url]);
    }
    if (captureFileInputRef.current) captureFileInputRef.current.value = '';
  }, [uploadCapturePhoto]);

  const addCaptureLinkPreview = useCallback(async (rawUrl: string) => {
    const url = normalizeUrl(rawUrl);
    if (!url) return false;
    const siteFallback = (() => {
      try { return new URL(url).hostname.replace(/^www\./, ''); }
      catch { return url; }
    })();
    let shouldFetch = false;
    setCaptureLinks(prev => {
      if (prev.some(l => l.url === url)) return prev;
      shouldFetch = true;
      return [...prev, { url, siteName: siteFallback, title: siteFallback }];
    });
    if (!shouldFetch) return true;
    setIsResolvingCaptureLink(true);
    try {
      const { data, error } = await supabase.functions.invoke('link-preview', { body: { url } });
      if (error) return true;
      const preview: MomentLinkPreview = {
        url,
        title: typeof data?.title === 'string' ? data.title : siteFallback,
        description: typeof data?.description === 'string' ? data.description : undefined,
        image: typeof data?.image === 'string' ? data.image : undefined,
        siteName: typeof data?.siteName === 'string' ? data.siteName : siteFallback,
      };
      setCaptureLinks(prev => prev.map(l => l.url === url ? { ...l, ...preview } : l));
      return true;
    } catch {
      return true;
    } finally {
      setIsResolvingCaptureLink(false);
    }
  }, []);

  const handleSaveCapture = useCallback(async () => {
    const text = captureDraft.trim();
    if (!text || !onAddMoment || isSavingCapture) return;

    setIsSavingCapture(true);
    const detectedType = autoDetectCaptureType(text);
    try {
      await onAddMoment({
        text,
        photos: capturePhotos,
        links: captureLinks.length > 0 ? captureLinks : undefined,
        emoji: captureMood ? CAPTURE_MOOD_EMOJIS[captureMood] : undefined,
        location: captureLocation ?? undefined,
        tags: [
          CAPTURE_NOTE_TAG,
          ...(detectedType ? [detectedType] : []),
          ...(captureMood ? [`mood:${captureMood}`] : []),
        ],
      });
      setCaptureDraft('');
      setCaptureMood(null);
      setCapturePhotos([]);
      setCaptureLinks([]);
      setCaptureLocation(null);
      setCaptureLocationAutoFilled(false);
      setShowMoodDrawer(false);
      localStorage.removeItem(captureDraftStorageKey);
      setCaptureSheetOpen(false);
    } finally {
      setIsSavingCapture(false);
    }
  }, [captureDraft, captureMood, capturePhotos, captureLinks, captureLocation, captureDraftStorageKey, isSavingCapture, onAddMoment]);

  const resetPromptTodo = resetPromptTodoId ? todos.find(t => t.id === resetPromptTodoId) : null;

  return (
    <>
      {/* Reset/Resume prompt */}
      {resetPromptTodo && (
        <div className="fixed inset-0 z-[80] bg-background/90 backdrop-blur-sm flex items-center justify-center animate-fade-in" onClick={() => setResetPromptTodoId(null)}>
          <div className="w-[300px] bg-card border border-border rounded-2xl p-6 space-y-4 shadow-xl text-center" onClick={e => e.stopPropagation()}>
            <p className="text-sm font-medium text-foreground">{resetPromptTodo.title}</p>
            <p className="text-xs text-muted-foreground">
              {tLang('plan.timerStartedAt') || 'Timer started at'} {format(new Date(resetPromptTodo.timer_started_at!), 'HH:mm')}
            </p>
            <div className="flex flex-col gap-2 pt-2">
              <button
                onClick={() => handleResumeTimer(resetPromptTodoId!)}
                className="w-full py-2.5 rounded-xl bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20 transition-colors"
              >
                {tLang('plan.resumeTimer') || 'Resume (keep original start)'}
              </button>
              <button
                onClick={() => handleResetTimer(resetPromptTodoId!)}
                className="w-full py-2.5 rounded-xl bg-secondary text-foreground text-sm font-medium hover:bg-secondary/80 transition-colors"
              >
                {tLang('plan.resetTimer') || 'Reset Timer (start from now)'}
              </button>
            </div>
          </div>
        </div>
      )}

      {overlayTodo && (
        <FocusTimerOverlay
          key={overlayTodo.id}
          todo={withFreshTimerStart(overlayTodo)}
          pauseState={pauseStatesRef.current.get(overlayTodo.id)}
          onPauseStateChange={(pauseState) => handlePauseStateChange(overlayTodo.id, pauseState)}
          onMinimize={() => setShowOverlayForId(null)}
          accentColor={(() => {
            const inferredTag = overlayTodo.tags?.[0] || autoClassifyTag(overlayTodo.title);
            const tagColor = inferredTag ? TAG_CATEGORY_COLORS[inferredTag.toLowerCase()] : null;
            if (tagColor) return tagColor;
            const wt = getPlanWorkType({ entity: 'todo', id: overlayTodo.id, title: overlayTodo.title, tags: overlayTodo.tags });
            return WORK_TYPE_META[wt]?.color || undefined;
          })()}
          onComplete={async (workingSec, progress) => {
            const finalProgress = progress ?? 100;
            const isDueChild = Boolean(overlayTodo.parent_due_id);
            const endedAtISO = new Date().toISOString();
            const snap = withFreshTimerStart(overlayTodo);
            const previousSnapshot = createTodoDoneUndoSnapshot(snap);
            const inheritedPlanRange = getInheritedPlanActualRange(snap);
            // Detach into a correctly-dated moment when the work is partial OR
            // when the session ended on a day BEFORE today (forgotten / past
            // session being closed retroactively). The todo itself was rolled
            // forward to today, so keeping its timer_* on a past-day span would
            // paint a phantom block on today's timeline at those hours.
            const sessionEndsOnPastDay = format(new Date(endedAtISO), 'yyyy-MM-dd') !== todayStr;
            const shouldDetachSession = finalProgress < 100 || sessionEndsOnPastDay;
            setPendingStopIds(prev => new Set([...prev, snap.id]));
            clearPauseState(snap.id);
            clearFreshTimerStart(snap.id);
            setShowOverlayForId(null);
            try {
              if (shouldDetachSession) {
                await logFocusSessionMoment(snap, workingSec, endedAtISO);
              }
              await updateTodo(snap.id, {
                timer_started_at: shouldDetachSession ? null : (inheritedPlanRange?.startISO ?? snap.timer_started_at),
                timer_ended_at: shouldDetachSession ? null : endedAtISO,
                timer_seconds: (snap.timer_seconds || 0) + workingSec,
                is_completed: finalProgress >= 100,
                progress: finalProgress,
              });
              if (isDueChild) {
                await supabase
                  .from('todos')
                  .update({ progress: finalProgress, is_completed: finalProgress >= 100 })
                  .eq('id', snap.parent_due_id!);
              }
              if (finalProgress >= 100 && !shouldDetachSession) {
                showDoneUndo({
                  todo: snap,
                  previous: previousSnapshot,
                });
              }
            } catch {
              // best-effort save
            }
          }}
          onSaveAndContinue={async (workingSec, progress) => {
            const nextProgress = progress ?? overlayTodo.progress ?? 0;
            const isDueChild = Boolean(overlayTodo.parent_due_id);
            const endedAtISO = new Date().toISOString();
            const snap = withFreshTimerStart(overlayTodo);
            // Close and remove from active timers immediately
            setPendingStopIds(prev => new Set([...prev, snap.id]));
            clearPauseState(snap.id);
            clearFreshTimerStart(snap.id);
            setShowOverlayForId(null);
            try {
              await logFocusSessionMoment(snap, workingSec, endedAtISO);
              await updateTodo(snap.id, {
                timer_started_at: null,
                timer_ended_at: endedAtISO,
                timer_seconds: (snap.timer_seconds || 0) + workingSec,
                progress: nextProgress,
                is_completed: false,
              });
              if (isDueChild) {
                await supabase
                  .from('todos')
                  .update({ progress: nextProgress, is_completed: false })
                  .eq('id', snap.parent_due_id!);
              }
            } catch {
              // best-effort save
            }
          }}
          onFinishAt={async (workingSec, progress, completed, endedAtISO) => {
            const finalProgress = completed ? 100 : progress;
            const isDueChild = Boolean(overlayTodo.parent_due_id);
            const snap = withFreshTimerStart(overlayTodo);
            const previousSnapshot = createTodoDoneUndoSnapshot(snap);
            const inheritedPlanRange = getInheritedPlanActualRange(snap);
            // Detach when not completed OR when the chosen end-time lands on a
            // day BEFORE today (forgotten timer being closed retroactively).
            // The todo itself was rolled forward to today, so leaving its
            // timer_* fields on a past-day span would paint a phantom block at
            // those hours on today's timeline (instead of yesterday's).
            const sessionEndsOnPastDay = format(new Date(endedAtISO), 'yyyy-MM-dd') !== todayStr;
            const shouldDetachSession = !completed || sessionEndsOnPastDay;
            setPendingStopIds(prev => new Set([...prev, snap.id]));
            clearPauseState(snap.id);
            clearFreshTimerStart(snap.id);
            setShowOverlayForId(null);
            try {
              if (shouldDetachSession) {
                await logFocusSessionMoment(snap, workingSec, endedAtISO);
              }
              await updateTodo(snap.id, {
                timer_started_at: shouldDetachSession ? null : (inheritedPlanRange?.startISO ?? snap.timer_started_at),
                timer_ended_at: shouldDetachSession ? null : endedAtISO,
                timer_seconds: (snap.timer_seconds || 0) + workingSec,
                progress: finalProgress,
                is_completed: completed,
              });
              if (isDueChild) {
                await supabase
                  .from('todos')
                  .update({ progress: finalProgress, is_completed: completed })
                  .eq('id', snap.parent_due_id!);
              }
              if (completed && !shouldDetachSession) {
                showDoneUndo({
                  todo: snap,
                  previous: previousSnapshot,
                });
              }
            } catch {
              // best-effort save
            }
          }}
          onCancel={async () => {
            await updateTodo(overlayTodo.id, { timer_started_at: null, timer_ended_at: null });
            clearPauseState(overlayTodo.id);
            clearFreshTimerStart(overlayTodo.id);
            setShowOverlayForId(null);
          }}
          onUpdateStartTime={async (newStartedAt) => {
            await updateTodo(overlayTodo.id, { timer_started_at: newStartedAt });
          }}
          onUpdateEndTime={async (newEndedAt) => {
            await updateTodo(overlayTodo.id, { plan_ended_at: newEndedAt });
          }}
        />
      )}
      {!captureSheetOpen && !overlayOpen && activeTimerTodos.filter(t => t.id !== showOverlayForId).length > 0 && (
        <div
          ref={timerDockRef}
          className="fixed z-[70] flex cursor-grab touch-none select-none flex-col items-end gap-2 active:cursor-grabbing"
          style={{
            pointerEvents: 'auto',
            ...(timerDockPos ? { left: timerDockPos.x, top: timerDockPos.y } : { right: recapDock ? recapDock.right : 8, bottom: recapDock ? recapDock.bottom + 48 : 16 }),
          }}
          onPointerDownCapture={handleTimerDockPointerDown}
          onPointerMove={handleTimerDockPointerMove}
          onPointerUp={handleTimerDockPointerUp}
          onPointerCancel={handleTimerDockPointerCancel}
          onClickCapture={(e) => {
            if (!suppressTimerClickRef.current) return;
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          {activeTimerTodos.filter(t => t.id !== showOverlayForId).map(t => (
            <FloatingTimer
              key={t.id}
              todo={withFreshTimerStart(t)}
              isPaused={pausedTimers.has(t.id)}
              pauseState={pauseStatesRef.current.get(t.id)}
              onClick={() => setShowOverlayForId(t.id)}
              accentColor={getActivityAccentColor({ title: t.title, tags: t.tags, isDarkMode: planViewIsDark })}
            />
          ))}
        </div>
      )}

      {/* Main split layout */}
      <div className="flex gap-0" style={{ minHeight: 'calc(100vh - 180px)' }}>
        {/* Center: Task List (50%) */}
        <div
          ref={taskColumnRef}
          className="flex-1 border-r border-border/20 pr-0.5 flex flex-col min-h-0"
          style={{ maxHeight: 'calc(100vh - 180px)' }}
        >
          <div className="flex-1 overflow-y-auto min-h-0">
          <div className="px-2 space-y-1 pb-28">
              {/* Empty state — when no active tasks, invite the first action rather
                  than leaving the column a black void next to a busy timeline. */}
              {mainListTodos.filter(t => !t.is_completed).length === 0 && (
                <div className="flex flex-col items-center justify-center gap-3.5 px-6 py-20 text-center animate-fade-in">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/[0.08] text-primary/80">
                    <NotebookPen size={22} strokeWidth={1.8} />
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-[14px] font-medium text-foreground/85">
                      {lang === 'zh' ? '今天还是一张白纸' : "Today's a blank page"}
                    </p>
                    <p className="mx-auto max-w-[230px] text-[12.5px] leading-relaxed text-muted-foreground/70">
                      {lang === 'zh' ? '在下面加个任务，或从时间轴拖一件事进来。' : 'Add a task below, or drag one onto the timeline.'}
                    </p>
                  </div>
                </div>
              )}
              {/* Flat list mode */}
              {listMode === 'flat' ? (
                <div className="space-y-0.5">
                  {[...mainListTodos].filter(t => !t.is_completed).sort((a, b) => {
                    const aDoing = isActivelyRunningTodo(a) ? 1 : 0;
                    const bDoing = isActivelyRunningTodo(b) ? 1 : 0;
                    if (aDoing !== bDoing) return bDoing - aDoing;
                    const aPlanned = a.plan_started_at ? 1 : 0;
                    const bPlanned = b.plan_started_at ? 1 : 0;
                    if (aPlanned !== bPlanned) return aPlanned - bPlanned;
                    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
                  }).map((todo) => (
                    <TodoItem
                      key={todo.id}
                      todo={todo}
                      onToggle={() => toggleComplete(todo.id)}
                      onToggleRecurring={(next) => toggleRecurring(todo.id, next)}
                      onDelete={() => deleteTodoWithUndo(todo.id)}
                      onUpdateTitle={(title) => updateTodo(todo.id, { title })}
                      onUpdateTime={(startTime, endTime) => {
                        const span = buildTimerSpanISO(startTime, endTime, { anchorISO: todo.timer_started_at, fallbackDateStr: todayStr });
                        if (!span) return;
                        updateTodo(todo.id, { timer_started_at: span.startISO, timer_ended_at: span.endISO, timer_seconds: span.seconds });
                      }}
                      onFocus={() => handleStartFocus(todo)}
                      isTiming={activeTimerTodos.some(t => t.id === todo.id)}
                      timerElapsed={activeTimerTodos.some(t => t.id === todo.id) ? getElapsed(todo) : 0}
                      isPaused={pausedTimers.has(todo.id)}
                      onDragStart={(e) => {
                        setDragTodoId(todo.id);
                        e.dataTransfer.setData('text/plain', todo.id);
                        e.dataTransfer.setData('text/date', todo.date);
                        e.dataTransfer.effectAllowed = 'move';
                        window.dispatchEvent(new CustomEvent('plan-task-drag-start', {
                          detail: { taskId: todo.id, taskDate: todo.date }
                        }));
                      }}
                      onDragEnd={() => {
                        setDragTodoId(null);
                        window.dispatchEvent(new Event('plan-task-drag-end'));
                      }}
                      onToggleWithProgress={() => handleToggleWithProgress(todo)}
                      onUpdateProgress={(progress) => {
                        updateTodo(todo.id, { progress, is_completed: progress >= 100 });
                        if (todo.parent_due_id) {
                          supabase.from('todos').update({ progress, is_completed: progress >= 100 }).eq('id', todo.parent_due_id);
                        }
                      }}
                      steps={stepsByParent[todo.id] || []}
                      onAddStep={(title) => rawAddStep(todo.id, title)}
                      onToggleStep={toggleStep}
                      onDeleteStep={rawDeleteStep}
                      onStartStepTimer={rawStartStepTimer}
                      onStopStepTimer={stopStepTimer}
                      onUpdateStepPlanTime={(stepId, startTime, endTime) => {
                        if (!startTime && !endTime) { rawUpdateStepPlanTime(stepId, null, null); return; }
                        const span = buildTimerSpanISO(startTime, endTime, { fallbackDateStr: todayStr });
                        if (!span) return;
                        rawUpdateStepPlanTime(stepId, span.startISO, span.endISO);
                      }}
                      onUpdateStepTitle={rawUpdateStepTitle}
                      carriedFromDate={todo.date !== todayStr ? todo.date : undefined}
                    />
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                {grouped.map((seg, segIdx) => (
                  <div key={seg.id} onDragOver={handleDragOver} onDrop={handleDrop(seg.id)}
                    className={cn(segIdx > 0 && "pt-2 border-t border-border/20")}>
                    {/* Section header — matches reference style */}
                    <div className="flex items-center justify-between px-0.5 py-1.5">
                      <button
                        onClick={() => toggleSegment(seg.id)}
                        className="flex items-center gap-2 min-w-0"
                      >
                        <seg.Icon size={14} strokeWidth={1.9} className="opacity-80 text-muted-foreground/80" />
                        <span className="text-[13px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">{seg.label}</span>
                        <span className="text-[12px] tabular-nums text-muted-foreground/55 font-normal">{seg.todos.length}</span>
                        {collapsedSegments.has(seg.id)
                          ? <ChevronRight size={14} className="text-muted-foreground/55" />
                          : <ChevronDown size={14} className="text-muted-foreground/55" />}
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setCollapsedSegments(prev => {
                            const next = new Set(prev);
                            next.delete(seg.id);
                            return next;
                          });
                          setAddingSegment(addingSegment === seg.id ? null : seg.id);
                          setSegmentNewTitle('');
                        }}
                        title={lang === 'zh' ? `添加到${seg.label}` : `Add to ${seg.label}`}
                        className="p-1 text-muted-foreground/40 hover:text-foreground transition-colors rounded-md hover:bg-[hsl(var(--surface-soft-hover))]"
                      >
                        <Plus size={15} />
                      </button>
                    </div>

                    {!collapsedSegments.has(seg.id) && (
                      <div>
                        {addingSegment === seg.id && (
                          <div className="flex gap-1 py-1 px-0.5">
                            <input autoFocus value={segmentNewTitle} onChange={e => setSegmentNewTitle(e.target.value)}
                              placeholder={`Add to ${seg.label}...`}
                              onKeyDown={async e => {
                                if (isEnterSubmit(e) && segmentNewTitle.trim()) { await addTodo(segmentNewTitle.trim(), seg.id as Todo['time_segment']); setSegmentNewTitle(''); setAddingSegment(null); }
                                if (e.key === 'Escape') setAddingSegment(null);
                              }}
                              className="flex-1 h-7 text-[12px] rounded-lg bg-card border border-border px-2 focus:outline-none focus:ring-1 focus:ring-primary text-foreground" />
                          </div>
                        )}
                        <div className="space-y-0.5">
                        {seg.todos.map((todo, todoIdx) => (
                          <div key={todo.id}
                            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                            onDrop={(e) => { e.preventDefault(); e.stopPropagation(); handleDrop(seg.id, todoIdx)(e); }}>
                            <TodoItem
                              todo={todo}
                              onToggle={() => toggleComplete(todo.id)}
                              onToggleRecurring={(next) => toggleRecurring(todo.id, next)}
                              onDelete={() => deleteTodoWithUndo(todo.id)}
                              onUpdateTitle={(title) => updateTodo(todo.id, { title })}
                              onUpdateTime={(startTime, endTime) => {
                                const span = buildTimerSpanISO(startTime, endTime, { anchorISO: todo.timer_started_at, fallbackDateStr: todayStr });
                                if (!span) return;
                                updateTodo(todo.id, { timer_started_at: span.startISO, timer_ended_at: span.endISO, timer_seconds: span.seconds });
                              }}
                              onFocus={() => handleStartFocus(todo)}
                              isTiming={activeTimerTodos.some(t => t.id === todo.id)}
                              timerElapsed={activeTimerTodos.some(t => t.id === todo.id) ? getElapsed(todo) : 0}
                              isPaused={pausedTimers.has(todo.id)}
                              onDragStart={(e) => {
                                  setDragTodoId(todo.id);
                                  e.dataTransfer.setData('text/plain', todo.id);
                                  e.dataTransfer.setData('text/date', todo.date);
                                  e.dataTransfer.effectAllowed = 'move';
                                  window.dispatchEvent(new CustomEvent('plan-task-drag-start', {
                                    detail: { taskId: todo.id, taskDate: todo.date }
                                  }));
                              }}
                              onDragEnd={() => {
                                setDragTodoId(null);
                                window.dispatchEvent(new Event('plan-task-drag-end'));
                              }}
                              onToggleWithProgress={() => handleToggleWithProgress(todo)}
                              onReopen={() => { void reopenTodoFromDone(todo); }}
                              onUpdateProgress={(progress) => {
                                updateTodo(todo.id, { progress, is_completed: progress >= 100 });
                                if (todo.parent_due_id) {
                                  supabase.from('todos').update({ progress, is_completed: progress >= 100 }).eq('id', todo.parent_due_id);
                                }
                              }}
                              steps={stepsByParent[todo.id] || []}
                              onAddStep={(title) => rawAddStep(todo.id, title)}
                              onToggleStep={toggleStep}
                              onDeleteStep={rawDeleteStep}
                              onStartStepTimer={rawStartStepTimer}
                              onStopStepTimer={stopStepTimer}
                              onUpdateStepPlanTime={(stepId, startTime, endTime) => {
                                if (!startTime && !endTime) { rawUpdateStepPlanTime(stepId, null, null); return; }
                                const span = buildTimerSpanISO(startTime, endTime, { fallbackDateStr: todayStr });
                                if (!span) return;
                                rawUpdateStepPlanTime(stepId, span.startISO, span.endISO);
                              }}
                              onUpdateStepTitle={rawUpdateStepTitle}
                              carriedFromDate={todo.date !== todayStr ? todo.date : undefined}
                            />
                          </div>
                        ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                </div>
              )}

              {/* Archive: completed todos */}
              {archivedTodos.length > 0 && (
                <div className="mt-2 pt-2 border-t border-border/20">
                  <div className="flex items-center px-0.5 py-1.5">
                    <button onClick={() => setArchiveCollapsed(v => !v)} className="flex items-center gap-1.5 flex-1 min-w-0">
                      <Check size={11} className="text-muted-foreground/40 shrink-0" />
                      <span className="text-[11px] font-semibold text-muted-foreground/50 uppercase tracking-[0.12em]">{tLang('plan.done') || 'Done'}</span>
                      <span className="text-[11px] text-muted-foreground/35">{archivedTodos.length}</span>
                      {archiveCollapsed ? <ChevronRight size={11} className="text-muted-foreground/30" /> : <ChevronDown size={11} className="text-muted-foreground/30" />}
                    </button>
                  </div>
                  {!archiveCollapsed && (
                    <div>
                      <div className="space-y-0.5">
                        {archivedTodos.map(todo => (
                          <TodoItem
                            key={todo.id}
                            todo={todo}
                            onToggle={() => toggleComplete(todo.id)}
                            onToggleRecurring={(next) => toggleRecurring(todo.id, next)}
                            onDelete={() => deleteTodoWithUndo(todo.id)}
                            onUpdateTitle={(title) => updateTodo(todo.id, { title })}
                            onUpdateTime={(startTime, endTime) => {
                              const span = buildTimerSpanISO(startTime, endTime, { anchorISO: todo.timer_started_at, fallbackDateStr: todayStr });
                              if (!span) return;
                              updateTodo(todo.id, { timer_started_at: span.startISO, timer_ended_at: span.endISO, timer_seconds: span.seconds });
                            }}
                            onFocus={() => handleContinueTimingFromDone(todo)}
                            isTiming={activeTimerTodos.some(t => t.id === todo.id)}
                            timerElapsed={activeTimerTodos.some(t => t.id === todo.id) ? getElapsed(todo) : 0}
                            isPaused={pausedTimers.has(todo.id)}
                            onDragStart={(e) => {
                              setDragTodoId(todo.id);
                              e.dataTransfer.setData('text/plain', todo.id);
                              e.dataTransfer.setData('text/date', todo.date);
                              e.dataTransfer.effectAllowed = 'move';
                              window.dispatchEvent(new CustomEvent('plan-task-drag-start', { detail: { taskId: todo.id, taskDate: todo.date } }));
                            }}
                            onDragEnd={() => { setDragTodoId(null); window.dispatchEvent(new Event('plan-task-drag-end')); }}
                            onToggleWithProgress={() => handleToggleWithProgress(todo)}
                            onReopen={() => { void reopenTodoFromDone(todo); }}
                            onUpdateProgress={(progress) => {
                              updateTodo(todo.id, { progress, is_completed: progress >= 100 });
                              if (todo.parent_due_id) {
                                supabase.from('todos').update({ progress, is_completed: progress >= 100 }).eq('id', todo.parent_due_id);
                              }
                            }}
                            steps={stepsByParent[todo.id] || []}
                            onAddStep={(title) => rawAddStep(todo.id, title)}
                            onToggleStep={toggleStep}
                            onDeleteStep={rawDeleteStep}
                            onStartStepTimer={rawStartStepTimer}
                            onStopStepTimer={stopStepTimer}
                            onUpdateStepPlanTime={(stepId, startTime, endTime) => {
                              if (!startTime && !endTime) { rawUpdateStepPlanTime(stepId, null, null); return; }
                              const span = buildTimerSpanISO(startTime, endTime, { fallbackDateStr: todayStr });
                              if (!span) return;
                              rawUpdateStepPlanTime(stepId, span.startISO, span.endISO);
                            }}
                            onUpdateStepTitle={rawUpdateStepTitle}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Day footer — a calm two-tier block:
                    1) PlanDrift compact line carries the day's status (the metric)
                    2) a single quieter row underneath with view-toggle + recap CTA
                  No border-t separators, no shadowed pills — visual hierarchy
                  comes from typography & opacity alone. */}
              <div className="mt-4 space-y-1">
                <PlanDrift
                  allTodos={todos}
                  completedTodos={todos.filter(t => t.is_completed)}
                  allMoments={dateMoments}
                  todayDateStr={todayStr}
                  defaultCollapsed
                  rhythmPresetId={timelineRhythmPresetId}
                  rhythmPalette={timelineRhythmPalette}
                />

                <div className="flex items-center justify-end gap-2 px-3">
                  <div
                    role="toolbar"
                    aria-label={lang === 'zh' ? '列表布局' : 'List layout'}
                    className="inline-flex items-center gap-px rounded-full border border-border/30 bg-muted/20 p-[3px]"
                  >
                    <button
                      type="button"
                      onClick={() => setListMode('flat')}
                      title={tLang('plan.flat') || 'Flat list'}
                      className={cn(
                        'rounded-full p-[5px] transition-colors text-muted-foreground/55 hover:text-foreground/75',
                        listMode === 'flat' && 'bg-background text-foreground shadow-[0_0_0_1px_hsl(var(--border)/0.22)]',
                      )}
                    >
                      <List size={14} strokeWidth={2} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setListMode('grouped')}
                      title={tLang('plan.grouped') || 'Grouped by segment'}
                      className={cn(
                        'rounded-full p-[5px] transition-colors text-muted-foreground/55 hover:text-foreground/75',
                        listMode === 'grouped' && 'bg-background text-foreground shadow-[0_0_0_1px_hsl(var(--border)/0.22)]',
                      )}
                    >
                      <LayoutGrid size={14} strokeWidth={2} />
                    </button>
                  </div>

                  {onSwitchToRecap && (
                    <button
                      onClick={onSwitchToRecap}
                      className="group inline-flex items-center gap-0.5 rounded-full border border-[#dccfc1]/40 bg-[#fbf8f4]/55 px-3 py-1 text-[12px] font-medium tracking-[-0.01em] text-[#8a7465]/82 transition-all hover:border-[#c9b9a8]/75 hover:bg-[#f6efe8]/85 hover:text-[#725d50] dark:border-foreground/[0.11] dark:bg-foreground/[0.04] dark:text-foreground/65 dark:hover:border-foreground/18 dark:hover:bg-foreground/[0.07] dark:hover:text-foreground/85"
                    >
                      {lang === 'zh' ? '复盘' : 'Recap'}
                      <span className="text-[#8a7465]/50 transition-transform group-hover:translate-x-0.5 dark:text-foreground/40">→</span>
                    </button>
                  )}
                </div>
              </div>

          </div>
          </div>
          {/* Fixed task input rendered separately so it stays at the current viewport bottom */}
          {!showOverlayForId && !voiceSheetOpen && taskInputDock && (
            <div
              className="fixed z-20 pointer-events-none"
              style={{ left: taskInputDock.left, width: taskInputDock.width, bottom: 16 }}
            >
              <div className="pointer-events-auto">
              <div className="relative bg-[hsl(var(--toolbar-background))] border border-border rounded-2xl shadow-[0_2px_10px_hsl(var(--foreground)/0.08)] overflow-visible">
                {taskSuggestions.length > 0 && (
                  <div className="absolute bottom-full left-0 mb-1.5 w-full max-w-[320px] bg-card border border-border rounded-xl shadow-xl p-1 z-[70] animate-scale-in">
                    <p className="px-2 pt-1 pb-0.5 text-[10px] uppercase tracking-wider text-muted-foreground/55">
                      {lang === 'zh' ? '之前写过' : 'You wrote before'}
                    </p>
                    {taskSuggestions.map(s => (
                      <button
                        key={s.title}
                        onClick={() => acceptSuggestion(s.title)}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[13px] text-foreground text-left hover:bg-secondary transition-colors"
                      >
                        <CornerDownLeft size={13} className="flex-shrink-0 text-muted-foreground/50" />
                        <span className="truncate">{s.title}</span>
                        {s.count > 1 && (
                          <span className="ml-auto flex-shrink-0 text-[10px] text-muted-foreground/50">×{s.count}</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-1.5 px-2.5 py-1.5">
                  {/* ➕ menu button */}
                  <div className="relative">
                    <button onClick={(e) => { e.stopPropagation(); setPlusMenuOpen(prev => !prev); }}
                      className={cn("w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-colors",
                        plusMenuOpen ? "bg-[hsl(var(--surface-inset))] text-foreground" : "bg-transparent hover:bg-[hsl(var(--surface-soft-hover))] text-muted-foreground hover:text-foreground"
                      )}>
                      <Plus size={16} />
                    </button>
                    {plusMenuOpen && (
                      <div className="absolute bottom-12 left-0 bg-card border border-border rounded-2xl shadow-xl p-2.5 min-w-[264px] z-[70] animate-scale-in font-normal" onClick={e => e.stopPropagation()}>
                        <p className="px-1 pb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
                          {tLang('plan.timeSlot') || 'Time slot'}
                        </p>
                        <div className="grid grid-cols-2 gap-1.5">
                          {TIME_SEGMENTS.map(seg => {
                            const isSelected = effectiveQuickSegment === seg.id;
                            return (
                              <button
                                key={seg.id}
                                onClick={() => setQuickSegmentOverride(seg.id)}
                                aria-pressed={isSelected}
                                className={cn(
                                  "flex items-center gap-2 rounded-xl border px-2.5 py-2 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-1 focus-visible:ring-offset-card",
                                  isSelected
                                    ? "border-primary/40 bg-primary/10 text-primary font-medium"
                                    : "border-border/60 bg-transparent text-foreground hover:bg-secondary"
                                )}
                              >
                                <seg.Icon size={15} strokeWidth={1.9} className="flex-shrink-0" />
                                <span className="truncate">{tLang(`plan.seg.${seg.id}`) || seg.label}</span>
                              </button>
                            );
                          })}
                        </div>
                        <div className="border-t border-border/40 my-2.5" />
                        <button onClick={() => setReminderConfig(prev => ({ ...prev, enabled: !prev.enabled }))}
                          className={cn("w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-1 focus-visible:ring-offset-card",
                            reminderConfig.enabled ? "bg-primary/10 text-primary font-medium" : "hover:bg-secondary text-foreground"
                          )}>
                          <Bell size={15} className={reminderConfig.enabled ? "text-primary" : "text-muted-foreground"} />
                          <span>{tLang('plan.setReminder') || 'Set Reminder'}</span>
                          {reminderConfig.enabled && <Check size={14} className="ml-auto flex-shrink-0" />}
                        </button>
                        {reminderConfig.enabled && (
                          <div className="px-2.5 pt-1.5 pb-1 space-y-1.5">
                            <div className="flex gap-1.5">
                              <button onClick={() => setReminderConfig(prev => ({ ...prev, type: 'browser' }))} className={cn("flex-1 px-2.5 py-1.5 rounded-lg text-[12px] transition-colors", reminderConfig.type === 'browser' ? "bg-primary/10 text-primary font-medium" : "bg-secondary text-foreground hover:bg-secondary/80")}>Web</button>
                              <button onClick={() => setReminderConfig(prev => ({ ...prev, type: 'email' }))} className={cn("flex-1 px-2.5 py-1.5 rounded-lg text-[12px] transition-colors", reminderConfig.type === 'email' ? "bg-primary/10 text-primary font-medium" : "bg-secondary text-foreground hover:bg-secondary/80")}>Email</button>
                            </div>
                            <div className="flex gap-1.5">
                              {[1, 3, 7, 30].map(d => (
                                <button key={d} onClick={() => setReminderConfig(prev => ({ ...prev, intervalDays: d }))} className={cn("flex-1 px-2 py-1.5 rounded-lg text-[12px] transition-colors", reminderConfig.intervalDays === d ? "bg-primary/10 text-primary font-medium" : "bg-secondary text-foreground hover:bg-secondary/80")}>{d}d</button>
                              ))}
                            </div>
                          </div>
                        )}
                        <button onClick={() => { setRecurringUntilDone(prev => !prev); }}
                          className={cn("w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-1 focus-visible:ring-offset-card",
                            recurringUntilDone ? "bg-primary/10 text-primary font-medium" : "hover:bg-secondary text-foreground"
                          )}>
                          <Repeat size={15} className={recurringUntilDone ? "text-primary" : "text-muted-foreground"} />
                          <span>{tLang('plan.repeatDaily') || 'Repeat daily'}</span>
                          {recurringUntilDone && <Check size={14} className="ml-auto flex-shrink-0" />}
                        </button>
                      </div>
                    )}
                  </div>
                  <textarea value={newTitle} onChange={e => { setNewTitle(e.target.value); setSuggestionsDismissed(false); }}
                    ref={taskInputRef}
                    onKeyDown={e => {
                      if (e.key === 'Tab' && taskSuggestions.length > 0 && !e.shiftKey) { e.preventDefault(); acceptSuggestion(taskSuggestions[0].title); return; }
                      if (e.key === 'Escape' && taskSuggestions.length > 0) { e.preventDefault(); setSuggestionsDismissed(true); return; }
                      if (!isAddingQuick && isEnterSubmit(e)) { e.preventDefault(); handleAdd(); }
                    }}
                    placeholder={tLang('plan.addTask') || 'Add a task...'} rows={1}
                    className="flex-1 bg-transparent resize-none focus:outline-none text-foreground placeholder:text-muted-foreground/60 text-[13px] leading-5"
                    style={{ minHeight: '24px', maxHeight: '72px' }} />
                  {onOpenVoiceSheet && (
                    <button onClick={onOpenVoiceSheet}
                      className="w-8 h-8 rounded-full transition-colors flex-shrink-0 hover:bg-[hsl(var(--surface-soft-hover))] text-muted-foreground hover:text-foreground flex items-center justify-center"
                      title={lang === 'zh' ? '语音输入' : 'Voice input'}
                      aria-label={lang === 'zh' ? '语音输入' : 'Voice input'}><Mic size={15} /></button>
                  )}
                  <Button onClick={() => handleAdd(true)} size="icon" variant="outline" className="h-8 w-8 rounded-full flex-shrink-0 border-border text-muted-foreground hover:text-foreground hover:bg-[hsl(var(--surface-soft-hover))]" title={tLang('plan.addAndStart') || (lang === 'zh' ? '添加并开始计时' : 'Add & start timer')} aria-label={tLang('plan.addAndStart') || (lang === 'zh' ? '添加并开始计时' : 'Add & start timer')} disabled={isAddingQuick || !newTitle.trim()}><Timer size={15} /></Button>
                  <Button onClick={() => handleAdd()} size="icon" className="h-8 w-8 rounded-full flex-shrink-0 bg-primary/12 text-primary hover:bg-primary/18" disabled={isAddingQuick || !newTitle.trim()} title={lang === 'zh' ? '添加任务' : 'Add task'} aria-label={lang === 'zh' ? '添加任务' : 'Add task'}><ArrowUp size={15} /></Button>
                </div>
              </div>
              </div>
            </div>
          )}
        </div>

        {/* Right: Timeline (takes remaining space, ~50%) */}
          <div className="flex-1 flex flex-col min-w-0 pl-0">
          <div
            ref={timelineFrameRef}
            className="relative flex-1 min-h-0 rounded-3xl border border-[rgba(55,55,62,0.07)] bg-[#f9fafc] px-2.5 py-4 dark:border-border/35 dark:bg-transparent"
          >
            <PlanTimelineView
              todos={timelineTodos}
              moments={timelineMoments}
              importedEvents={dateImportedEvents}
              prevDayTodos={prevDayTodos}
              prevDayMoments={prevDayMoments}
              date={todayStr}
              rhythmPresetId={timelineRhythmPresetId}
              onUpdateTodo={updateTodo}
              onAddTodo={(title, seg) => addTodo(title, seg as Todo['time_segment'])}
              onDropTodo={handleDropOnTimeline}
              onUnscheduleTodo={(id) => updateTodo(id, { plan_started_at: null, plan_ended_at: null })}
              onDeleteTodo={deleteTodoWithUndo}
              onRenameTodo={(id, title) => updateTodo(id, { title })}
              onStartTimer={(id) => {
                const todo = todos.find(t => t.id === id);
                if (todo) handleStartFocus(todo);
              }}
              onUpdateMoment={onEditMoment}
              onDeleteMoment={onDeleteMoment}
              activeTimerIds={timelineActiveTimerIds}
              getTimerElapsed={getTimelineTimerElapsed}
            />
          </div>
        </div>
      </div>

      {!showOverlayForId && !voiceSheetOpen && !captureSheetOpen && !overlayOpen && recapDock && (
        <button
          onClick={() => setCaptureSheetOpen(true)}
          className="fixed z-[55] inline-flex items-center gap-1.5 rounded-full border border-[#dccfc1]/60 bg-[#fbf8f4]/82 px-3 py-1.5 text-[11.5px] font-medium tracking-[-0.005em] text-[#8a7465]/90 shadow-[0_4px_14px_rgba(94,79,65,0.06)] backdrop-blur-md transition-all hover:border-[#c9b9a8]/85 hover:bg-[#f6efe8]/92 hover:text-[#725d50] dark:border-foreground/[0.14] dark:bg-foreground/[0.06] dark:text-foreground/72 dark:shadow-[0_4px_14px_rgba(0,0,0,0.32)] dark:hover:border-foreground/22 dark:hover:bg-foreground/[0.10] dark:hover:text-foreground/90"
          style={{ right: recapDock.right, bottom: recapDock.bottom }}
          title={lang === 'zh' ? '添加到 Recap' : 'Add to recap'}
        >
          <NotebookPen size={13} strokeWidth={1.85} className="opacity-80" />
          <span>{lang === 'zh' ? 'Recap' : 'Recap'}</span>
        </button>
      )}

      <input ref={captureFileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleCaptureFileChange} />
      <Sheet open={captureSheetOpen} onOpenChange={setCaptureSheetOpen}>
        <SheetContent
          side="right"
          className="w-full border-border/70 bg-background/95 p-0 sm:max-w-md"
        >
          <SheetHeader className="border-b border-border/60 px-5 py-4">
            <SheetTitle className="text-[15px] font-semibold">
              {lang === 'zh' ? '记录此刻' : 'Log a moment'}
            </SheetTitle>
          </SheetHeader>

          <div className="flex flex-col gap-4 px-5 py-5">
            {/* Hero composer — textarea is the focal point. Photos / links
                ride above it as a dismissible preview row, mood + send live
                in the toolbar below. No more 5-chip header crowding. */}
            <div className="flex flex-col rounded-[20px] border border-border/60 bg-[hsl(var(--surface-soft))] shadow-[inset_0_1px_0_hsl(var(--surface-contrast)/0.35)] transition-shadow focus-within:border-primary/40 focus-within:shadow-[0_0_0_3px_hsl(var(--primary)/0.08)]">
              {/* Context strip: photos + links, only when present */}
              {(capturePhotos.length > 0 || captureLinks.length > 0 || isResolvingCaptureLink) && (
                <div className="space-y-2 border-b border-border/40 px-3.5 pb-3 pt-3.5">
                  {capturePhotos.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {capturePhotos.map((url, i) => (
                        <div
                          key={i}
                          className="group/photo relative h-[72px] w-[72px] flex-shrink-0 overflow-hidden rounded-xl ring-1 ring-border/45 animate-in fade-in slide-in-from-bottom-1 duration-200"
                        >
                          <img src={url} alt="" className="h-full w-full object-cover" />
                          <button
                            type="button"
                            onClick={() => setCapturePhotos(prev => prev.filter((_, idx) => idx !== i))}
                            aria-label={lang === 'zh' ? '移除照片' : 'Remove photo'}
                            className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/65 text-white opacity-0 transition-opacity hover:bg-black/85 group-hover/photo:opacity-100 focus:opacity-100"
                          >
                            <X size={11} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {captureLinks.map((link, index) => (
                    <LinkPreviewCard
                      key={`${link.url}-${index}`}
                      preview={link}
                      compact
                      onRemove={() => setCaptureLinks(prev => prev.filter((_, i) => i !== index))}
                    />
                  ))}
                  {isResolvingCaptureLink && (
                    <div className="flex items-center gap-2 rounded-xl bg-[hsl(var(--surface-contrast))]/70 px-3 py-2 text-[12px] text-muted-foreground">
                      <Loader2 size={13} className="animate-spin" />
                      <span>{lang === 'zh' ? '正在解析链接…' : 'Loading link preview…'}</span>
                    </div>
                  )}
                </div>
              )}

              {/* The hero: bigger min-height, larger text, calmer placeholder */}
              <Textarea
                value={captureDraft}
                onChange={(e) => setCaptureDraft(e.target.value)}
                onKeyDown={(e) => {
                  // Enter submits, Shift+Enter inserts a newline, and IME
                  // composition (Chinese/Japanese pinyin candidate selection)
                  // never triggers submit — the Enter there is "pick this
                  // candidate", not "send".
                  if (e.key !== 'Enter' || e.shiftKey) return;
                  const native = e.nativeEvent as KeyboardEvent;
                  if (isImeComposing(native)) return;
                  e.preventDefault();
                  void handleSaveCapture();
                }}
                onPaste={(e) => {
                  const imageItem = Array.from(e.clipboardData.items).find(item => item.type.startsWith('image/'));
                  if (imageItem) {
                    e.preventDefault();
                    const file = imageItem.getAsFile();
                    if (!file) return;
                    const localUrl = URL.createObjectURL(file);
                    setCapturePhotos(prev => [...prev, localUrl]);
                    void uploadCapturePhoto(file).then(url => {
                      if (url) {
                        setCapturePhotos(prev => prev.map(p => p === localUrl ? url : p));
                        URL.revokeObjectURL(localUrl);
                      } else {
                        setCapturePhotos(prev => prev.filter(p => p !== localUrl));
                      }
                    });
                    return;
                  }
                  const pastedText = e.clipboardData.getData('text/plain');
                  const pastedUrl = extractFirstUrl(pastedText);
                  if (pastedUrl && isStandaloneUrl(pastedUrl)) {
                    e.preventDefault();
                    void addCaptureLinkPreview(pastedUrl);
                  }
                }}
                placeholder={lang === 'zh' ? '今天怎么样?有什么想记下的…' : "What's on your mind right now?"}
                className="min-h-[168px] resize-none border-0 bg-transparent px-4 py-3.5 text-[15px] leading-[1.6] placeholder:text-muted-foreground/45 focus-visible:ring-0"
              />

              {/* Bottom toolbar: attach actions (left) + send (right).
                  All touch targets are 36px to clear mobile minima with
                  comfortable spacing. */}
              <div className="flex items-center gap-1.5 border-t border-border/40 px-2.5 py-2.5">
                <button
                  type="button"
                  onClick={() => captureFileInputRef.current?.click()}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-[hsl(var(--surface-soft-hover))] hover:text-foreground"
                  title={lang === 'zh' ? '添加照片' : 'Add photo'}
                  aria-label={lang === 'zh' ? '添加照片' : 'Add photo'}
                >
                  <Camera size={16} />
                </button>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowCaptureLocationPopover(v => !v)}
                    aria-label={lang === 'zh' ? '选择地点' : 'Choose location'}
                    className={cn(
                      "inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-[12px] font-medium transition-colors",
                      captureLocation && !captureLocationAutoFilled
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : captureLocation && captureLocationAutoFilled
                          ? "border-dashed border-primary/40 bg-primary/5 text-primary/85"
                          : "border-border/55 bg-transparent text-muted-foreground hover:border-border hover:text-foreground"
                    )}
                  >
                    <MapPin size={13} />
                    <span className="max-w-[140px] truncate">
                      {captureLocation ? captureLocation.name : (lang === 'zh' ? '地点' : 'Location')}
                    </span>
                    {captureLocation && captureLocationAutoFilled && (
                      <span className="rounded-full bg-primary/15 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wider text-primary/80">
                        {lang === 'zh' ? '自动' : 'auto'}
                      </span>
                    )}
                  </button>
                  {showCaptureLocationPopover && (
                    <LocationPopover
                      onSelect={(loc) => {
                        setCaptureLocation(loc);
                        setCaptureLocationAutoFilled(false);
                        setShowCaptureLocationPopover(false);
                      }}
                      onClose={() => setShowCaptureLocationPopover(false)}
                    />
                  )}
                </div>
                {captureLocation && (
                  <button
                    type="button"
                    onClick={() => {
                      setCaptureLocation(null);
                      setCaptureLocationAutoFilled(false);
                      try { sessionStorage.setItem('capture-geo-denied', '1'); } catch { /* private mode */ }
                    }}
                    aria-label={lang === 'zh' ? '清除地点' : 'Clear location'}
                    className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground/55 transition-colors hover:bg-destructive/8 hover:text-destructive"
                  >
                    <X size={13} />
                  </button>
                )}

                {/* Mood: collapsed by default as a quiet trigger; when one is
                    picked the trigger shows the chosen emoji+label, when not
                    picked it reads "How are you feeling?". Tapping opens an
                    inline drawer with all 5 options. */}
                <button
                  type="button"
                  onClick={() => setShowMoodDrawer(v => !v)}
                  aria-expanded={showMoodDrawer}
                  className={cn(
                    "inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-[12px] font-medium transition-colors",
                    captureMood
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-border/55 bg-transparent text-muted-foreground hover:border-border hover:text-foreground"
                  )}
                >
                  <span className="text-[14px] leading-none">
                    {captureMood ? CAPTURE_MOOD_EMOJIS[captureMood] : '🙂'}
                  </span>
                  <span>
                    {captureMood
                      ? captureMood.charAt(0).toUpperCase() + captureMood.slice(1)
                      : (lang === 'zh' ? '心情' : 'Mood')}
                  </span>
                </button>

                <Button
                  onClick={handleSaveCapture}
                  disabled={!captureDraft.trim() || isSavingCapture}
                  size="icon"
                  title={lang === 'zh' ? '保存(回车)' : 'Save (Enter)'}
                  aria-label={lang === 'zh' ? '保存 moment' : 'Save moment'}
                  className="ml-auto h-10 w-10 rounded-full shadow-[0_4px_14px_hsl(var(--primary)/0.25)] transition-transform hover:scale-[1.04] active:scale-[0.96] disabled:scale-100 disabled:shadow-none"
                >
                  {isSavingCapture ? <Loader2 size={15} className="animate-spin" /> : <ArrowUp size={17} />}
                </Button>
              </div>

              {/* Mood drawer — only appears when expanded. Animates in/out. */}
              {showMoodDrawer && (
                <div className="flex flex-wrap items-center gap-1.5 border-t border-border/40 px-3 py-2.5 animate-in fade-in slide-in-from-top-1 duration-200">
                  {CAPTURE_MOODS.map((mood) => (
                    <button
                      key={mood}
                      type="button"
                      onClick={() => {
                        setCaptureMood((c) => c === mood ? null : mood);
                        // Close drawer after a pick — keeps the toolbar tidy.
                        if (captureMood !== mood) setShowMoodDrawer(false);
                      }}
                      className={cn(
                        "inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-medium transition-colors",
                        captureMood === mood
                          ? "border-primary/45 bg-primary/12 text-primary"
                          : "border-border/45 bg-[hsl(var(--surface-contrast))]/40 text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <span className="text-[13px] leading-none">{CAPTURE_MOOD_EMOJIS[mood]}</span>
                      <span>{mood.charAt(0).toUpperCase() + mood.slice(1)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Affordance hint — quietly teaches the keyboard shortcut */}
            <p className="px-1 text-center text-[11px] text-muted-foreground/45">
              {lang === 'zh' ? (
                <>
                  <kbd className="rounded border border-border/50 bg-[hsl(var(--surface-soft))] px-1 py-px font-mono text-[10px]">Enter</kbd> 保存 ·{' '}
                  <kbd className="rounded border border-border/50 bg-[hsl(var(--surface-soft))] px-1 py-px font-mono text-[10px]">Shift</kbd>+<kbd className="rounded border border-border/50 bg-[hsl(var(--surface-soft))] px-1 py-px font-mono text-[10px]">Enter</kbd> 换行
                </>
              ) : (
                <>
                  <kbd className="rounded border border-border/50 bg-[hsl(var(--surface-soft))] px-1 py-px font-mono text-[10px]">Enter</kbd> to save ·{' '}
                  <kbd className="rounded border border-border/50 bg-[hsl(var(--surface-soft))] px-1 py-px font-mono text-[10px]">Shift</kbd>+<kbd className="rounded border border-border/50 bg-[hsl(var(--surface-soft))] px-1 py-px font-mono text-[10px]">Enter</kbd> for newline
                </>
              )}
            </p>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
