/**
 * Scheduling rules for the `reminders` table after a due fire.
 *
 * - interval_days <= 0 → one-shot (calendar "remind me at …"). After delivery,
 *   deactivate; never bump next_reminder_at forward.
 * - interval_days >= 1 → recurring. Advance next_reminder_at by that many days.
 *
 * Legacy bug: one-shots used Math.max(1, interval_days) and kept reminding daily.
 */

export type ReminderFirePatch = {
  is_active: boolean;
  last_reminded_at: string;
  next_reminder_at: string;
};

/** True when this row is a one-shot that already delivered at least once. */
export function isSpentOneShotReminder(r: {
  interval_days: number;
  last_reminded_at?: string | null;
}): boolean {
  return r.interval_days <= 0 && !!r.last_reminded_at;
}

export function patchAfterReminderFire(
  reminder: { interval_days: number },
  now: Date = new Date(),
): ReminderFirePatch {
  const last_reminded_at = now.toISOString();
  if (reminder.interval_days <= 0) {
    return {
      is_active: false,
      last_reminded_at,
      // Keep the fired time so history stays meaningful; inactive stops the tick.
      next_reminder_at: last_reminded_at,
    };
  }
  const nextAt = new Date(now);
  nextAt.setDate(nextAt.getDate() + reminder.interval_days);
  return {
    is_active: true,
    last_reminded_at,
    next_reminder_at: nextAt.toISOString(),
  };
}
