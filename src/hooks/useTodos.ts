import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { useAuth } from '@/hooks/useAuth';
import { format, isSameDay, subDays } from 'date-fns';
import { hasTrackedFirstAction, markFirstActionTracked, trackEvent } from '@/lib/analytics';
import { isOpenPlanCarry } from '@/lib/carryTodos';
import { selectCorruptTimerIds } from '@/lib/staleTimers';
import {
  pickRecurringSourcesNeedingClone,
  buildClonedTodoInsert,
  buildClonedStepInserts,
  computeConsecutiveCompletedDays,
  planRecurringToggle,
  RECURRING_PROMOTION_THRESHOLD,
  RECURRING_HABIT_CATEGORY,
} from '@/lib/recurringTodos';
import { type DueLink, parseDueLinks, serializeDueLinks } from '@/lib/dueLinks';

export interface Todo {
  id: string;
  title: string;
  date: string;
  time_segment: 'morning' | 'afternoon' | 'evening' | 'anytime';
  progress: number;
  is_completed: boolean;
  due_date: string | null;
  sort_order: number;
  created_at: string;
  timer_started_at: string | null;
  timer_ended_at: string | null;
  timer_seconds: number;
  tags: string[];
  plan_started_at: string | null;
  plan_ended_at: string | null;
  photos?: string[];
  location_name?: string | null;
  location_lat?: number | null;
  location_lng?: number | null;
  location_category?: string | null;
  note?: string | null;
  habit_category?: string | null;
  parent_due_id?: string | null;
  is_recurring?: boolean;
  recurrence_source_id?: string | null;
  promoted_to_habit_id?: string | null;
}

export interface TodoStep {
  id: string;
  title: string;
  is_completed: boolean;
  sort_order: number;
  parent_due_id: string;
  timer_started_at?: string | null;
  timer_seconds?: number | null;
  plan_started_at?: string | null;
  plan_ended_at?: string | null;
  /** Resource links for this step (same shape as habit/deadline links). */
  links?: DueLink[];
}

type TodoRow = Database['public']['Tables']['todos']['Row'];
type TodoInsert = Database['public']['Tables']['todos']['Insert'];
type RecurringSourceRow = Pick<TodoRow, 'id' | 'user_id' | 'title' | 'time_segment' | 'date' | 'sort_order'>;
type RecurringExistingRow = Pick<TodoRow, 'id' | 'recurrence_source_id' | 'title'>;
type RecurringInstanceRow = Pick<TodoRow, 'date' | 'is_completed' | 'id'>;
type SourceStepSeedRow = Pick<TodoRow, 'title' | 'sort_order'>;
type StepSelectRow = Pick<
  TodoRow,
  'id' | 'title' | 'is_completed' | 'sort_order' | 'parent_due_id' | 'timer_started_at' | 'timer_seconds' | 'plan_started_at' | 'plan_ended_at' | 'links'
>;

function mapStepRow(row: StepSelectRow, parentId: string): TodoStep {
  return {
    id: row.id,
    title: row.title,
    is_completed: !!row.is_completed,
    sort_order: row.sort_order ?? 0,
    parent_due_id: parentId,
    timer_started_at: row.timer_started_at ?? null,
    timer_seconds: row.timer_seconds ?? 0,
    plan_started_at: row.plan_started_at ?? null,
    plan_ended_at: row.plan_ended_at ?? null,
    links: parseDueLinks(row.links),
  };
}

function buildDemoTodos(targetDate: string): Todo[] {
  const localTime = (time: string) => `${targetDate}T${time}:00`;

  return [
    {
      id: `demo-todo-1-${targetDate}`,
      title: 'Morning reset',
      date: targetDate,
      time_segment: 'morning',
      progress: 100,
      is_completed: true,
      due_date: null,
      sort_order: 0,
      created_at: localTime('06:45'),
      timer_started_at: localTime('07:12'),
      timer_ended_at: localTime('07:34'),
      timer_seconds: 22 * 60,
      tags: ['reset'],
      plan_started_at: localTime('06:45'),
      plan_ended_at: localTime('07:05'),
    },
    {
      id: `demo-todo-2-${targetDate}`,
      title: 'Draft project notes',
      date: targetDate,
      time_segment: 'afternoon',
      progress: 65,
      is_completed: false,
      due_date: null,
      sort_order: 1,
      created_at: localTime('07:20'),
      timer_started_at: localTime('07:48'),
      timer_ended_at: localTime('08:18'),
      timer_seconds: 30 * 60,
      tags: ['focus'],
      plan_started_at: localTime('07:20'),
      plan_ended_at: localTime('07:50'),
    },
    {
      id: `demo-todo-3-${targetDate}`,
      title: 'Call home',
      date: targetDate,
      time_segment: 'evening',
      progress: 100,
      is_completed: true,
      due_date: null,
      sort_order: 2,
      created_at: localTime('08:10'),
      timer_started_at: localTime('08:52'),
      timer_ended_at: localTime('09:18'),
      timer_seconds: 26 * 60,
      tags: ['life'],
      plan_started_at: localTime('08:10'),
      plan_ended_at: localTime('08:40'),
    },
  ];
}

