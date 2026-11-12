/**
 * Focus timer rules — the one place that decides how long a session ran and
 * how it ends. Pure functions only (no React, no Supabase) so every rule has a
 * unit test. Components call these instead of re-deriving the maths.
 *
 * Data model (unchanged, lives on the todo row):
 *   timer_started_at  start of the CURRENT session (null when not running)
 *   timer_ended_at    set when the session stopped (null while running)
 *   timer_seconds     seconds banked from earlier sessions
 * Pause state lives on the device: { pausedAt, totalPausedMs } per todo.
 *
 * Invariants:
 *   - running  ⇔ timer_started_at set and timer_ended_at null
 *   - a session's worked seconds never include paused time and never exceed
 *     the auto-stop cap
 *   - a stopped session's end is never after the last moment of real work
 *     (a timer paused overnight ends at the pause, not hours later)
 */

export interface PauseState {
  /** epoch ms when the current pause began, or null if not paused */
  pausedAt: number | null;
  /** paused time already finished, in ms */
  totalPausedMs: number;
}

export interface TimerFields {
  timer_started_at?: string | null;
  timer_ended_at?: string | null;
  timer_seconds?: number | null;
}

/** A focus timer running this long was left on by mistake. */
export const AUTO_STOP_TIMER_HOURS = 8;
/** A break this long means the session is over: it ends where the break began. */
export const LONG_BREAK_MINUTES = 30;

const toMs = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : null;
};

export function isTimerRunning(t: TimerFields, now = Date.now()): boolean {
  const start = toMs(t.timer_started_at);
  return start != null && !t.timer_ended_at && start <= now;
}

/** Seconds of real work in the current session (pauses excluded, never negative). */
export function sessionElapsedSec(startISO: string | null | undefined, pause: PauseState | undefined, now: number): number {
  const start = toMs(startISO);
  if (start == null) return 0;
  const ongoingPause = pause?.pausedAt != null ? Math.max(0, now - pause.pausedAt) : 0;
  const paused = Math.max(0, pause?.totalPausedMs ?? 0) + ongoingPause;
  return Math.max(0, Math.floor((now - start - paused) / 1000));
}

/** Banked seconds + the current session. */
export function totalElapsedSec(t: TimerFields, pause: PauseState | undefined, now: number): number {
  const banked = Math.max(0, t.timer_seconds ?? 0);
  return isTimerRunning(t, now) ? banked + sessionElapsedSec(t.timer_started_at, pause, now) : banked;
}

export interface AutoStopPlan {
  /** when the session is recorded as ending (never after real work stopped) */
  endISO: string;
  /** worked seconds of this session, capped */
  sessionSec: number;
  /** value to store in timer_seconds */
  totalSec: number;
  /** why it stopped: left running, or a break that never ended */
  reason: 'forgotten' | 'long-break';
}

/**
 * Forgotten-timer rule. Returns null while the timer is legitimately running.
 * Once `capHours` of wall-clock time have passed since the session started,
 * the session is closed at the last moment of real work:
 *   - paused → at the pause
 *   - not paused → after `capHours` of work (pauses added back)
 * and its worked time is capped at `capHours`.
 * A break of `breakMinutes` or more also ends the session, at the moment the
 * break began: the record shows the work that actually happened, not a
 * session that sat paused for hours.
 */
export function planAutoStop(
  t: TimerFields,
  pause: PauseState | undefined,
  now: number,
  capHours = AUTO_STOP_TIMER_HOURS,
  breakMinutes = LONG_BREAK_MINUTES,
): AutoStopPlan | null {
  if (!isTimerRunning(t, now)) return null;
  const start = toMs(t.timer_started_at)!;
  const capMs = capHours * 3600 * 1000;
  const longBreak = pause?.pausedAt != null && now - pause.pausedAt >= breakMinutes * 60_000;
  if (now - start < capMs && !longBreak) return null;

  const finishedPauses = Math.max(0, pause?.totalPausedMs ?? 0);
  const lastWork = pause?.pausedAt != null ? Math.min(pause.pausedAt, now) : now;
  const workedMs = Math.max(0, lastWork - start - finishedPauses);
  const cappedWorkMs = Math.min(workedMs, capMs);
  const endMs = Math.min(lastWork, start + finishedPauses + cappedWorkMs);
  const sessionSec = Math.floor(cappedWorkMs / 1000);
  return {
    endISO: new Date(endMs).toISOString(),
    sessionSec,
    totalSec: Math.max(0, t.timer_seconds ?? 0) + sessionSec,
    reason: longBreak ? 'long-break' : 'forgotten',
  };
}

export interface SessionMomentKey {
  tags?: string[] | null;
  timer_started_at?: string | null;
}

/** The session tag (`todo-session:<todoId>`) a focus-session moment carries. */
export const sessionTagOf = (m: SessionMomentKey): string | undefined =>
  m.tags?.find(tag => tag.startsWith('todo-session:'));

/**
 * One focus session = one moment. Returns the already-saved moment for the
 * same task and the same start time, if any.
 */
export function findDuplicateSessionMoment<T extends SessionMomentKey>(existing: T[], draft: SessionMomentKey): T | undefined {
  const tag = sessionTagOf(draft);
  const start = toMs(draft.timer_started_at);
  if (!tag || start == null) return undefined;
  return existing.find(m => m.tags?.includes(tag) && toMs(m.timer_started_at) === start);
}

/**
 * Apply a write to every in-memory copy of a todo list (today, past-day open
 * tasks, yesterday's cross-midnight copy). A copy that misses a stop keeps a
 * dead timer "running".
 */
export function patchTodoList<T extends { id: string }>(list: T[], id: string, updates: Partial<T>): T[] {
  return list.some(t => t.id === id) ? list.map(t => (t.id === id ? { ...t, ...updates } : t)) : list;
}

const localDayOf = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * The moment that records one finished focus session. Filed on the day the
 * session STARTED (a session from 23:30 to 00:40 belongs to the earlier day),
 * tagged so it groups with its task and can be de-duplicated.
 */
export function buildSessionMomentDraft(
  todo: { id: string; title: string; tags?: string[] | null },
  startISO: string,
  endISO: string,
  workingSec: number,
  emoji?: string,
) {
  const startMs = toMs(startISO);
  return {
    ...(startMs != null ? { date: localDayOf(startMs) } : {}),
    text: todo.title,
    emoji,
    photos: [] as string[],
    tags: ['focus-session', `todo-session:${todo.id}`, ...(todo.tags || [])],
    timer_started_at: startISO,
    timer_ended_at: endISO,
    timer_seconds: Math.max(0, Math.floor(workingSec)),
  };
}

/**
 * Moments use timer_started_at for two things: a note pinned to a time (no
 * end, timer_seconds null) and a running moment timer. A running moment
 * timer is written with timer_seconds = 0 when it starts, which is what tells
 * them apart. Only a running one may be counted up to "now".
 */
export function isMomentTimerRunning(m: TimerFields): boolean {
  return !!m.timer_started_at && !m.timer_ended_at && m.timer_seconds === 0;
}
