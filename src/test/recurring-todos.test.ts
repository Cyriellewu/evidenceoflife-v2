import { describe, expect, it } from 'vitest';
import {
  pickRecurringSourcesNeedingClone,
  buildClonedTodoInsert,
  buildClonedStepInserts,
  computeConsecutiveCompletedDays,
  planRecurringToggle,
  isDailyRepeatTodo,
} from '@/lib/recurringTodos';

describe('pickRecurringSourcesNeedingClone', () => {
  it('returns empty when every source already has a clone today', () => {
    const sources = [
      { id: 's1', date: '2026-07-01' },
      { id: 's2', date: '2026-07-01' },
    ];
    const existing = [
      { id: 'c1', recurrence_source_id: 's1' },
      { id: 'c2', recurrence_source_id: 's2' },
    ];
    expect(pickRecurringSourcesNeedingClone(sources, existing, '2026-07-10')).toEqual([]);
  });

  it('returns source ids that have no clone today', () => {
    const sources = [
      { id: 's1', date: '2026-07-01' },
      { id: 's2', date: '2026-07-01' },
      { id: 's3', date: '2026-07-05' },
    ];
    const existing = [{ id: 'c1', recurrence_source_id: 's2' }];
    expect(pickRecurringSourcesNeedingClone(sources, existing, '2026-07-10').sort()).toEqual([
      's1',
      's3',
    ]);
  });

  it('skips the source itself on its own creation day (source is its first instance)', () => {
    const sources = [{ id: 's1', date: '2026-07-10' }];
    expect(pickRecurringSourcesNeedingClone(sources, [], '2026-07-10')).toEqual([]);
  });

  it('ignores unrelated rows in existing (recurrence_source_id null)', () => {
    const sources = [{ id: 's1', date: '2026-07-01' }];
    const existing = [
      { id: 'random', recurrence_source_id: null },
      { id: 'other', recurrence_source_id: 'sX' },
    ];
    expect(pickRecurringSourcesNeedingClone(sources, existing, '2026-07-10')).toEqual(['s1']);
  });

  it('skips a source whose title already exists today (manual re-add dedup)', () => {
    const sources = [{ id: 's1', date: '2026-07-01', title: 'Apply for jobs' }];
    // User forgot it was recurring and manually re-added the same task today.
    const existing = [{ id: 'manual', recurrence_source_id: null, title: '  apply for JOBS ' }];
    expect(pickRecurringSourcesNeedingClone(sources, existing, '2026-07-10')).toEqual([]);
  });

  it('still clones when no same-title row exists today', () => {
    const sources = [{ id: 's1', date: '2026-07-01', title: 'Apply for jobs' }];
    const existing = [{ id: 'manual', recurrence_source_id: null, title: 'Water plants' }];
    expect(pickRecurringSourcesNeedingClone(sources, existing, '2026-07-10')).toEqual(['s1']);
  });

  it('keeps only one source when duplicate recurring sources share the same title', () => {
    const sources = [
      { id: 's1', date: '2026-07-01', title: 'Drink water' },
      { id: 's2', date: '2026-07-02', title: '  drink WATER  ' },
      { id: 's3', date: '2026-07-03', title: 'Read 10 pages' },
    ];
    const existing: Array<{ id: string; recurrence_source_id: string | null; title?: string }> = [];
    expect(pickRecurringSourcesNeedingClone(sources, existing, '2026-07-10')).toEqual(['s1', 's3']);
  });
});

describe('buildClonedTodoInsert', () => {
  it('carries title + time_segment forward and links back via recurrence_source_id', () => {
    const src = {
      id: 'src-1',
      user_id: 'u1',
      title: 'Morning stretch',
      time_segment: 'morning' as const,
    };
    const insert = buildClonedTodoInsert(src, '2026-07-10', 3);
    expect(insert).toEqual({
      user_id: 'u1',
      title: 'Morning stretch',
      date: '2026-07-10',
      time_segment: 'morning',
      sort_order: 3,
      recurrence_source_id: 'src-1',
      is_recurring: false,
    });
  });

  it('does not carry timer, plan, progress fields (clone is a blank slate)', () => {
    const src = { id: 'x', user_id: 'u', title: 't', time_segment: 'anytime' as const };
    const insert = buildClonedTodoInsert(src, '2026-07-10', 0);
    expect(insert).not.toHaveProperty('timer_started_at');
    expect(insert).not.toHaveProperty('plan_started_at');
    expect(insert).not.toHaveProperty('progress');
  });
});

