import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { useAuth } from '@/hooks/useAuth';
import { fetchSupabaseWithRetry } from '@/lib/supabaseRetry';
import { format } from 'date-fns';
import { Todo } from '@/hooks/useTodos';
import {
  type DueLink,
  parseDueLinks,
  serializeDueLinks,
} from '@/lib/dueLinks';

export type { DueLink } from '@/lib/dueLinks';

const RECAP_DAILY_TAG = '__recap_daily__';

export interface DueStep {
  id: string;
  title: string;
  is_completed: boolean;
  sort_order: number;
  due_date?: string | null;
  /**
   * Best-effort timestamp for "when this step was completed".
   * Sourced from the underlying todo row's `updated_at` and only
   * surfaced when `is_completed` is true. It will reflect the most
   * recent edit, which in practice is dominated by the completion
   * toggle. Acceptable as a "completed on …" hint without requiring
   * a dedicated column / migration.
   */
  completed_at?: string | null;
}

export interface DueWithStats extends Todo {
  totalSessions: number;
  totalSeconds: number;
  maxProgress: number;
  todayChildId?: string;
  links: DueLink[];
  totalCount: number;
  photos: string[];
  steps: DueStep[];
  habit_category: string | null;
  show_in_recap_daily: boolean;
  targetCount: number;
  dailyCounts: Record<string, number>;
  currentStreak: number;
}

type TodoRow = Database['public']['Tables']['todos']['Row'];
type TodoInsert = Database['public']['Tables']['todos']['Insert'];
type TodoUpdate = Database['public']['Tables']['todos']['Update'];

