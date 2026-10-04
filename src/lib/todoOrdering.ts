import type { Todo } from '@/hooks/useTodos';

export interface TodoOrderUpdate {
  id: string;
  updates: Pick<Todo, 'sort_order'> & Partial<Pick<Todo, 'time_segment'>>;
}

export function compareTodoListOrder(a: Todo, b: Todo): number {
  const orderDiff = (a.sort_order ?? 0) - (b.sort_order ?? 0);
  if (orderDiff !== 0) return orderDiff;

  const createdDiff = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  if (Number.isFinite(createdDiff) && createdDiff !== 0) return createdDiff;
  return a.id.localeCompare(b.id);
}

/**
 * Build the smallest set of safe ordering patches for a list drop.
 *
 * The input may contain both today's rows and carried rows from earlier days.
 * Only `sort_order` and, for a grouped cross-section drop, `time_segment` are
 * ever returned: dates, timers, progress, and completion state stay untouched.
 */
export function buildTodoOrderUpdates(
  visibleTodos: Todo[],
  draggedTodoId: string,
  dropIndex: number,
  targetSegment?: Todo['time_segment'],
): TodoOrderUpdate[] {
  const activeTodos = visibleTodos.filter(todo => !todo.is_completed);
  const draggedTodo = activeTodos.find(todo => todo.id === draggedTodoId);
  if (!draggedTodo) return [];

  const scopedTodos = activeTodos
    .filter(todo => targetSegment === undefined || todo.time_segment === targetSegment)
    .filter(todo => todo.id !== draggedTodoId)
    .sort(compareTodoListOrder);

  const insertAt = Math.max(0, Math.min(dropIndex, scopedTodos.length));
  scopedTodos.splice(insertAt, 0, draggedTodo);

  return scopedTodos.flatMap((todo, index) => {
    const segmentChanged = targetSegment !== undefined && todo.id === draggedTodoId && todo.time_segment !== targetSegment;
    if (!segmentChanged && todo.sort_order === index) return [];

    return [{
      id: todo.id,
      updates: {
        sort_order: index,
        ...(segmentChanged ? { time_segment: targetSegment } : {}),
      },
    }];
  });
}