describe('buildClonedStepInserts', () => {
  it('produces one insert per step with parent_due_id pointing at the new parent', () => {
    const steps = [
      { title: 'warmup', sort_order: 0 },
      { title: 'main', sort_order: 1 },
      { title: 'cooldown', sort_order: 2 },
    ];
    const inserts = buildClonedStepInserts(steps, 'new-parent-id', 'u1');
    expect(inserts).toHaveLength(3);
    for (const ins of inserts) {
      expect(ins.parent_due_id).toBe('new-parent-id');
      expect(ins.user_id).toBe('u1');
      expect(ins.date).toBe('_step_');
      expect(ins.time_segment).toBe('anytime');
    }
    expect(inserts.map(i => i.title)).toEqual(['warmup', 'main', 'cooldown']);
    expect(inserts.map(i => i.sort_order)).toEqual([0, 1, 2]);
  });

  it('falls back to array index when a step has no sort_order', () => {
    const steps = [
      { title: 'a', sort_order: undefined as unknown as number },
      { title: 'b', sort_order: undefined as unknown as number },
    ];
    const inserts = buildClonedStepInserts(steps, 'p', 'u');
    expect(inserts.map(i => i.sort_order)).toEqual([0, 1]);
  });
});

describe('computeConsecutiveCompletedDays', () => {
  const mk = (date: string, is_completed: boolean) => ({ date, is_completed });

  it('returns 0 for empty history', () => {
    expect(computeConsecutiveCompletedDays([], '2026-07-10')).toBe(0);
  });

  it('counts a full 7-day streak ending today', () => {
    const instances = [
      mk('2026-07-04', true),
      mk('2026-07-05', true),
      mk('2026-07-06', true),
      mk('2026-07-07', true),
      mk('2026-07-08', true),
      mk('2026-07-09', true),
      mk('2026-07-10', true),
    ];
    expect(computeConsecutiveCompletedDays(instances, '2026-07-10')).toBe(7);
  });

  it('breaks the streak on a missed day', () => {
    const instances = [
      mk('2026-07-05', true),
      mk('2026-07-06', true),
      // 2026-07-07 missing
      mk('2026-07-08', true),
      mk('2026-07-09', true),
      mk('2026-07-10', true),
    ];
    expect(computeConsecutiveCompletedDays(instances, '2026-07-10')).toBe(3);
  });

  it('breaks the streak on an uncompleted day', () => {
    const instances = [
      mk('2026-07-08', true),
      mk('2026-07-09', false),
      mk('2026-07-10', true),
    ];
    expect(computeConsecutiveCompletedDays(instances, '2026-07-10')).toBe(1);
  });

  it("starts from yesterday when today's instance is not yet completed", () => {
    const instances = [
      mk('2026-07-08', true),
      mk('2026-07-09', true),
      mk('2026-07-10', false),
    ];
    expect(computeConsecutiveCompletedDays(instances, '2026-07-10')).toBe(2);
  });

  it('starts from yesterday when today has no instance at all', () => {
    const instances = [mk('2026-07-08', true), mk('2026-07-09', true)];
    expect(computeConsecutiveCompletedDays(instances, '2026-07-10')).toBe(2);
  });

  it('collapses two rows on the same date via OR (any completed wins)', () => {
    const instances = [
      mk('2026-07-10', false),
      mk('2026-07-10', true),
    ];
    expect(computeConsecutiveCompletedDays(instances, '2026-07-10')).toBe(1);
  });
});

describe('isDailyRepeatTodo', () => {
  it('treats sources and clones as daily-repeat rows', () => {
    expect(isDailyRepeatTodo({ is_recurring: true })).toBe(true);
    expect(isDailyRepeatTodo({ recurrence_source_id: 's1' })).toBe(true);
    expect(isDailyRepeatTodo({ is_recurring: false })).toBe(false);
    expect(isDailyRepeatTodo(undefined)).toBe(false);
  });
});

describe('planRecurringToggle', () => {
  it('enables repeat-daily on a plain task', () => {
    const target = { id: 't1' };
    expect(planRecurringToggle(target, 't1', true)).toEqual({ action: 'enable', id: 't1' });
  });

  it('is a no-op when enabling an existing source (can only set once)', () => {
    const source = { id: 's1', is_recurring: true };
    expect(planRecurringToggle(source, 's1', true)).toEqual({ action: 'noop' });
  });

  it('is a no-op when enabling a clone (already in the series)', () => {
    const clone = { id: 'c1', is_recurring: false, recurrence_source_id: 's1' };
    expect(planRecurringToggle(clone, 'c1', true)).toEqual({ action: 'noop' });
  });

  it('disables via the row itself when acting on the source', () => {
    const source = { id: 's1', is_recurring: true };
    expect(planRecurringToggle(source, 's1', false)).toEqual({ action: 'disable', sourceId: 's1' });
  });

  it('disables the whole chain via the source when acting on a clone', () => {
    const clone = { id: 'c1', is_recurring: false, recurrence_source_id: 's1' };
    expect(planRecurringToggle(clone, 'c1', false)).toEqual({ action: 'disable', sourceId: 's1' });
  });

  it('falls back to the acted id when the target row is unknown', () => {
    expect(planRecurringToggle(undefined, 'x', true)).toEqual({ action: 'enable', id: 'x' });
    expect(planRecurringToggle(undefined, 'x', false)).toEqual({ action: 'disable', sourceId: 'x' });
  });
});
