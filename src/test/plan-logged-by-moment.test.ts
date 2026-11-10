import { describe, it, expect } from 'vitest';
import { buildPlanBlocks, isPlanLoggedByMoment } from '@/components/views/planTimeline/buildPlanBlocks';
import type { Todo } from '@/hooks/useTodos';
import type { Moment } from '@/types';

const day = '2026-03-02';
const at = (hm: string) => new Date(`${day}T${hm}:00`).toISOString();
const moment = (text: string, hm: string): Moment =>
  ({ id: `m-${hm}`, date: day, text, photos: [], createdAt: at(hm) }) as Moment;
const plannedTodo = (title: string): Todo =>
  ({
    id: 't1', title, date: day, is_completed: false,
    plan_started_at: at('18:00'), plan_ended_at: at('19:30'),
  }) as unknown as Todo;

describe('isPlanLoggedByMoment', () => {
  it('matches a moment inside the window that names the task', () => {
    expect(isPlanLoggedByMoment('🏃 Gym', 18 * 60, 19 * 60 + 30, [moment('Gym done, felt great', '18:40')], day)).toBe(true);
  });
  it('ignores moments outside the window or about something else', () => {
    expect(isPlanLoggedByMoment('Gym', 18 * 60, 19 * 60 + 30, [moment('Gym done', '09:00')], day)).toBe(false);
    expect(isPlanLoggedByMoment('Gym', 18 * 60, 19 * 60 + 30, [moment('Dinner with friends', '18:40')], day)).toBe(false);
  });
  it('ignores one-letter titles', () => {
    expect(isPlanLoggedByMoment('a', 18 * 60, 19 * 60 + 30, [moment('a b c', '18:40')], day)).toBe(false);
  });
});

describe('buildPlanBlocks', () => {
  it('shows a planned, untimed task as done when a moment logged it', () => {
    const blocks = buildPlanBlocks([plannedTodo('Gym')], [], [moment('Gym session', '18:40')], undefined, undefined, undefined, day);
    expect(blocks.find(b => b.id === 't1')?.isCompleted).toBe(true);
  });
  it('leaves it planned without such a moment', () => {
    const blocks = buildPlanBlocks([plannedTodo('Gym')], [], [], undefined, undefined, undefined, day);
    expect(blocks.find(b => b.id === 't1')?.isCompleted).toBeFalsy();
  });
});
