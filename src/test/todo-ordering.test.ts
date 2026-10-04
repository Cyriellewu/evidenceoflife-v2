import { describe, expect, it } from 'vitest';
import type { Todo } from '@/hooks/useTodos';
import { buildTodoOrderUpdates, compareTodoListOrder } from '@/lib/todoOrdering';

function makeTodo(overrides: Partial<Todo>): Todo {
  return {
    id: 'todo',
    title: 'Task',
    date: '2026-10-04',
    time_segment: 'anytime',
    progress: 0,
    is_completed: false,
    due_date: null,
    sort_order: 0,
    created_at: '2026-10-04T12:00:00.000Z',
    timer_started_at: null,
    timer_ended_at: null,
    timer_seconds: 0,
    tags: [],
    plan_started_at: null,
    plan_ended_at: null,
    is_recurring: false,
    photos: [],
    location_name: null,
    location_lat: null,
    location_lng: null,
    location_category: null,
    ...overrides,
  };
}

describe('todo list ordering', () => {
  it('uses sort_order instead of creation time for rendered position', () => {
    const olderFirst = makeTodo({ id: 'older', sort_order: 0, created_at: '2026-10-01T12:00:00.000Z' });
    const newerSecond = makeTodo({ id: 'newer', sort_order: 1, created_at: '2026-10-04T12:00:00.000Z' });

    expect([newerSecond, olderFirst].sort(compareTodoListOrder).map(todo => todo.id)).toEqual(['older', 'newer']);
  });

  it('reorders a carried task without changing its original date', () => {
    const first = makeTodo({ id: 'first', sort_order: 0 });
    const second = makeTodo({ id: 'second', sort_order: 1 });
    const carried = makeTodo({ id: 'carried', date: '2026-10-02', sort_order: 2 });

    const updates = buildTodoOrderUpdates([first, second, carried], 'carried', 0, 'anytime');

    expect(updates).toEqual([
      { id: 'carried', updates: { sort_order: 0 } },
      { id: 'first', updates: { sort_order: 1 } },
      { id: 'second', updates: { sort_order: 2 } },
    ]);
    expect(updates.every(update => !('date' in update.updates))).toBe(true);
  });

  it('moves a carried task between groups using only segment and order fields', () => {
    const morning = makeTodo({ id: 'morning', time_segment: 'morning', sort_order: 0 });
    const carried = makeTodo({ id: 'carried', date: '2026-10-02', time_segment: 'evening', sort_order: 4 });

    expect(buildTodoOrderUpdates([morning, carried], 'carried', 0, 'morning')).toEqual([
      { id: 'carried', updates: { sort_order: 0, time_segment: 'morning' } },
      { id: 'morning', updates: { sort_order: 1 } },
    ]);
  });

  it('supports flat-list reordering without changing task segments', () => {
    const morning = makeTodo({ id: 'morning', time_segment: 'morning', sort_order: 0 });
    const evening = makeTodo({ id: 'evening', time_segment: 'evening', sort_order: 1 });

    expect(buildTodoOrderUpdates([morning, evening], 'evening', 0)).toEqual([
      { id: 'evening', updates: { sort_order: 0 } },
      { id: 'morning', updates: { sort_order: 1 } },
    ]);
  });
});

