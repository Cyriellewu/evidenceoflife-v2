import { describe, expect, it } from 'vitest';
import { format, subDays } from 'date-fns';
import { buildPlanBlocks } from '@/components/views/planTimeline/buildPlanBlocks';
import type { Todo } from '@/hooks/useTodos';

const todayKey = format(new Date(), 'yyyy-MM-dd');
const yesterday = subDays(new Date(), 1);
// A timer that started late yesterday and is still running now.
const startedYesterdayISO = new Date(
  yesterday.getFullYear(),
  yesterday.getMonth(),
  yesterday.getDate(),
  23,
  0,
  0,
).toISOString();

const makeTodo = (over: Partial<Todo>): Todo =>
  ({
    id: 'x',
    title: 'Deep work',
    date: todayKey,
    is_completed: false,
    ...over,
  }) as Todo;

describe('buildPlanBlocks — a running timer from an earlier day surfaces on today', () => {
  it('renders the tail of an unfinished plan that crosses midnight', () => {
    const plannedYesterday = makeTodo({
      id: 'ra',
      date: format(yesterday, 'yyyy-MM-dd'),
      plan_started_at: new Date(
        yesterday.getFullYear(),
        yesterday.getMonth(),
        yesterday.getDate(),
        23,
        0,
      ).toISOString(),
      plan_ended_at: new Date(
        new Date(`${todayKey}T01:00:00`).getTime(),
      ).toISOString(),
      timer_started_at: null,
      timer_ended_at: null,
    });
    const blocks = buildPlanBlocks(
      [],
      [],
      [],
      new Set(),
      () => 0,
      { todos: [plannedYesterday], moments: [] },
      todayKey,
    );
    const tail = blocks.find(block => block.id === 'tail-ra');
    expect(tail).toBeTruthy();
    expect(tail!.startMin).toBe(0);
    expect(tail!.endMin).toBe(60);
    expect(tail!.continuedFromPrevDay).toBe(true);
  });

  it('renders the cross-midnight plan after its unfinished task moves to today', () => {
    const movedToToday = makeTodo({
      id: 'ra-moved',
      date: todayKey,
      plan_started_at: new Date(
        yesterday.getFullYear(),
        yesterday.getMonth(),
        yesterday.getDate(),
        23,
        0,
      ).toISOString(),
      plan_ended_at: new Date(`${todayKey}T01:00:00`).toISOString(),
      timer_started_at: null,
      timer_ended_at: null,
    });
    const blocks = buildPlanBlocks([movedToToday], [], [], new Set(), () => 0, undefined, todayKey);
    const block = blocks.find(item => item.id === 'ra-moved');
    expect(block).toBeTruthy();
    expect(block!.planStartMin).toBe(0);
    expect(block!.planEndMin).toBe(60);
  });

  it('draws the still-running cross-day timer as a strip from midnight to now', () => {
    const todo = makeTodo({
      id: 'run-1',
      date: todayKey, // pulled onto today by pullRunningTimersToToday
      timer_started_at: startedYesterdayISO, // absolute start left on yesterday
      timer_ended_at: null,
    });
    const blocks = buildPlanBlocks(
      [todo],
      [],
      [],
      new Set(['run-1']), // actively running
      () => 3600,
      undefined,
      todayKey,
    );
    const block = blocks.find(b => b.id === 'run-1');
    expect(block).toBeTruthy();
    // Today's slice begins at midnight (0), not at 23:00 of yesterday.
    expect(block!.actualStartMin).toBe(0);
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
    // Ends at (roughly) the current wall-clock minute and grows live.
    expect(block!.actualEndMin!).toBeGreaterThanOrEqual(5);
    expect(block!.actualEndMin!).toBeLessThanOrEqual(Math.max(10, nowMin + 2));
  });

  it('does NOT paint the cross-day running strip on a historical day', () => {
    const todo = makeTodo({
      id: 'run-2',
      date: todayKey,
      timer_started_at: startedYesterdayISO,
      timer_ended_at: null,
    });
    // Render a past day's timeline; the running timer belongs to today only.
    const pastKey = format(subDays(new Date(), 3), 'yyyy-MM-dd');
    const blocks = buildPlanBlocks(
      [todo],
      [],
      [],
      new Set(['run-2']),
      () => 3600,
      undefined,
      pastKey,
    );
    expect(blocks.find(b => b.id === 'run-2')).toBeFalsy();
  });

  it('does NOT surface a stopped (ended) timer from an earlier day on today', () => {
    const todo = makeTodo({
      id: 'done-1',
      date: todayKey,
      timer_started_at: startedYesterdayISO,
      timer_ended_at: new Date(new Date(startedYesterdayISO).getTime() + 30 * 60000).toISOString(),
    });
    const blocks = buildPlanBlocks(
      [todo],
      [],
      [],
      new Set(), // not running
      () => 0,
      undefined,
      todayKey,
    );
    // Anchor day is yesterday and it's not running, so today shows nothing.
    expect(blocks.find(b => b.id === 'done-1')).toBeFalsy();
  });

  it('keeps a completed cross-day timer visible on the day it ended', () => {
    const endedTodayISO = new Date(
      new Date(`${todayKey}T04:00:00`).getTime(),
    ).toISOString();
    const todo = makeTodo({
      id: 'completed-cross-day',
      date: todayKey,
      is_completed: true,
      timer_started_at: startedYesterdayISO,
      timer_ended_at: endedTodayISO,
      timer_seconds: Math.floor(
        (new Date(endedTodayISO).getTime() - new Date(startedYesterdayISO).getTime()) / 1000,
      ),
    });

    const blocks = buildPlanBlocks(
      [todo],
      [],
      [],
      new Set(),
      () => 0,
      undefined,
      todayKey,
    );

    const block = blocks.find(item => item.id === 'completed-cross-day');
    expect(block).toBeTruthy();
    expect(block!.isCompleted).toBe(true);
    expect(block!.actualStartMin).toBe(0);
    expect(block!.actualEndMin).toBe(4 * 60);
  });
});