export type AddTodoOptions = {
  isRecurring?: boolean;
  plan_started_at?: string | null;
  plan_ended_at?: string | null;
  timer_started_at?: string | null;
  timer_ended_at?: string | null;
  timer_seconds?: number;
  is_completed?: boolean;
  progress?: number;
};

export function useTodos(date?: string, options?: { sideEffects?: boolean }) {
  const { user, isDemo, authReady } = useAuth();
  const targetDate = date || format(new Date(), 'yyyy-MM-dd');
  // When PlanView is controlled by Index's todos props, it still needs this hook
  // for steps / mutations — but must NOT re-run day rollover side effects, or the
  // two instances race on localStorage and one can no-op the real carry.
  const runSideEffects = options?.sideEffects !== false;
  const [todos, setTodos] = useState<Todo[]>([]);
  const [pastDayOpenTodos, setPastDayOpenTodos] = useState<Todo[]>([]);
  const [stepsByParent, setStepsByParent] = useState<Record<string, TodoStep[]>>({});
  const [loading, setLoading] = useState(true);
  const fetchGen = useRef(0);

  const rollOverYesterdayTodos = useCallback(async () => {
    // Unfinished tasks stay on the day they belong to. Today's list shows them
    // via the past-day merge below — we do not rewrite `date` or plan times.
    // Earlier versions moved those rows (and a cleanup pass moved some back),
    // which is what scrambled the timeline.
    if (!runSideEffects || !user || isDemo) return;
    if (!isSameDay(new Date(`${targetDate}T00:00:00`), new Date())) return;
  }, [user, isDemo, targetDate, runSideEffects]);

  const unrollMisrolledTodos = useCallback(async () => {
    // Kept so fetch order stays stable. Must not rewrite `date` or plan times.
  }, []);

  // A focus timer left running past midnight keeps counting, but its todo row
  // stays filed under the day it started. That makes the "thing you're doing
  // right now" invisible on today — no floating pill, no row in today's list,
  // and stopping it records the time back onto the old day. Pull every
  // still-running timer (started, never ended, not finished) that sits on an
  // earlier day onto today, so it surfaces where the user actually is and the
  // stop lands on today. timer_started_at is an absolute timestamp left intact,
  // so elapsed = now - started stays correct across the boundary. Completed /
  // stopped historical sessions are NOT touched — those are real past records.
  //
  // Exception: a timer that has been "running" for many hours is one the user
  // forgot to stop before walking away (or sleeping). Pulling those onto today
  // would flood the view with timers counting 20+, 40+ hours. Those are
  // auto-stopped instead — the bogus session is discarded (timer_started_at
  // cleared, timer_seconds/progress kept) and the task is left as a normal
  // unfinished carry-over so it still shows on today without a runaway clock.
  const pullRunningTimersToToday = useCallback(async () => {
    // A still-running timer stays on the day it started. Today's list shows the
    // unfinished task through the past-day merge. Do not move `date` or clear
    // plan times — that rewrite was scrambling historical timeline rows.
    if (!runSideEffects || !user || isDemo) return;
    if (!isSameDay(new Date(`${targetDate}T00:00:00`), new Date())) return;
  }, [user, isDemo, targetDate, runSideEffects]);

  // Recurring todos: on the first fetch of a given day, clone every source
  // todo (is_recurring=true) into today if today doesn't already have an
  // instance for it. Steps ride with the parent — a source with three steps
  // yields a clone with three fresh steps (blank timers, order preserved).
  // Guarded per day via localStorage so window focus / minute-sync fetches
  // don't re-insert on every rerun.
  const cloneRecurringSourcesForToday = useCallback(async () => {
    if (!runSideEffects) return;
    if (!user || isDemo) return;
    if (!isSameDay(new Date(`${targetDate}T00:00:00`), new Date())) return;

    const cloneKey = `recurring-clone-done:${user.id}:${targetDate}`;
    try {
      if (localStorage.getItem(cloneKey)) return;
    } catch { /* localStorage unavailable */ }

    const { data: sources, error: srcErr } = await supabase
      .from('todos')
      .select('id, user_id, title, time_segment, date, sort_order')
      .eq('user_id', user.id)
      .eq('is_recurring', true)
      .order('created_at', { ascending: true });
    try { localStorage.setItem(cloneKey, '1'); } catch { /* ignore */ }
    if (srcErr || !sources || sources.length === 0) return;

    const recurringSources = (sources ?? []) as RecurringSourceRow[];
    const sourceIds = recurringSources.map(s => s.id);
    const { data: existingToday } = await supabase
      .from('todos')
      .select('id, recurrence_source_id, title')
      .eq('date', targetDate)
      .in('recurrence_source_id', sourceIds);

    const existingRows = (existingToday ?? []) as RecurringExistingRow[];
    const needed = pickRecurringSourcesNeedingClone(
      recurringSources.map(s => ({ id: s.id, date: s.date })),
      existingRows.map(r => ({ id: r.id, recurrence_source_id: r.recurrence_source_id })),
      targetDate,
    );
    if (needed.length === 0) return;

    const { data: existingTodayForSort } = await supabase
      .from('todos')
      .select('sort_order')
      .eq('date', targetDate)
      .order('sort_order', { ascending: false })
      .limit(1);
    let nextSort = ((existingTodayForSort?.[0]?.sort_order as number | undefined) ?? -1) + 1;

    const neededSources = recurringSources.filter(s => needed.includes(s.id));
    for (const src of neededSources) {
      // Inherit the source's sort_order so a daily-recurring task lands in the
      // SAME slot every day (same time_segment + same rank) rather than being
      // appended to the end of today's list. Fall back to the end position only
      // when the source has no order recorded.
      const clonedSort = typeof src.sort_order === 'number' ? src.sort_order : nextSort;
      const insertPayload = buildClonedTodoInsert(
        { id: src.id, user_id: src.user_id, title: src.title, time_segment: src.time_segment as Todo['time_segment'] },
        targetDate,
        clonedSort,
      );
      nextSort += 1;
      const { data: newRow, error: insErr } = await supabase
        .from('todos')
        .insert(insertPayload as TodoInsert)
        .select('id')
        .single();
      if (insErr || !newRow) continue;
      const newParentId = (newRow as Pick<TodoRow, 'id'>).id;

      const { data: srcSteps } = await supabase
        .from('todos')
        .select('title, sort_order')
        .eq('date', '_step_')
        .eq('parent_due_id', src.id)
        .order('sort_order', { ascending: true });
      if (srcSteps && srcSteps.length > 0) {
        const sourceSteps = srcSteps as SourceStepSeedRow[];
        const stepInserts = buildClonedStepInserts(
          sourceSteps.map(s => ({ title: s.title, sort_order: s.sort_order })),
          newParentId,
          user.id,
        );
        await supabase.from('todos').insert(stepInserts as TodoInsert[]);
      }
    }
  }, [user, isDemo, targetDate, runSideEffects]);

  // Recurring todos: promote sources to Habits when the user has completed
  // an instance 7 days in a row. Writes a habit row (via the same shape as
  // useDues.addDue's insert: date='_due_none', habit_category='daily',
  // progress=1) and back-fills promoted_to_habit_id on the source + every
  // clone so the check never re-fires. Runs once per day via a localStorage
  // guard, and only for sources whose promoted_to_habit_id is still null.
  const promoteEligibleRecurringToHabits = useCallback(async () => {
    if (!runSideEffects) return;
    if (!user || isDemo) return;
    if (!isSameDay(new Date(`${targetDate}T00:00:00`), new Date())) return;

    const promoteKey = `recurring-promote-done:${user.id}:${targetDate}`;
    try {
      if (localStorage.getItem(promoteKey)) return;
    } catch { /* ignore */ }

    const { data: sources, error: srcErr } = await supabase
      .from('todos')
      .select('id, title')
      .eq('user_id', user.id)
      .eq('is_recurring', true)
      .is('promoted_to_habit_id', null);
    try { localStorage.setItem(promoteKey, '1'); } catch { /* ignore */ }
    if (srcErr || !sources || sources.length === 0) return;

    for (const src of (sources as Array<Pick<TodoRow, 'id' | 'title'>>)) {
      const srcId = src.id;
      const { data: instances } = await supabase
        .from('todos')
        .select('date, is_completed, id')
        .eq('user_id', user.id)
        .or(`id.eq.${srcId},recurrence_source_id.eq.${srcId}`);
      if (!instances) continue;
      const streak = computeConsecutiveCompletedDays(
        (instances as RecurringInstanceRow[]).map(r => ({ date: r.date, is_completed: !!r.is_completed })),
        targetDate,
      );
      if (streak < RECURRING_PROMOTION_THRESHOLD) continue;

      const { data: habitRow, error: habitErr } = await supabase
        .from('todos')
        .insert({
          user_id: user.id,
          title: src.title,
          date: '_due_none',
          time_segment: 'anytime',
          due_date: null,
          sort_order: 0,
          progress: 1,
          habit_category: RECURRING_HABIT_CATEGORY,
        })
        .select('id')
        .single();
      if (habitErr || !habitRow) continue;
      const habitId = (habitRow as Pick<TodoRow, 'id'>).id;

      await supabase
        .from('todos')
        .update({ promoted_to_habit_id: habitId })
        .or(`id.eq.${srcId},recurrence_source_id.eq.${srcId}`);
    }
  }, [user, isDemo, targetDate, runSideEffects]);

  const fetchTodos = useCallback(async () => {
    const gen = ++fetchGen.current;
    if (!authReady) {
      setLoading(true);
      return;
    }

    if (!user || isDemo) {
      setTodos(isDemo ? buildDemoTodos(targetDate) : []);
      setPastDayOpenTodos([]);
      setStepsByParent({});
      setLoading(false);
      return;
    }

    try {
      await rollOverYesterdayTodos();
      await unrollMisrolledTodos();
      await pullRunningTimersToToday();
      await cloneRecurringSourcesForToday();
      await promoteEligibleRecurringToHabits();

      const { data, error } = await supabase
        .from('todos')
        .select('*')
        .eq('date', targetDate)
        .order('sort_order', { ascending: true });

      if (!error && data) {
        const filtered = (data as Todo[]).filter(t => !(t.due_date && !t.parent_due_id));

        // Historical bugs/data races could leave multiple recurring rows for
        // one logical loop title on the same day. Keep a single best survivor
        // per title in today's view (prefer rows with real work/running state),
        // and clean up only pure-empty duplicates from DB.
        const recurringRows = filtered.filter(t => t.is_recurring || t.recurrence_source_id);
        const recurringGroups = new Map<string, Todo[]>();
        const recurringDupIds = new Set<string>();
        const recurringBlankDupIds: string[] = [];
        const recurringScore = (t: Todo) =>
          (t.timer_started_at ? 1_000_000_000 : 0) +
          ((t.progress || 0) * 100000) +
          (t.timer_seconds || 0);
        const isRecurringBlank = (t: Todo) =>
          (t.progress || 0) === 0 &&
          (t.timer_seconds || 0) === 0 &&
          !t.timer_started_at;

        for (const row of recurringRows) {
          const key = row.title?.trim().toLowerCase();
          if (!key) continue;
          const arr = recurringGroups.get(key);
          if (arr) arr.push(row);
          else recurringGroups.set(key, [row]);
        }

        for (const rows of recurringGroups.values()) {
          if (rows.length <= 1) continue;
          const ranked = [...rows].sort((a, b) => {
            const scoreDelta = recurringScore(b) - recurringScore(a);
            if (scoreDelta !== 0) return scoreDelta;
            const aCreated = new Date(a.created_at || 0).getTime();
            const bCreated = new Date(b.created_at || 0).getTime();
            return bCreated - aCreated;
          });
          const [, ...duplicates] = ranked;
          for (const dup of duplicates) {
            recurringDupIds.add(dup.id);
            if (isRecurringBlank(dup)) recurringBlankDupIds.push(dup.id);
          }
        }

        const filteredDeduped = recurringDupIds.size > 0
          ? filtered.filter(t => !recurringDupIds.has(t.id))
          : filtered;

        if (recurringBlankDupIds.length > 0) {
          void supabase.from('todos').delete().in('id', recurringBlankDupIds);
        }

        // Heal corrupt timers: a task whose banked timer_seconds is an absurd
        // multi-day value (thousands of hours) got its clock polluted — reset
        // the timer to zero while keeping the task and its progress. Fire the DB
        // update and zero the values locally so the runaway clock is gone on
        // this render, not just the next one.
        const corruptIds = selectCorruptTimerIds(
          filteredDeduped as { id: string; timer_seconds: number | null }[],
        );
        if (corruptIds.length > 0) {
          void supabase
            .from('todos')
            .update({ timer_seconds: 0, timer_started_at: null, timer_ended_at: null })
            .in('id', corruptIds);
          const corruptSet = new Set(corruptIds);
          for (const t of filteredDeduped) {
            if (corruptSet.has(t.id)) {
              t.timer_seconds = 0;
              t.timer_started_at = null;
              t.timer_ended_at = null;
            }
          }
        }

        if (gen !== fetchGen.current) return;
        setTodos(filteredDeduped);

        // Only surface past-day-open when viewing today. Historical days
        // shouldn't advertise "past-day open" from an even earlier day.
        const isToday = targetDate === format(new Date(), 'yyyy-MM-dd');
        let pastOpen: Todo[] = [];
        if (isToday) {
          // Recent unfinished plan tasks only. Keep `date` on the original day;
          // today's list and timeline read this set and merge it in display.
          const windowStart = format(subDays(new Date(`${targetDate}T00:00:00`), 14), 'yyyy-MM-dd');
          const previousDate = format(subDays(new Date(`${targetDate}T00:00:00`), 1), 'yyyy-MM-dd');
          const { data: pastData, error: pastError } = await supabase
            .from('todos')
            .select('*')
            .gte('date', windowStart)
            .lte('date', previousDate)
            .eq('is_completed', false)
            .order('date', { ascending: false })
            .order('sort_order', { ascending: true });
          if (pastError) {
            console.error('Failed to fetch unfinished tasks from earlier days:', pastError);
          } else if (pastData) {
            pastOpen = (pastData as Todo[]).filter(isOpenPlanCarry);
          }
        }

        // Same corrupt-timer heal for carried-over rows shown inline on today.
        if (pastOpen.length > 0) {
          const corruptPastIds = selectCorruptTimerIds(
            pastOpen as { id: string; timer_seconds: number | null }[],
          );
          if (corruptPastIds.length > 0) {
            void supabase
              .from('todos')
              .update({ timer_seconds: 0, timer_started_at: null, timer_ended_at: null })
              .in('id', corruptPastIds);
            const corruptPastSet = new Set(corruptPastIds);
            pastOpen = pastOpen.map(t =>
              corruptPastSet.has(t.id)
                ? { ...t, timer_seconds: 0, timer_started_at: null, timer_ended_at: null }
                : t
            );
          }
        }
        if (gen !== fetchGen.current) return;
        setPastDayOpenTodos(pastOpen);

        // Fetch step children for BOTH today's parents and past-day-open
        // parents in a single query. Steps live at `date='_step_'` with
        // `parent_due_id` pointing at the parent, so a Today TodoItem and a
        // past-day inline TodoItem look up steps identically. Skipping when
        // the list is empty avoids a `.in('parent_due_id', [])` query that
        // supabase would reject.
        const parentIds = [...filteredDeduped.map(t => t.id), ...pastOpen.map(t => t.id)];
        if (parentIds.length > 0) {
          const { data: stepData, error: stepError } = await supabase
            .from('todos')
            .select('id, title, is_completed, sort_order, parent_due_id, timer_started_at, timer_seconds, plan_started_at, plan_ended_at, links')
            .eq('date', '_step_')
            .in('parent_due_id', parentIds);
          if (!stepError && stepData) {
            const grouped: Record<string, TodoStep[]> = {};
            for (const s of stepData as StepSelectRow[]) {
              const pid = s.parent_due_id;
              if (!pid) continue;
              if (!grouped[pid]) grouped[pid] = [];
              grouped[pid].push(mapStepRow(s, pid));
            }
            Object.values(grouped).forEach(arr => arr.sort((a, b) => a.sort_order - b.sort_order));
            setStepsByParent(grouped);
          } else {
            setStepsByParent({});
          }
        } else {
          setStepsByParent({});
        }

        // Unfinished rows from earlier days stay in the database on their
        // original date. The list only merges them for display — refresh must
        // not delete those rows.
      }
    } catch (err) {
      console.error('Failed to fetch todos (exception):', err);
    } finally {
      if (gen === fetchGen.current) setLoading(false);
    }
  }, [user, targetDate, isDemo, authReady, rollOverYesterdayTodos, unrollMisrolledTodos, pullRunningTimersToToday, cloneRecurringSourcesForToday, promoteEligibleRecurringToHabits]);

  useEffect(() => {
    fetchTodos();
  }, [fetchTodos]);

  const addTodo = useCallback(async (
    title: string,
    timeSegment: Todo['time_segment'] = 'anytime',
    dueDate?: string,
    options?: AddTodoOptions,
  ): Promise<Todo | null> => {
    if (!user) return null;
    const isRecurring = options?.isRecurring === true;
    const seedCompleted = options?.is_completed === true;
    const seedProgress = options?.progress ?? (seedCompleted ? 100 : 0);
    const tempId = crypto.randomUUID();
    const optimistic: Todo = {
      id: tempId, title, date: targetDate, time_segment: timeSegment,
      progress: seedProgress, is_completed: seedCompleted, due_date: dueDate || null,
      sort_order: todos.length, created_at: new Date().toISOString(),
      timer_started_at: options?.timer_started_at ?? null,
      timer_ended_at: options?.timer_ended_at ?? null,
      timer_seconds: options?.timer_seconds ?? 0,
      tags: [],
      plan_started_at: options?.plan_started_at ?? null,
      plan_ended_at: options?.plan_ended_at ?? null,
      is_recurring: isRecurring,
    };
    setTodos(prev => [optimistic, ...prev]);

    if (isDemo) return optimistic;

    const { data, error } = await supabase
      .from('todos')
      .insert({
        user_id: user.id, title, date: targetDate,
        time_segment: timeSegment, due_date: dueDate || null,
        sort_order: todos.length,
        ...(isRecurring ? { is_recurring: true } : {}),
        ...(options?.plan_started_at !== undefined ? { plan_started_at: options.plan_started_at } : {}),
        ...(options?.plan_ended_at !== undefined ? { plan_ended_at: options.plan_ended_at } : {}),
        ...(options?.timer_started_at !== undefined ? { timer_started_at: options.timer_started_at } : {}),
        ...(options?.timer_ended_at !== undefined ? { timer_ended_at: options.timer_ended_at } : {}),
        ...(options?.timer_seconds !== undefined ? { timer_seconds: options.timer_seconds } : {}),
        ...(seedCompleted ? { is_completed: true, progress: seedProgress } : {}),
      })
      .select()
      .single();
    if (!error && data) {
      const todo = data as Todo;
      setTodos(prev => prev.map(t => t.id === tempId ? todo : t));
      if (!hasTrackedFirstAction(user.id, 'todo_created')) {
        trackEvent('first_action', {
          action_type: 'todo_created',
        });
        markFirstActionTracked(user.id, 'todo_created');
      }
      return todo;
    } else {
      setTodos(prev => prev.filter(t => t.id !== tempId));
      return null;
    }
  }, [user, targetDate, todos.length, isDemo]);

  const updateTodo = useCallback(async (id: string, updates: Partial<Todo>) => {
    if (isDemo) {
      setTodos(prev => {
        const next = prev.map(t => t.id === id ? { ...t, ...updates } : t);
        if (updates.date && updates.date !== targetDate) {
          return next.filter(t => t.id !== id);
        }
        return next;
      });
      setPastDayOpenTodos(prev => {
        const next = prev.map(t => t.id === id ? { ...t, ...updates } : t);
        return next.filter(t => !t.is_completed);
      });
      return;
    }
    // Optimistic update — apply immediately so UI reflects changes without DB round-trip delay
    setTodos(prev => {
      const next = prev.map(t => t.id === id ? { ...t, ...updates } : t);
      if (updates.date && updates.date !== targetDate) {
        return next.filter(t => t.id !== id);
      }
      return next;
    });
    setPastDayOpenTodos(prev => {
      const next = prev.map(t => t.id === id ? { ...t, ...updates } : t);
      return next.filter(t => !t.is_completed);
    });
    await supabase
      .from('todos')
      .update(updates)
      .eq('id', id);
  }, [isDemo, targetDate]);

  const deleteTodo = useCallback(async (id: string) => {
    if (isDemo) {
      setTodos(prev => prev.filter(t => t.id !== id));
      setPastDayOpenTodos(prev => prev.filter(t => t.id !== id));
      setStepsByParent(prev => {
        if (!prev[id]) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
      return;
    }
    // Cascade-delete child step rows first. The FK on parent_due_id is
    // ON DELETE SET NULL, so without this pass the child steps would linger
    // in the DB as orphans (invisible in every UI, but bloating the table).
    // Mirrors useDues.deleteDue which handles the same relationship.
    await supabase.from('todos').delete().eq('parent_due_id', id);
    const { error } = await supabase
      .from('todos')
      .delete()
      .eq('id', id);
    if (!error) {
      setTodos(prev => prev.filter(t => t.id !== id));
      setPastDayOpenTodos(prev => prev.filter(t => t.id !== id));
      setStepsByParent(prev => {
        if (!prev[id]) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  }, [isDemo]);

  const restoreTodo = useCallback(async (todo: Todo) => {
    // Re-insert a just-deleted todo (undo). Preserve original fields & order.
    setTodos(prev => {
      if (prev.some(t => t.id === todo.id)) return prev;
      const next = [...prev, todo];
      next.sort((a, b) => a.sort_order - b.sort_order);
      return next;
    });
    if (isDemo || !user) return;
    const { error } = await supabase
      .from('todos')
      .insert({
        id: todo.id, user_id: user.id, title: todo.title, date: todo.date,
        time_segment: todo.time_segment, progress: todo.progress,
        is_completed: todo.is_completed, due_date: todo.due_date,
        sort_order: todo.sort_order, created_at: todo.created_at,
        timer_started_at: todo.timer_started_at, timer_ended_at: todo.timer_ended_at,
        timer_seconds: todo.timer_seconds, tags: todo.tags,
        plan_started_at: todo.plan_started_at, plan_ended_at: todo.plan_ended_at,
      });
    if (error) {
      // DB restore failed — roll the optimistic re-insert back out
      setTodos(prev => prev.filter(t => t.id !== todo.id));
    }
  }, [isDemo, user]);

  const toggleComplete = useCallback(async (id: string) => {
    // Carried-over tasks from previous days live in pastDayOpenTodos (they are
    // surfaced in today's main list too), so look there as well — otherwise
    // ticking a carried task's checkbox would silently no-op.
    const todo = todos.find(t => t.id === id) ?? pastDayOpenTodos.find(t => t.id === id);
    if (!todo) return;
    const newCompleted = !todo.is_completed;
    await updateTodo(id, {
      is_completed: newCompleted,
      progress: newCompleted ? 100 : todo.progress,
    });
  }, [todos, pastDayOpenTodos, updateTodo]);

  const addStep = useCallback(async (
    parentId: string,
    title: string,
    options?: { links?: DueLink[] },
  ): Promise<string | null> => {
    const trimmed = title.trim();
    if (!trimmed) return null;
    const links = options?.links?.length ? options.links : undefined;
    const existing = stepsByParent[parentId] || [];
    const nextOrder = existing.length;
    const tempId = crypto.randomUUID();
    const optimistic: TodoStep = {
      id: tempId,
      title: trimmed,
      is_completed: false,
      sort_order: nextOrder,
      parent_due_id: parentId,
      timer_started_at: null,
      timer_seconds: 0,
      plan_started_at: null,
      plan_ended_at: null,
      links,
    };
    setStepsByParent(prev => ({ ...prev, [parentId]: [...(prev[parentId] || []), optimistic] }));
    if (isDemo || !user) return tempId;
    const { data, error } = await supabase
      .from('todos')
      .insert({
        user_id: user.id,
        title: trimmed,
        date: '_step_',
        time_segment: 'anytime',
        sort_order: nextOrder,
        parent_due_id: parentId,
        ...(links ? { links: serializeDueLinks(links) } : {}),
      })
      .select('id, title, is_completed, sort_order, parent_due_id, timer_started_at, timer_seconds, plan_started_at, plan_ended_at, links')
      .single();
    if (!error && data) {
      const row = data as StepSelectRow;
      const mapped = mapStepRow(row, parentId);
      setStepsByParent(prev => ({
        ...prev,
        [parentId]: (prev[parentId] || []).map(s => s.id === tempId ? mapped : s),
      }));
      return mapped.id;
    }
    setStepsByParent(prev => ({
      ...prev,
      [parentId]: (prev[parentId] || []).filter(s => s.id !== tempId),
    }));
    return null;
  }, [user, isDemo, stepsByParent]);

  const toggleStep = useCallback(async (stepId: string, completed: boolean) => {
    // Completing a step must also STOP its running timer — otherwise a finished
    // step keeps ticking (and, via the timeline, keeps its parent "ongoing").
    // Fold the elapsed wall-clock time into timer_seconds and clear the start
    // marker, mirroring stopStepTimer. Un-completing leaves the timer alone.
    const nowMs = Date.now();
    let timerStop: { timer_started_at: null; timer_seconds: number } | null = null;
    setStepsByParent(prev => {
      const next: Record<string, TodoStep[]> = {};
      for (const pid in prev) {
        next[pid] = prev[pid].map(s => {
          if (s.id !== stepId) return s;
          if (completed && s.timer_started_at) {
            const elapsed = Math.max(0, Math.floor((nowMs - new Date(s.timer_started_at).getTime()) / 1000));
            const acc = (s.timer_seconds ?? 0) + elapsed;
            timerStop = { timer_started_at: null, timer_seconds: acc };
            return { ...s, is_completed: completed, timer_started_at: null, timer_seconds: acc };
          }
          return { ...s, is_completed: completed };
        });
      }
      return next;
    });
    if (isDemo) return;
    const update: Record<string, unknown> = { is_completed: completed };
    if (timerStop) {
      update.timer_started_at = timerStop.timer_started_at;
      update.timer_seconds = timerStop.timer_seconds;
    }
    await supabase.from('todos').update(update).eq('id', stepId);
  }, [isDemo]);

  const deleteStep = useCallback(async (stepId: string) => {
    setStepsByParent(prev => {
      const next: Record<string, TodoStep[]> = {};
      for (const pid in prev) {
        next[pid] = prev[pid].filter(s => s.id !== stepId);
      }
      return next;
    });
    if (isDemo) return;
    await supabase.from('todos').delete().eq('id', stepId);
  }, [isDemo]);

  // Rename a step. Steps are stored as todo rows, so this is a plain title
  // update on the step's own row. Optimistic local update first, then persist.
  const updateStepTitle = useCallback(async (stepId: string, title: string) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    setStepsByParent(prev => {
      const next: Record<string, TodoStep[]> = {};
      for (const pid in prev) {
        next[pid] = prev[pid].map(s =>
          s.id === stepId ? { ...s, title: trimmed } : s
        );
      }
      return next;
    });
    if (isDemo) return;
    await supabase.from('todos').update({ title: trimmed }).eq('id', stepId);
  }, [isDemo]);

  /** Replace a step's link metadata (and optionally its display title) in one write. */
  const updateStepLink = useCallback(async (
    stepId: string,
    link: DueLink,
    displayTitle?: string,
  ) => {
    const title = displayTitle?.trim();
    setStepsByParent(prev => {
      const next: Record<string, TodoStep[]> = {};
      for (const pid in prev) {
        next[pid] = prev[pid].map(s =>
          s.id === stepId
            ? { ...s, links: [link], ...(title ? { title } : {}) }
            : s
        );
      }
      return next;
    });
    if (isDemo) return;
    await supabase.from('todos').update({
      links: serializeDueLinks([link]),
      ...(title ? { title } : {}),
    }).eq('id', stepId);
  }, [isDemo]);

  // Set (or clear) a step's planned time window. Steps are stored as todo rows,
  // so we reuse the same `plan_started_at` / `plan_ended_at` columns the parent
  // todo uses for its timeline block. Passing null for both clears the plan.
  const updateStepPlanTime = useCallback(async (
    stepId: string,
    planStartISO: string | null,
    planEndISO: string | null,
  ) => {
    setStepsByParent(prev => {
      const next: Record<string, TodoStep[]> = {};
      for (const pid in prev) {
        next[pid] = prev[pid].map(s =>
          s.id === stepId
            ? { ...s, plan_started_at: planStartISO, plan_ended_at: planEndISO }
            : s
        );
      }
      return next;
    });
    if (isDemo) return;
    await supabase
      .from('todos')
      .update({ plan_started_at: planStartISO, plan_ended_at: planEndISO })
      .eq('id', stepId);
  }, [isDemo]);

  // Per-step lightweight timer. A step is "running" while timer_started_at is
  // set; stopping folds the elapsed wall-clock time into the accumulated
  // timer_seconds and clears the start marker. Multiple steps may run at the
  // same time — each step tracks its own elapsed independently, so starting a
  // step never touches other running steps.
  const startStepTimer = useCallback(async (stepId: string) => {
    const nowISO = new Date().toISOString();
    let dbWrite: { timer_started_at: string; timer_seconds: number } | null = null;
    setStepsByParent(prev => {
      const next: Record<string, TodoStep[]> = {};
      for (const pid in prev) {
        next[pid] = prev[pid].map(s => {
          // Already running → leave it alone so we don't drop accumulated time.
          if (s.id === stepId && !s.timer_started_at) {
            dbWrite = { timer_started_at: nowISO, timer_seconds: s.timer_seconds ?? 0 };
            return { ...s, timer_started_at: nowISO };
          }
          return s;
        });
      }
      return next;
    });
    if (isDemo || !dbWrite) return;
    await supabase.from('todos').update({ timer_started_at: dbWrite.timer_started_at, timer_seconds: dbWrite.timer_seconds }).eq('id', stepId);
  }, [isDemo]);

  const stopStepTimer = useCallback(async (stepId: string) => {
    const nowMs = Date.now();
    let dbWrite: { timer_started_at: null; timer_seconds: number } | null = null;
    setStepsByParent(prev => {
      const next: Record<string, TodoStep[]> = {};
      for (const pid in prev) {
        next[pid] = prev[pid].map(s => {
          if (s.id !== stepId || !s.timer_started_at) return s;
          const elapsed = Math.max(0, Math.floor((nowMs - new Date(s.timer_started_at).getTime()) / 1000));
          const acc = (s.timer_seconds ?? 0) + elapsed;
          dbWrite = { timer_started_at: null, timer_seconds: acc };
          return { ...s, timer_started_at: null, timer_seconds: acc };
        });
      }
      return next;
    });
    if (isDemo || !dbWrite) return;
    await supabase.from('todos').update({ timer_started_at: dbWrite.timer_started_at, timer_seconds: dbWrite.timer_seconds }).eq('id', stepId);
  }, [isDemo]);

  // Toggle a task's daily-repeat state. Because a recurring series is one
  // SOURCE (is_recurring=true) plus per-day CLONES (recurrence_source_id set,
  // is_recurring=false), the toggle must operate on the whole chain, not the
  // single row the user right-clicked:
  //  - Enabling only makes sense on a plain task. If the row is already part of
  //    a series (source or clone) it's a no-op, so the same task can never be
  //    set to repeat twice (which used to spawn a duplicate source).
  //  - Disabling from ANY row in the series stops the whole thing: the source
  //    stops recurring and every clone is detached (recurrence_source_id
  //    cleared) so today's instance stays as a normal task and no future clones
  //    are made.
  const toggleRecurring = useCallback(async (id: string, next: boolean) => {
    // Drop any list fetch that started before this click. Otherwise it can
    // land afterwards and paint the row as a normal task again.
    fetchGen.current += 1;
    const target = todos.find(t => t.id === id) ?? pastDayOpenTodos.find(t => t.id === id);
    const plan = planRecurringToggle(target, id, next);
    if (plan.action === 'noop') return; // can only set repeat-daily once

    const mark = (t: Todo): Todo => (t.id === id ? { ...t, is_recurring: true } : t);
    if (plan.action === 'enable') {
      setTodos(prev => prev.map(mark));
      setPastDayOpenTodos(prev => prev.map(mark));
      if (isDemo || !user) return;
      await supabase.from('todos').update({ is_recurring: true }).eq('id', id);
      return;
    }

    // Disable: stop the source recurring and detach every clone in the series.
    const { sourceId } = plan;
    const clearSeries = (t: Todo): Todo =>
      (t.id === sourceId || t.recurrence_source_id === sourceId)
        ? { ...t, is_recurring: false, recurrence_source_id: null }
        : t;
    setTodos(prev => prev.map(clearSeries));
    setPastDayOpenTodos(prev => prev.map(clearSeries));
    if (isDemo || !user) return;
    await supabase.from('todos').update({ is_recurring: false }).eq('id', sourceId);
    await supabase.from('todos').update({ recurrence_source_id: null }).eq('recurrence_source_id', sourceId);
  }, [user, isDemo, todos, pastDayOpenTodos]);


  return { todos, pastDayOpenTodos, loading, stepsByParent, addTodo, updateTodo, deleteTodo, restoreTodo, toggleComplete, addStep, toggleStep, deleteStep, updateStepPlanTime, updateStepTitle, updateStepLink, startStepTimer, stopStepTimer, toggleRecurring, refetch: fetchTodos };
}
