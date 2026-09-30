import { describe, expect, it } from 'vitest';
import { buildPlanBlocks } from '@/components/views/planTimeline/buildPlanBlocks';
import type { Todo } from '@/hooks/useTodos';
import type { Moment } from '@/types';

function makeTodo(partial: Partial<Todo> & { id: string }): Todo {
  return {
    title: 'Deep work',
    date: '2026-09-22',
    time_segment: 'morning',
    progress: 0,
    is_completed: false,
    due_date: null,
    sort_order: 0,
    created_at: '2026-09-22T09:00:00.000Z',
    timer_started_at: null,
    timer_ended_at: null,
    timer_seconds: 0,
    tags: [],
    plan_started_at: null,
    plan_ended_at: null,
    ...partial,
  };
}

describe('buildPlanBlocks — continue-later sessions', () => {
  const dayKey = '2026-09-22';

  it('does not stretch a morning plan block to "now" when resuming after banked work', () => {
    const todo = makeTodo({
      id: 't1',
      progress: 30,
      timer_seconds: 20 * 60,
      // Plan was 09:00–10:00
      plan_started_at: '2026-09-22T09:00:00.000',
      plan_ended_at: '2026-09-22T10:00:00.000',
      // New live session started mid-afternoon
      timer_started_at: '2026-09-22T15:00:00.000',
      timer_ended_at: null,
    });
    const active = new Set(['t1']);
    const blocks = buildPlanBlocks([todo], [], [], active, () => 5 * 60, undefined, dayKey);
    const planShell = blocks.find(b => b.id === 'plan-t1');
    const live = blocks.find(b => b.id === 't1');

    expect(planShell).toBeTruthy();
    expect(planShell!.startMin).toBe(9 * 60);
    expect(planShell!.endMin).toBe(10 * 60);

    expect(live).toBeTruthy();
    expect(live!.startMin).toBe(15 * 60);
    // Live end grows with elapsed (~5 min) — must stay near "now", not span back to 09:00.
    expect(live!.endMin).toBeGreaterThanOrEqual(15 * 60 + 5);
    expect(live!.endMin).toBeLessThan(16 * 60);
    expect(live!.startMin).toBeGreaterThan(planShell!.endMin);
  });

  it('keeps prior focus-session moments visible once work is banked', () => {
    const todo = makeTodo({
      id: 't1',
      progress: 30,
      timer_seconds: 20 * 60,
      timer_ended_at: '2026-09-22T09:40:00.000',
      plan_started_at: '2026-09-22T09:00:00.000',
      plan_ended_at: '2026-09-22T10:00:00.000',
    });
    const moments: Moment[] = [
      {
        id: 'm1',
        text: 'Deep work',
        photos: [],
        date: dayKey,
        createdAt: '2026-09-22T09:20:00.000Z',
        tags: ['focus-session', 'todo-session:t1'],
        timer_started_at: '2026-09-22T09:00:00.000',
        timer_ended_at: '2026-09-22T09:20:00.000',
        timer_seconds: 20 * 60,
      },
    ];
    const blocks = buildPlanBlocks([todo], [], moments, new Set(), undefined, undefined, dayKey);
    expect(blocks.some(b => b.id === 'moment-m1')).toBe(true);
    expect(blocks.some(b => b.id === 't1' || b.id === 'plan-t1')).toBe(true);
  });
});