export function useDues() {
  const { user, isDemo } = useAuth();
  const [dues, setDues] = useState<DueWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const prevDuesRef = useRef<DueWithStats[]>([]);

  const fetchDues = useCallback(async () => {
    if (!user || isDemo) {
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const { data: allTodos, error } = await fetchSupabaseWithRetry(
        () => supabase
          .from('todos')
          .select('*')
          .or('date.like._due_%,parent_due_id.not.is.null')
          .order('created_at', { ascending: false }),
        3,
        1500,
      );

      if (error || !allTodos) {
        // On failure, keep previous data instead of clearing
        setDues(prevDuesRef.current);
        return;
      }

      const todos = allTodos as Array<Todo & TodoRow>;
      const masters = todos
        .filter(t => !t.parent_due_id && t.date.startsWith('_due_'))
        .sort((a, b) => {
          const orderDiff = (a.sort_order ?? 0) - (b.sort_order ?? 0);
          if (orderDiff !== 0) return orderDiff;
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });
      const children = todos.filter(t => !!t.parent_due_id);

      const today = format(new Date(), 'yyyy-MM-dd');

      const duesWithStats: DueWithStats[] = masters.map(master => {
        const myChildren = children.filter(c => c.parent_due_id === master.id);
        // Separate steps from daily habit entries
        const stepChildren = myChildren.filter(c => c.date === '_step_');
        const nonStepChildren = myChildren.filter(c => c.date !== '_step_');
        const completedChildren = nonStepChildren.filter(c => c.is_completed);
        const totalSessions = nonStepChildren.filter(c => c.timer_seconds != null && c.timer_seconds > 0).length;
        const totalSeconds = nonStepChildren.reduce((sum, c) => sum + (c.timer_seconds || 0), 0) + (master.timer_seconds || 0);

        // Build steps array.
        // `completed_at` falls back to `updated_at` on the underlying row
        // (which the `*` select pulls in even though `Todo` doesn't list
        // it). We only emit it when the step is currently completed so
        // the UI doesn't show a misleading "completed on …" for an open
        // step that was merely renamed.
        const steps: DueStep[] = stepChildren
          .sort((a, b) => a.sort_order - b.sort_order)
          .map(s => ({
            id: s.id,
            title: s.title,
            is_completed: s.is_completed,
            sort_order: s.sort_order,
            due_date: s.due_date,
            completed_at: s.is_completed ? (s.updated_at ?? null) : null,
          }));

        // Progress: if steps exist, derive from steps completion
        const stepsCompleted = steps.filter(s => s.is_completed).length;
        const stepsProgress = steps.length > 0 ? Math.round((stepsCompleted / steps.length) * 100) : 0;

        const allProgress = [master.progress, ...nonStepChildren.map(c => c.progress)];
        const nonStepMaxProgress = Math.max(...allProgress);
        const maxProgress = steps.length > 0 ? stepsProgress : nonStepMaxProgress;
        const todayChild = nonStepChildren.find(c => c.date === today);
        const totalCount = completedChildren.length;
        const dailyCounts = completedChildren.reduce<Record<string, number>>((acc, child) => {
          acc[child.date] = (acc[child.date] || 0) + 1;
          return acc;
        }, {});
        const showInRecapDaily = Boolean(master.show_in_recap_daily) || (master.tags || []).includes(RECAP_DAILY_TAG);
        const targetCount = master.habit_category !== null ? Math.max(1, master.progress || 1) : 0;
        let currentStreak = 0;
        if (master.habit_category !== null) {
          const cursor = new Date();
          while (true) {
            const key = format(cursor, 'yyyy-MM-dd');
            if ((dailyCounts[key] || 0) >= targetCount) {
              currentStreak += 1;
              cursor.setDate(cursor.getDate() - 1);
            } else {
              break;
            }
          }
        }

        const isHabit = master.habit_category !== null;
        const hasDeadline = !!master.due_date;
        // Finishing the user-defined steps does NOT mean the deadline is done —
        // they may simply not have defined the next step yet. So step-based
        // progress only drives the visual bar; auto-completion is reserved for
        // the explicit, step-free path (manual 100% progress / child completion).
        const shouldBeCompleted = !isHabit && hasDeadline && steps.length === 0 && nonStepMaxProgress >= 100;
        const isCompleted = isHabit ? false : Boolean(master.is_completed || shouldBeCompleted);

        return {
          ...master,
          is_completed: isCompleted,
          totalSessions: totalSessions + (master.timer_seconds && master.timer_seconds > 0 ? 1 : 0),
          totalSeconds,
          maxProgress,
          todayChildId: todayChild?.id,
          links: parseDueLinks(master.links),
          totalCount,
          photos: master.photos || [],
          steps,
          habit_category: master.habit_category || null,
          show_in_recap_daily: showInRecapDaily,
          targetCount,
          dailyCounts,
          currentStreak,
        };
      });

      // Persist auto-completion to DB for any dues that should be completed but aren't yet.
      // Step-based dues are excluded: completing their steps must not silently
      // finish (and lock) the deadline — see shouldBeCompleted above.
      const toAutoComplete = duesWithStats.filter(
        d => !!d.due_date && d.steps.length === 0 && d.maxProgress >= 100 && !masters.find(m => m.id === d.id)?.is_completed
      );
      // Auto-fix: uncomplete habits that were incorrectly marked as completed
      const toAutoUncomplete = masters.filter(m => m.habit_category !== null && m.is_completed);

      const dbOps = [
        ...toAutoComplete.map(d => supabase.from('todos').update({ is_completed: true }).eq('id', d.id)),
        ...toAutoUncomplete.map(m => supabase.from('todos').update({ is_completed: false }).eq('id', m.id)),
      ];
      if (dbOps.length > 0) await Promise.all(dbOps);

      prevDuesRef.current = duesWithStats;
      setDues(duesWithStats);
    } catch (err) {
      console.error('Failed to fetch dues (exception):', err);
      setDues(prevDuesRef.current);
    } finally {
      setLoading(false);
    }
  }, [user, isDemo]);

  useEffect(() => {
    fetchDues();
  }, [fetchDues]);

  const addDue = useCallback(async (title: string, dueDate?: string, habitCategory?: string, showInRecapDaily = false): Promise<string | null> => {
    if (!user) return null;
    const dateVal = dueDate ? '_due_' + dueDate : '_due_none';
    const { data, error } = await supabase
      .from('todos')
      .insert({
        user_id: user.id,
        title,
        date: dateVal,
        time_segment: 'anytime',
        due_date: dueDate || null,
        sort_order: 0,
        ...(habitCategory ? { progress: 1 } : {}),
        ...(habitCategory ? { habit_category: habitCategory } : {}),
        ...(habitCategory && showInRecapDaily ? { tags: [RECAP_DAILY_TAG] } : {}),
      })
      .select()
      .single();
    if (!error && data) {
      await fetchDues();
      return (data as Pick<TodoRow, 'id'>).id;
    }
    return null;
  }, [user, fetchDues]);

  const addToToday = useCallback(async (masterId: string, stepTitle?: string) => {
    if (!user) return;
    const master = dues.find(d => d.id === masterId);
    if (!master) return;

    const today = format(new Date(), 'yyyy-MM-dd');
    const title = stepTitle ? `${stepTitle}` : master.title;
    const subtitle = stepTitle ? master.title : undefined;

    const { error } = await supabase
      .from('todos')
      .insert({
        user_id: user.id,
        title: subtitle ? `${title} · ${subtitle}` : title,
        date: today,
        time_segment: 'anytime',
        due_date: master.due_date,
        sort_order: 0,
        parent_due_id: masterId,
        progress: master.progress > 0 ? master.progress : 0,
      });

    if (!error) {
      await fetchDues();
    }
  }, [user, dues, fetchDues]);

  const deleteDue = useCallback(async (id: string) => {
    await supabase.from('todos').delete().eq('parent_due_id', id);
    const { error } = await supabase.from('todos').delete().eq('id', id);
    if (!error) {
      setDues(prev => prev.filter(t => t.id !== id));
    }
  }, []);

  const updateDue = useCallback(async (id: string, updates: { title?: string; due_date?: string | null; links?: DueLink[]; is_completed?: boolean; photos?: string[]; habit_category?: string | null; show_in_recap_daily?: boolean; sort_order?: number; progress?: number }) => {
    const existing = dues.find(d => d.id === id);
    const updatePayload: TodoUpdate = {};
    const localPatch: Partial<DueWithStats> = {};
    if (updates.title) updatePayload.title = updates.title;
    if (updates.title) localPatch.title = updates.title;
    if (updates.due_date !== undefined) {
      if (updates.due_date) {
        updatePayload.due_date = updates.due_date;
        updatePayload.date = '_due_' + updates.due_date;
        localPatch.due_date = updates.due_date;
        localPatch.date = '_due_' + updates.due_date;
      } else {
        updatePayload.due_date = null;
        updatePayload.date = '_due_none';
        localPatch.due_date = null;
        localPatch.date = '_due_none';
      }
    }
    if (updates.links !== undefined) {
      updatePayload.links = serializeDueLinks(updates.links);
      localPatch.links = updates.links;
    }
    if (updates.is_completed !== undefined) {
      updatePayload.is_completed = updates.is_completed;
      localPatch.is_completed = updates.is_completed;
    }
    if (updates.photos !== undefined) {
      updatePayload.photos = updates.photos;
      localPatch.photos = updates.photos;
    }
    if (updates.habit_category !== undefined) {
      updatePayload.habit_category = updates.habit_category;
      localPatch.habit_category = updates.habit_category;
    }
    if (updates.show_in_recap_daily !== undefined) {
      const currentTags = existing?.tags || [];
      const nextTags = updates.show_in_recap_daily
        ? Array.from(new Set([...currentTags, RECAP_DAILY_TAG]))
        : currentTags.filter(tag => tag !== RECAP_DAILY_TAG);
      updatePayload.tags = nextTags;
      localPatch.tags = nextTags;
      localPatch.show_in_recap_daily = updates.show_in_recap_daily;
    }
    if (updates.sort_order !== undefined) {
      updatePayload.sort_order = updates.sort_order;
      localPatch.sort_order = updates.sort_order;
    }
    if (updates.progress !== undefined) {
      updatePayload.progress = updates.progress;
      localPatch.progress = updates.progress;
    }
    const { error } = await supabase
      .from('todos')
      .update(updatePayload)
      .eq('id', id);
    if (!error) {
      setDues(prev => prev.map(d => d.id === id ? { ...d, ...localPatch } : d));
    }
  }, [dues]);

  const addStep = useCallback(async (masterId: string, title: string) => {
    if (!user) return;
    const master = dues.find(d => d.id === masterId);
    if (!master) return;
    const nextOrder = master.steps.length;
    const { error } = await supabase.from('todos').insert({
      user_id: user.id,
      title,
      date: '_step_',
      time_segment: 'anytime',
      sort_order: nextOrder,
      parent_due_id: masterId,
      due_date: master.due_date,
    });
    if (!error) await fetchDues();
  }, [user, dues, fetchDues]);

  const toggleStep = useCallback(async (stepId: string, completed: boolean) => {
    const { error } = await supabase.from('todos').update({ is_completed: completed }).eq('id', stepId);
    if (!error) await fetchDues();
  }, [fetchDues]);

  const deleteStep = useCallback(async (stepId: string) => {
    const { error } = await supabase.from('todos').delete().eq('id', stepId);
    if (!error) await fetchDues();
  }, [fetchDues]);

  const reorderDues = useCallback(async (orderedIds: string[]) => {
    if (!orderedIds.length) return;

    const previous = prevDuesRef.current;
    const orderMap = new Map(orderedIds.map((id, index) => [id, index]));
    const nextDues = previous
      .map(due => orderMap.has(due.id) ? { ...due, sort_order: orderMap.get(due.id)! } : due)
      .sort((a, b) => {
        const orderDiff = (a.sort_order ?? 0) - (b.sort_order ?? 0);
        if (orderDiff !== 0) return orderDiff;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });

    prevDuesRef.current = nextDues;
    setDues(nextDues);

    const updates = orderedIds.map((id, index) =>
      supabase.from('todos').update({ sort_order: index }).eq('id', id)
    );
    const results = await Promise.all(updates);
    if (results.some(result => result.error)) {
      await fetchDues();
    }
  }, [fetchDues]);

  const incrementHabitCount = useCallback(async (masterId: string, dateStr?: string) => {
    if (!user) return;
    const master = dues.find(d => d.id === masterId && d.habit_category !== null);
    if (!master) return;

    const today = dateStr || format(new Date(), 'yyyy-MM-dd');
    const { error } = await supabase.from('todos').insert({
      user_id: user.id,
      title: master.title,
      date: today,
      time_segment: 'anytime',
      due_date: null,
      parent_due_id: masterId,
      progress: 100,
      is_completed: true,
    });

    if (!error) await fetchDues();
  }, [dues, fetchDues, user]);

  const setHabitCount = useCallback(async (masterId: string, nextCount: number, dateStr?: string) => {
    if (!user) return;
    const master = dues.find(d => d.id === masterId && d.habit_category !== null);
    if (!master) return;

    const safeCount = Math.max(0, Math.floor(nextCount));
    const targetDate = dateStr || format(new Date(), 'yyyy-MM-dd');
    const { data: children, error } = await supabase
      .from('todos')
      .select('id, created_at, date, is_completed')
      .eq('parent_due_id', masterId)
      .neq('date', '_step_')
      .order('created_at', { ascending: false });
    if (error || !children) return;

    const completedChildren = (children as Array<Pick<TodoRow, 'id' | 'date' | 'is_completed'>>).filter(child => child.is_completed && child.date === targetDate);
    const diff = safeCount - completedChildren.length;
    if (diff === 0) return;

    if (diff > 0) {
      const inserts = Array.from({ length: diff }, () => ({
        user_id: user.id,
        title: master.title,
        date: targetDate,
        time_segment: 'anytime',
        due_date: null,
        parent_due_id: masterId,
        progress: 100,
        is_completed: true,
      })) as TodoInsert[];
      const { error: insertError } = await supabase.from('todos').insert(inserts);
      if (!insertError) await fetchDues();
      return;
    }

    const toDelete = completedChildren.slice(0, Math.abs(diff)).map(child => child.id);
    if (toDelete.length === 0) return;
    const { error: deleteError } = await supabase.from('todos').delete().in('id', toDelete);
    if (!deleteError) await fetchDues();
  }, [dues, fetchDues, user]);

  const setHabitTarget = useCallback(async (masterId: string, nextTarget: number) => {
    const safeTarget = Math.max(1, Math.floor(nextTarget));
    const { error } = await supabase.from('todos').update({ progress: safeTarget }).eq('id', masterId);
    if (!error) await fetchDues();
  }, [fetchDues]);

  return { dues, loading, addDue, addToToday, deleteDue, updateDue, addStep, toggleStep, deleteStep, reorderDues, incrementHabitCount, setHabitCount, setHabitTarget, refetch: fetchDues };
}
