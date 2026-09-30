import { describe, expect, it } from 'vitest';
import { isElapsedSlot } from '@/lib/elapsedSlot';

const today = '2026-09-30';

describe('isElapsedSlot', () => {
  it('treats a finished range on today as already done', () => {
    expect(isElapsedSlot({
      viewingDate: today,
      today,
      boundaryMin: 15 * 60,
      nowMin: 16 * 60,
    })).toBe(true);
  });

  it('keeps a range that ends after now as still open', () => {
    expect(isElapsedSlot({
      viewingDate: today,
      today,
      boundaryMin: 17 * 60,
      nowMin: 16 * 60,
    })).toBe(false);
  });

  it('treats a drop whose start is already past as done', () => {
    expect(isElapsedSlot({
      viewingDate: today,
      today,
      boundaryMin: 14 * 60,
      nowMin: 16 * 60,
      strict: true,
    })).toBe(true);
  });

  it('treats any slot on a previous calendar day as done', () => {
    expect(isElapsedSlot({
      viewingDate: '2026-09-29',
      today,
      boundaryMin: 22 * 60,
      nowMin: 10 * 60,
    })).toBe(true);
  });

  it('does not mark a future day done just because the clock is pinned to the end of the day', () => {
    expect(isElapsedSlot({
      viewingDate: '2026-10-01',
      today,
      boundaryMin: 9 * 60,
      nowMin: 24 * 60,
    })).toBe(false);
  });
});
