import type { Todo } from '@/hooks/useTodos';

const VALID_SEGMENTS = new Set(['anytime', 'morning', 'afternoon', 'evening']);
const CALENDAR_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const normTitle = (s: string) => s.trim().toLowerCase();

// A carried task's "worth keeping" score: any logged progress dominates
// (weighted heavily), then any recorded timer seconds. Used to pick the single
// survivor when the same task title appears on several past days.
const workScore = (t: Todo) => (t.timer_seconds || 0) + (t.progress || 0) * 100000;
const isRunning = (t: Todo) => !!t.timer_started_at && !t.timer_ended_at;

/** Completed tasks stay on their original day; every unfinished task moves. */
export function selectRolloverTodos(todos: Todo[]): Todo[] {
  return todos.filter(todo =>
    !todo.is_completed &&
    CALENDAR_DATE_PATTERN.test(todo.date) &&
    !todo.is_recurring &&
    !todo.due_date &&
    !todo.parent_due_id &&
    !todo.habit_category
  );
}

export function planCrossesIntoDate(todo: Todo, targetDate: string): boolean {
  if (!todo.plan_started_at || !todo.plan_ended_at) return false;
  const start = new Date(todo.plan_started_at).getTime();
  const end = new Date(todo.plan_ended_at).getTime();
  const midnight = new Date(`${targetDate}T00:00:00`).getTime();
  return Number.isFinite(start) && Number.isFinite(end) && start < midnight && end > midnight;
}

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
  const todayByTitle = new Map<string, Todo[]>();
  for (const todo of todos) {
    if (todo.is_completed) continue;
    const key = normTitle(todo.title);
    const rows = todayByTitle.get(key);
    if (rows) rows.push(todo);
    else todayByTitle.set(key, [todo]);
  }

  const byTitle = new Map<string, Todo>();
  for (const t of pastDayOpenTodos) {
    if (existing.has(t.id) || t.is_completed) continue;
    const key = normTitle(t.title);
    const matchingToday = todayByTitle.get(key) || [];
    // Never hide a live cross-day timer behind a same-title task already
    // created for today. The running row is the user's current activity and
    // must remain reachable even if the physical date move failed.
    if (matchingToday.length > 0 && (!isRunning(t) || matchingToday.some(isRunning))) continue;
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
