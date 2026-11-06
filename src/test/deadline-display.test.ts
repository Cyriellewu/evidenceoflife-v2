import { describe, expect, it } from 'vitest';
import { deadlineBucket, describeDeadline, pickDeadlineIcon } from '@/lib/deadlineDisplay';

const NOW = new Date(2026, 10, 6, 15, 0); // Fri 6 Nov 2026, 15:00

describe('deadline display', () => {
  it('buckets by calendar day; overdue counts as today', () => {
    expect(deadlineBucket('2026-11-06T23:59', NOW)).toBe('today');
    expect(deadlineBucket('2026-11-04T23:59', NOW)).toBe('today');
    expect(deadlineBucket('2026-11-07T10:00', NOW)).toBe('week');
    expect(deadlineBucket('2026-11-20T23:59', NOW)).toBe('later');
    expect(deadlineBucket(null, NOW)).toBe('none');
  });

  it('describes time left in plain words', () => {
    expect(describeDeadline('2026-11-06T21:00', 'zh', NOW)).toEqual({ text: '21:00 · 还剩 6 小时', urgent: true });
    expect(describeDeadline('2026-11-06T15:40', 'en', NOW)).toEqual({ text: '15:40 · 40 min left', urgent: true });
    expect(describeDeadline('2026-11-08T23:59', 'zh', NOW)).toEqual({ text: '周日 · 还有 2 天', urgent: false });
    expect(describeDeadline('2026-11-20T23:59', 'en', NOW).text).toBe('Nov 20 · 14 days left');
    expect(describeDeadline('2026-11-04T23:59', 'zh', NOW)).toEqual({ text: '11月4日 · 已过期 2 天', urgent: true });
  });

  it('picks an icon from the title', () => {
    expect(pickDeadlineIcon('交论文初稿').emoji).toBe('📝');
    expect(pickDeadlineIcon('pay rent').emoji).toBe('🏠');
    expect(pickDeadlineIcon('Renew passport').emoji).toBe('✈️');
    expect(pickDeadlineIcon('buy milk').emoji).toBe('📌');
  });
});
