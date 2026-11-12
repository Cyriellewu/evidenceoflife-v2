/**
 * Regression tests for the focus-timer rules in src/lib/focusTimer.ts.
 * Each block names the production bug it guards against.
 */
import { describe, it, expect } from 'vitest';
import {
  AUTO_STOP_TIMER_HOURS,
  LONG_BREAK_MINUTES,
  buildSessionMomentDraft,
  findDuplicateSessionMoment,
  isMomentTimerRunning,
  isTimerRunning,
  patchTodoList,
  planAutoStop,
  sessionElapsedSec,
  totalElapsedSec,
} from '@/lib/focusTimer';
import { buildPlanBlocks } from '@/components/views/planTimeline/buildPlanBlocks';
import type { Todo } from '@/hooks/useTodos';

const H = 3600_000;
const now = new Date(2026, 2, 3, 12, 0).getTime();
const iso = (ms: number) => new Date(ms).toISOString();

describe('session elapsed', () => {
  it('excludes finished and ongoing pauses and is never negative', () => {
    const start = iso(now - 2 * H);
    expect(sessionElapsedSec(start, { pausedAt: null, totalPausedMs: 0 }, now)).toBe(7200);
    expect(sessionElapsedSec(start, { pausedAt: now - 0.5 * H, totalPausedMs: 0.5 * H }, now)).toBe(3600);
    expect(sessionElapsedSec(iso(now + H), undefined, now)).toBe(0);
  });

  it('adds banked seconds only while running', () => {
    expect(totalElapsedSec({ timer_started_at: iso(now - 60_000), timer_seconds: 100 }, undefined, now)).toBe(160);
    expect(totalElapsedSec({ timer_started_at: null, timer_seconds: 100 }, undefined, now)).toBe(100);
  });
});

describe('auto-stop (timer left on: the 26h pill)', () => {
  it('leaves a timer under the limit alone', () => {
    expect(planAutoStop({ timer_started_at: iso(now - 7.9 * H) }, undefined, now)).toBeNull();
    expect(planAutoStop({ timer_started_at: iso(now - 9 * H), timer_ended_at: iso(now) }, undefined, now)).toBeNull();
  });

  it('caps an unpaused runaway at 8h of work ending at start + 8h', () => {
    const start = now - 26 * H;
    const plan = planAutoStop({ timer_started_at: iso(start), timer_seconds: 600 }, undefined, now)!;
    expect(plan.sessionSec).toBe(AUTO_STOP_TIMER_HOURS * 3600);
    expect(plan.endISO).toBe(iso(start + 8 * H));
    expect(plan.totalSec).toBe(600 + 8 * 3600);
  });

  it('ends a timer paused overnight at the pause, with only the worked minutes', () => {
    const start = now - 10 * H;
    const pausedAt = start + 20 * 60_000;
    const plan = planAutoStop({ timer_started_at: iso(start) }, { pausedAt, totalPausedMs: 0 }, now)!;
    expect(plan.sessionSec).toBe(20 * 60);
    expect(plan.endISO).toBe(iso(pausedAt)); // not start + 8h → no phantom focus span
  });

  it('adds finished pauses back into the span but not into worked time', () => {
    const start = now - 12 * H;
    const plan = planAutoStop({ timer_started_at: iso(start) }, { pausedAt: null, totalPausedMs: H }, now)!;
    expect(plan.sessionSec).toBe(8 * 3600);
    expect(plan.endISO).toBe(iso(start + 9 * H));
  });
});

