import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Todo } from '@/hooks/useTodos';

/** Read-only fetch of a single day's todos, with NO rollover side effects.
 *  Used to surface the previous day's cross-midnight sessions as early-morning
 *  "tail" blocks on the current day's timeline. Returns [] in demo / signed-out. */
export function usePrevDayTodos(dateStr: string | undefined): {
  todos: Todo[];
  /** Mirror a write made elsewhere so a stopped timer can't live on in this copy. */
  patch: (id: string, updates: Partial<Todo>) => void;
} {
  const { user, isDemo, authReady } = useAuth();
  const [todos, setTodos] = useState<Todo[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (!authReady) return;
    if (!user || isDemo || !dateStr) {
      setTodos([]);
      return;
    }
    (async () => {
      const { data, error } = await supabase
        .from('todos')
        // eslint-disable-next-line no-restricted-syntax -- prod schema lags migrations (todos/imported_events columns differ from types.ts); an explicit list would 400. See schema-drift follow-up.
        .select('*')
        .eq('date', dateStr)
        .order('sort_order', { ascending: true });
      if (cancelled) return;
      if (!error && data) {
        const filtered = data.filter(t => !(t.due_date && !t.parent_due_id));
        setTodos(filtered as Todo[]);
      }
    })();
    return () => { cancelled = true; };
  }, [user, isDemo, authReady, dateStr]);

  const patch = useCallback((id: string, updates: Partial<Todo>) => {
    setTodos(prev => (prev.some(t => t.id === id) ? prev.map(t => (t.id === id ? { ...t, ...updates } : t)) : prev));
  }, []);

  return { todos, patch };
}
