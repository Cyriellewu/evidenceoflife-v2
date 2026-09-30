import type { Todo } from '@/hooks/useTodos';

const VALID_SEGMENTS = new Set(['anytime', 'morning', 'afternoon', 'evening']);

const normTitle = (s: string) => s.trim().toLowerCase();

function localDayKey(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Unfinished plan tasks from earlier days that belong in today's open list.
 * Steps, dues, and habits stay on their own surfaces. `date` is not rewritten.
 */
export function isOpenPlanCarry(todo: Todo): boolean {
  if (todo.is_completed) return false;
  if (!todo.date || todo.date.startsWith('_')) return false;
  if (todo.parent_due_id) return false;
  if (todo.due_date) return false;
  if (todo.habit_category) return false;
  return true;
}

/**
 * Timeline copy of today's list. A carried task whose plan window sits on
 * another day is still open work — show it as unscheduled on `day` instead of
 * painting yesterday's block onto today. This copy is display-only; it does
 * not write `date` or plan timestamps.
 */
export function presentCarryOnTimeline(todos: Todo[], day: string): Todo[] {
  return todos.map(t => {
    if (t.date === day || t.is_completed) return t;
    const planDay = localDayKey(t.plan_started_at);
    if (!t.plan_started_at || planDay === day) return t;
    return { ...t, plan_started_at: null, plan_ended_at: null };
  });
}

/**
 * Blank unfinished rows (no timer). Kept as a pure helper.
 * The app does NOT rewrite these rows onto today — today's list shows them
 * through `mergeCarriedTodos` while `date` stays on the original day.
 */
export function selectTodosEligibleForRollover<T extends {
  id: string;
  timer_started_at?: string | null;
  timer_ended_at?: string | null;
  timer_seconds?: number | null;
}>(rows: T[], _previousDate?: string): T[] {
  return rows.filter((todo) => {
    if (todo.timer_started_at) return false;
    if (todo.timer_ended_at) return false;
    if ((todo.timer_seconds || 0) > 0) return false;
    return true;
  });
}


// A carried task's "worth keeping" score: any logged progress dominates
// (weighted heavily), then any recorded timer seconds. Used to pick the single
// survivor when the same task title appears on several past days.
const workScore = (t: Todo) => (t.timer_seconds || 0) + (t.progress || 0) * 100000;

/**
 * Merge unfinished tasks carried over from previous days into today's list.
 *
 * A task left unfinished across several days leaves one row per day (rollover
 * can't move rows that carry a timer, and a skipped day breaks the
 * carry-forward chain), so the same task can appear two or three times. This
 * collapses same-title carried rows to a single copy — preferring the one with
 * real work logged (progress/timer), then the most recent day — and drops any
 * carried row whose title already exists in today's own list. Stray
 * time_segment values are normalized to "anytime" so carried rows always land
 * in a visible section.
 */
export function mergeCarriedTodos(todos: Todo[], pastDayOpenTodos: Todo[]): Todo[] {
  if (!pastDayOpenTodos.length) return todos;

  const existing = new Set(todos.map(t => t.id));
  const todayTitles = new Set(
    todos.filter(t => !t.is_completed).map(t => normTitle(t.title))
  );

  const byTitle = new Map<string, Todo>();
  for (const t of pastDayOpenTodos) {
    if (existing.has(t.id) || t.is_completed) continue;
    const key = normTitle(t.title);
    if (todayTitles.has(key)) continue;
    const prev = byTitle.get(key);
    if (!prev) {
      byTitle.set(key, t);
      continue;
    }
    const keep = workScore(t) !== workScore(prev)
      ? (workScore(t) > workScore(prev) ? t : prev)
      : (t.date > prev.date ? t : prev);
    byTitle.set(key, keep);
  }

  const carried = [...byTitle.values()].map(t =>
    VALID_SEGMENTS.has(t.time_segment as string)
      ? t
      : { ...t, time_segment: 'anytime' as Todo['time_segment'] }
  );

  return [...todos, ...carried];
}

// A carried row is a "pure empty shell" when it holds no work at all: no logged
// progress, no recorded timer seconds, no running timer, and no step children.
// These are the safe-to-delete duplicates — a task left unfinished across days
// leaves an identical blank copy per day, and only the blanks may be removed.
// A recurring SOURCE (is_recurring) is never a shell: deleting it would break
// the daily clone chain, so it is always preserved regardless of emptiness.
const isEmptyShell = (t: Todo, parentIdsWithSteps: Set<string>) =>
  !t.is_completed &&
  !t.is_recurring &&
  (t.progress || 0) === 0 &&
  (t.timer_seconds || 0) === 0 &&
  !t.timer_started_at &&
  !parentIdsWithSteps.has(t.id);

/**
 * Pick carried-over rows that are safe to physically delete from the database.
 *
 * `mergeCarriedTodos` only hides duplicates at the display layer; this is its
 * destructive mirror. It returns the ids of redundant *pure empty shells* —
 * same-title carried rows carrying zero work (no progress, no timer, no steps).
 * A row with any work logged is NEVER returned, so real history is preserved.
 *
 * Rules per normalized title:
 *  - If today already has that title, or any carried row for it holds real work,
 *    a survivor exists elsewhere → every empty shell is redundant and removable.
 *  - If every carried row for the title is a blank shell and today has no copy,
 *    keep the most recent one and mark the older blanks removable.
 * A title with a single blank shell and no other copy is left untouched.
 */
export function selectRedundantEmptyCarriedIds(
  todos: Todo[],
  pastDayOpenTodos: Todo[],
  parentIdsWithSteps: Set<string>,
): string[] {
  if (!pastDayOpenTodos.length) return [];

  const existing = new Set(todos.map(t => t.id));
  const todayTitles = new Set(
    todos.filter(t => !t.is_completed).map(t => normTitle(t.title))
  );

  const groups = new Map<string, Todo[]>();
  for (const t of pastDayOpenTodos) {
    if (existing.has(t.id) || t.is_completed) continue;
    const key = normTitle(t.title);
    const arr = groups.get(key);
    if (arr) arr.push(t);
    else groups.set(key, [t]);
  }

  const removable: string[] = [];
  for (const [title, rows] of groups) {
    const shells = rows.filter(t => isEmptyShell(t, parentIdsWithSteps));
    const hasWorkElsewhere = rows.length > shells.length; // some row holds work
    if (todayTitles.has(title) || hasWorkElsewhere) {
      // A survivor lives on today or in a work-bearing row → drop all blanks.
      for (const s of shells) removable.push(s.id);
    } else if (shells.length > 1) {
      // Only blanks and no today copy → keep the most recent, drop the rest.
      const [, ...older] = [...shells].sort((a, b) => (a.date > b.date ? -1 : 1));
      for (const s of older) removable.push(s.id);
    }
  }

  return removable;
}
