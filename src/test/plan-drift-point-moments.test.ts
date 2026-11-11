import { describe, it, expect } from 'vitest';
import { format } from 'date-fns';
import { computeDrift } from '@/components/today/PlanDrift';
import type { Moment } from '@/types';

describe('computeDrift focus total', () => {
  const today = format(new Date(), 'yyyy-MM-dd');
  const at = (h: number, m = 0) => {
    const d = new Date(); d.setHours(h, m, 0, 0); return d.toISOString();
  };
  const moment = (over: Partial<Moment>): Moment =>
    ({ id: Math.random().toString(36), date: today, text: 'Walk with a friend', photos: [], createdAt: at(0, 1), ...over }) as Moment;

  it('does not count a moment pinned to a time (no end) as running focus', () => {
    const r = computeDrift([], [], [moment({ timer_started_at: at(0, 5), timer_ended_at: null })], today);
    expect(r.totalActiveMin).toBe(0);
  });

  it('still counts a timed moment with start and end', () => {
    const r = computeDrift([], [], [moment({ timer_started_at: at(0, 10), timer_ended_at: at(0, 40), timer_seconds: 1800 })], today);
    expect(r.totalActiveMin).toBe(30);
  });
});
