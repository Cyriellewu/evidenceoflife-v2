import { beforeEach, describe, expect, it } from 'vitest';
import {
  FIRST_RUN_WINDOW_MS,
  dismissFirstRunGuide,
  getFirstRunSteps,
  isFirstRunAccount,
  isFirstRunGuideDismissed,
} from '@/lib/firstRun';

const NOW = Date.parse('2026-10-10T12:00:00.000Z');
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

describe('isFirstRunAccount', () => {
  it('is true for a real account inside the 72h window', () => {
    expect(isFirstRunAccount({ isDemo: false, createdAt: hoursAgo(1), now: NOW })).toBe(true);
    expect(isFirstRunAccount({ isDemo: false, createdAt: hoursAgo(71), now: NOW })).toBe(true);
  });

  it('is false once the window has passed, even if no data has loaded', () => {
    // A restricted/failed fetch returns empty lists; account age alone decides,
    // so a long-time user never gets first-run treatment.
    expect(isFirstRunAccount({ isDemo: false, createdAt: hoursAgo(72), now: NOW })).toBe(false);
    expect(isFirstRunAccount({ isDemo: false, createdAt: new Date(NOW - FIRST_RUN_WINDOW_MS - 1).toISOString(), now: NOW })).toBe(false);
    expect(isFirstRunAccount({ isDemo: false, createdAt: hoursAgo(24 * 200), now: NOW })).toBe(false);
  });

  it('is false for demo, missing or invalid timestamps, and future dates', () => {
    expect(isFirstRunAccount({ isDemo: true, createdAt: hoursAgo(1), now: NOW })).toBe(false);
    expect(isFirstRunAccount({ isDemo: false, createdAt: null, now: NOW })).toBe(false);
    expect(isFirstRunAccount({ isDemo: false, createdAt: 'nope', now: NOW })).toBe(false);
    expect(isFirstRunAccount({ isDemo: false, createdAt: hoursAgo(-5), now: NOW })).toBe(false);
  });
});

describe('getFirstRunSteps', () => {
  it('requires a task and a moment; the timer is optional', () => {
    expect(getFirstRunSteps([], 0)).toMatchObject({ task: false, timer: false, moment: false, doneCount: 0, allRequiredDone: false });
    expect(getFirstRunSteps([{ timer_seconds: 0 }], 0)).toMatchObject({ task: true, timer: false, doneCount: 1, allRequiredDone: false });
    expect(getFirstRunSteps([{ timer_seconds: 0 }], 1)).toMatchObject({ task: true, moment: true, doneCount: 2, allRequiredDone: true });
  });

  it('counts a started or completed timer', () => {
    expect(getFirstRunSteps([{ timer_started_at: '2026-10-10T10:00:00Z' }], 0).timer).toBe(true);
    expect(getFirstRunSteps([{ timer_seconds: 60 }], 0).timer).toBe(true);
  });
});

describe('guide dismissal', () => {
  beforeEach(() => window.localStorage.clear());

  it('is stored per user', () => {
    dismissFirstRunGuide('user-a');
    expect(isFirstRunGuideDismissed('user-a')).toBe(true);
    expect(isFirstRunGuideDismissed('user-b')).toBe(false);
  });

  it('ignores a missing user', () => {
    dismissFirstRunGuide(null);
    expect(isFirstRunGuideDismissed(null)).toBe(false);
  });
});
