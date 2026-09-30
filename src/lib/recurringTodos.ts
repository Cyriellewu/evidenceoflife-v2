import type { Todo, TodoStep } from '@/hooks/useTodos';

export interface RecurringSourceLite {
  id: string;
  title: string;
  time_segment: Todo['time_segment'];
}

export interface ClonedTodoInsert {
  user_id: string;
  title: string;
  date: string;
  time_segment: Todo['time_segment'];
  sort_order: number;
  recurrence_source_id: string;
  is_recurring: false;
}

export interface ClonedStepInsert {
  user_id: string;
  title: string;
  date: '_step_';
  time_segment: 'anytime';
  sort_order: number;
  parent_due_id: string;
}

const normRecurringTitle = (s: string) => s.trim().toLowerCase();

/**
 * Given all recurring source rows and every existing todo already on `todayDate`
 * (of any origin), return the source ids that still need a fresh clone today.
 * A source is considered covered if today already has any of:
 *   - a row whose `recurrence_source_id === source.id`, OR
 *   - the source row itself (`source.date === todayDate`) — the source is its
 *     own instance on the day it was created; don't double-clone, OR
 *   - a same-title row already present today (case/space-insensitive). This
 *     dedups against a task the user manually re-added because they forgot it
 *     was already recurring, so the daily clone never stacks a second identical
 *     copy on top of it. Title matching only applies when both the source and
 *     the existing rows carry a `title`; omit titles to keep the id-only
 *     behaviour.
 */
export function pickRecurringSourcesNeedingClone(
  sources: Array<{ id: string; date: string; title?: string }>,
  existingToday: Array<{ id: string; recurrence_source_id: string | null; title?: string }>,
  todayDate: string,
): string[] {
  const covered = new Set<string>();
  const existingTitles = new Set<string>();
  const pickedTitles = new Set<string>();
  for (const row of existingToday) {
    if (row.recurrence_source_id) covered.add(row.recurrence_source_id);
    if (row.title != null) existingTitles.add(normRecurringTitle(row.title));
  }
  const needed: string[] = [];
  for (const src of sources) {
    if (src.date === todayDate) continue;
    if (covered.has(src.id)) continue;
    const titleKey = src.title != null ? normRecurringTitle(src.title) : null;
    if (titleKey && existingTitles.has(titleKey)) continue;
    // Historical data may contain duplicate recurring SOURCE rows with the same
    // title. Even if they point to different ids, a daily clone should be
    // created at most once per logical loop/title.
    if (titleKey && pickedTitles.has(titleKey)) continue;
    needed.push(src.id);
    if (titleKey) pickedTitles.add(titleKey);
  }
  return needed;
}

/**
 * Build the insert payload for a freshly cloned recurring instance. The clone
 * carries the source's title + time_segment forward but starts as a blank slate:
 * no timer, no plan slot, no progress, not marked recurring itself (only the
 * source is recurring), and points back at its source via recurrence_source_id.
 */
export function buildClonedTodoInsert(
  source: {
    id: string;
    user_id: string;
    title: string;
    time_segment: Todo['time_segment'];
  },
  todayDate: string,
  sortOrder: number,
): ClonedTodoInsert {
  return {
    user_id: source.user_id,
    title: source.title,
    date: todayDate,
    time_segment: source.time_segment,
    sort_order: sortOrder,
    recurrence_source_id: source.id,
    is_recurring: false,
  };
}

/**
 * Clone every step of a source parent to point at the newly cloned parent.
 * Steps are fresh: no timer, no plan, order preserved.
 */
export function buildClonedStepInserts(
  steps: Array<Pick<TodoStep, 'title' | 'sort_order'>>,
  newParentId: string,
  userId: string,
): ClonedStepInsert[] {
  return steps.map((s, i) => ({
    user_id: userId,
    title: s.title,
    date: '_step_' as const,
    time_segment: 'anytime' as const,
    sort_order: s.sort_order ?? i,
    parent_due_id: newParentId,
  }));
}

/**
 * Count consecutive completed days ending at `todayDate` (inclusive if today's
 * instance is completed; otherwise counting starts from yesterday). Walks
 * backward one day at a time; a missing day or an uncompleted instance for
 * that day breaks the streak.
 *
 * `instances` should include the source row itself AND every clone
 * (recurrence_source_id === source.id). Each row must have `date` and
 * `is_completed`. Rows on the same date collapse to "completed if any is
 * completed" — a source and its self-clone that happens to exist won't be
 * double-counted.
 */
export function computeConsecutiveCompletedDays(
  instances: Array<{ date: string; is_completed: boolean }>,
  todayDate: string,
): number {
  if (instances.length === 0) return 0;
  const byDate = new Map<string, boolean>();
  for (const row of instances) {
    const prev = byDate.get(row.date);
    byDate.set(row.date, (prev ?? false) || row.is_completed);
  }
  let cursor = todayDate;
  let count = 0;
  if (byDate.get(cursor) === undefined) {
    cursor = shiftDate(cursor, -1);
  } else if (byDate.get(cursor) === false) {
    cursor = shiftDate(cursor, -1);
  }
  while (true) {
    const done = byDate.get(cursor);
    if (done !== true) break;
    count += 1;
    cursor = shiftDate(cursor, -1);
  }
  return count;
}

function shiftDate(yyyyMmDd: string, deltaDays: number): string {
  const [y, m, d] = yyyyMmDd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export const RECURRING_PROMOTION_THRESHOLD = 7;
export const RECURRING_HABIT_CATEGORY = 'daily';

export interface RecurringToggleTarget {
  id: string;
  is_recurring?: boolean;
  recurrence_source_id?: string | null;
}

export type RecurringTogglePlan =
  | { action: 'noop' }
  | { action: 'enable'; id: string }
  | { action: 'disable'; sourceId: string };

export function isDailyRepeatTodo(t: {
  is_recurring?: boolean;
  recurrence_source_id?: string | null;
} | null | undefined): boolean {
  return !!(t?.is_recurring || t?.recurrence_source_id);
}

/**
 * Decide what a daily-repeat toggle should do, given the row the user acted on.
 *
 * A recurring series is one SOURCE (is_recurring=true) plus per-day CLONES
 * (recurrence_source_id set). The toggle must act on the whole chain:
 *  - Enabling only applies to a plain task. If the row is already part of a
 *    series (source or clone) it's a no-op — the same task can never be set to
 *    repeat twice (which used to spawn duplicate sources).
 *  - Disabling from ANY row resolves the source (its own id, or the clone's
 *    recurrence_source_id) so the caller can stop the source and detach clones.
 */
export function planRecurringToggle(
  target: RecurringToggleTarget | undefined,
  id: string,
  next: boolean,
): RecurringTogglePlan {
  const alreadyInSeries = isDailyRepeatTodo(target);
  if (next) {
    if (alreadyInSeries) return { action: 'noop' };
    return { action: 'enable', id };
  }
  return { action: 'disable', sourceId: target?.recurrence_source_id ?? id };
}
