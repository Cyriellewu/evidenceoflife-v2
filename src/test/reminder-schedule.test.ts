import { describe, expect, it } from 'vitest';
import {
  isSpentOneShotReminder,
  patchAfterReminderFire,
} from '@/lib/reminderSchedule';

describe('reminderSchedule', () => {
  const now = new Date('2026-09-20T15:00:00.000Z');

  it('deactivates one-shot reminders (interval_days = 0) instead of daily repeat', () => {
    const patch = patchAfterReminderFire({ interval_days: 0 }, now);
    expect(patch.is_active).toBe(false);
    expect(patch.last_reminded_at).toBe(now.toISOString());
    expect(patch.next_reminder_at).toBe(now.toISOString());
  });

  it('treats negative interval as one-shot', () => {
    const patch = patchAfterReminderFire({ interval_days: -1 }, now);
    expect(patch.is_active).toBe(false);
  });

  it('advances recurring reminders by interval_days', () => {
    const patch = patchAfterReminderFire({ interval_days: 7 }, now);
    expect(patch.is_active).toBe(true);
    expect(patch.next_reminder_at).toBe('2026-09-27T15:00:00.000Z');
  });

  it('detects spent one-shots that should be healed without re-notifying', () => {
    expect(isSpentOneShotReminder({ interval_days: 0, last_reminded_at: now.toISOString() })).toBe(true);
    expect(isSpentOneShotReminder({ interval_days: 0, last_reminded_at: null })).toBe(false);
    expect(isSpentOneShotReminder({ interval_days: 3, last_reminded_at: now.toISOString() })).toBe(false);
  });
});