describe('long break ends the session (191:13 "resting")', () => {
  const M = 60_000;
  it('keeps a short break running', () => {
    const start = now - H;
    expect(planAutoStop({ timer_started_at: iso(start) }, { pausedAt: now - (LONG_BREAK_MINUTES - 1) * M, totalPausedMs: 0 }, now)).toBeNull();
  });

  it('ends a long break where it began, with only the worked minutes', () => {
    const start = now - 4 * H;
    const pausedAt = start + 34 * M;
    const plan = planAutoStop({ timer_started_at: iso(start), timer_seconds: 300 }, { pausedAt, totalPausedMs: 0 }, now)!;
    expect(plan.reason).toBe('long-break');
    expect(plan.endISO).toBe(iso(pausedAt));
    expect(plan.sessionSec).toBe(34 * 60);
    expect(plan.totalSec).toBe(300 + 34 * 60);
  });

  it('subtracts earlier, finished breaks from the worked time', () => {
    const start = now - 2 * H;
    const pausedAt = start + 50 * M;
    const plan = planAutoStop({ timer_started_at: iso(start) }, { pausedAt, totalPausedMs: 10 * M }, now)!;
    expect(plan.sessionSec).toBe(40 * 60);
    expect(plan.endISO).toBe(iso(pausedAt));
  });

  it('labels an 8h runaway as forgotten', () => {
    expect(planAutoStop({ timer_started_at: iso(now - 9 * H) }, undefined, now)!.reason).toBe('forgotten');
  });
});

describe('one session = one moment (the duplicate "Tech screen")', () => {
  const saved = [{ id: 'm1', tags: ['focus-session', 'todo-session:t1'], timer_started_at: '2026-03-02T01:42:27.653Z' }];

  it('finds the already-saved session for the same task and start', () => {
    const draft = { tags: ['focus-session', 'todo-session:t1', 'work'], timer_started_at: '2026-03-02T01:42:27.653+00:00' };
    expect(findDuplicateSessionMoment(saved, draft)?.id).toBe('m1');
  });

  it('does not match another start, another task, or a non-session moment', () => {
    expect(findDuplicateSessionMoment(saved, { tags: ['todo-session:t1'], timer_started_at: '2026-03-02T03:00:00Z' })).toBeUndefined();
    expect(findDuplicateSessionMoment(saved, { tags: ['todo-session:t2'], timer_started_at: '2026-03-02T01:42:27.653Z' })).toBeUndefined();
    expect(findDuplicateSessionMoment(saved, { tags: [], timer_started_at: '2026-03-02T01:42:27.653Z' })).toBeUndefined();
  });
});

describe('stale copies (a stopped timer kept running from yesterday\'s copy)', () => {
  it('a stop patched into yesterday\'s copy leaves no live strip on today', () => {
    const today = new Date(now);
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const yesterdayStart = new Date(now - 14 * H).toISOString();
    const running = { id: 'run', title: 'Tech screen', date: 'y', is_completed: false, timer_started_at: yesterdayStart, timer_ended_at: null, timer_seconds: 0 } as unknown as Todo;
    const stopped = patchTodoList([running], 'run', { timer_started_at: null, timer_ended_at: iso(now), timer_seconds: 1472 } as Partial<Todo>);
    expect(isTimerRunning(stopped[0], now)).toBe(false);
    const blocks = buildPlanBlocks([], [], [], new Set(), undefined, { todos: stopped, moments: [] }, todayKey);
    expect(blocks.some(b => b.id === 'run')).toBe(false);
  });

  it('leaves lists without the id untouched (same reference)', () => {
    const list = [{ id: 'a' }];
    expect(patchTodoList(list, 'b', {})).toBe(list);
  });
});

describe('session moment draft', () => {
  it('files a cross-midnight session on the day it started', () => {
    const start = new Date(2026, 2, 2, 23, 30).toISOString();
    const end = new Date(2026, 2, 3, 0, 40).toISOString();
    const d = buildSessionMomentDraft({ id: 't1', title: 'Write', tags: ['work'] }, start, end, 4200);
    expect(d.date).toBe('2026-03-02');
    expect(d.tags).toEqual(['focus-session', 'todo-session:t1', 'work']);
  });
});

describe('moment timers vs time-pinned notes (the phantom 5h29m)', () => {
  it('only a moment started as a timer counts as running', () => {
    expect(isMomentTimerRunning({ timer_started_at: iso(now), timer_ended_at: null, timer_seconds: null })).toBe(false);
    expect(isMomentTimerRunning({ timer_started_at: iso(now), timer_ended_at: null, timer_seconds: 0 })).toBe(true);
    expect(isMomentTimerRunning({ timer_started_at: iso(now), timer_ended_at: iso(now), timer_seconds: 0 })).toBe(false);
  });
});
