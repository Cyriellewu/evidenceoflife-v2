import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface DueReminder {
  id: string;
  user_id: string;
  due_id: string;
  reminder_type: 'browser' | 'email';
  remind_before_minutes: number;
  is_recurring: boolean;
  recurring_interval_days: number | null;
  is_active: boolean;
  last_notified_at: string | null;
  created_at: string;
}

export function useDueReminders() {
  const { user } = useAuth();
  const [reminders, setReminders] = useState<DueReminder[]>([]);

  const fetchReminders = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('due_reminders')
      .select('id, user_id, due_id, reminder_type, remind_before_minutes, is_recurring, recurring_interval_days, is_active, last_notified_at, created_at, updated_at')
      .eq('user_id', user.id);
    if (data) setReminders(data as DueReminder[]);
  }, [user]);

  useEffect(() => { fetchReminders(); }, [fetchReminders]);

  const getRemindersForDue = useCallback((dueId: string) => {
    return reminders.filter(r => r.due_id === dueId);
  }, [reminders]);

  const upsertReminder = useCallback(async (dueId: string, type: 'browser' | 'email', beforeMinutes: number, isRecurring = false, intervalDays?: number) => {
    if (!user) return;
    // The database already has UNIQUE(user_id, due_id, reminder_type). Use it
    // atomically instead of a stale client-side check followed by INSERT.
    await supabase
      .from('due_reminders')
      .upsert({
        user_id: user.id,
        due_id: dueId,
        reminder_type: type,
        remind_before_minutes: beforeMinutes,
        is_recurring: isRecurring,
        recurring_interval_days: intervalDays || null,
        is_active: true,
      }, { onConflict: 'user_id,due_id,reminder_type' });
    await fetchReminders();
  }, [user, fetchReminders]);

  const removeReminder = useCallback(async (reminderId: string) => {
    await supabase.from('due_reminders').delete().eq('id', reminderId);
    setReminders(prev => prev.filter(r => r.id !== reminderId));
  }, []);

  const toggleReminder = useCallback(async (reminderId: string) => {
    const r = reminders.find(rem => rem.id === reminderId);
    if (!r) return;
    await supabase.from('due_reminders').update({ is_active: !r.is_active }).eq('id', reminderId);
    setReminders(prev => prev.map(rem => rem.id === reminderId ? { ...rem, is_active: !rem.is_active } : rem));
  }, [reminders]);

  return { reminders, getRemindersForDue, upsertReminder, removeReminder, toggleReminder, refetch: fetchReminders };
}
