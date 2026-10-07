import { useState, useCallback, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { isSpentOneShotReminder, patchAfterReminderFire } from '@/lib/reminderSchedule';
import { withExclusiveWrite } from '@/lib/writeSafety';

export interface Reminder {
  id: string;
  user_id: string;
  title: string;
  description?: string | null;
  interval_days: number;
  next_reminder_at: string;
  last_reminded_at?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  reminder_type?: 'browser' | 'email';
}

const TYPE_PREFIX = '[REMINDER_TYPE:';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function extractType(description?: string | null): 'browser' | 'email' {
  if (!description) return 'browser';
  if (description.startsWith(`${TYPE_PREFIX}email]`)) return 'email';
  return 'browser';
}

function stripTypePrefix(description?: string | null): string | null {
  if (!description) return null;
  if (!description.startsWith(TYPE_PREFIX)) return description;
  const end = description.indexOf(']');
  const payload = description.slice(end + 1).trim();
  return payload || null;
}

export function useReminders() {
  const { user } = useAuth();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(false);

  const canUseDb = useMemo(() => !!user?.id && UUID_RE.test(user.id), [user?.id]);

  const fetchReminders = useCallback(async () => {
    if (!canUseDb || !user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('reminders')
        .select('*')
        .eq('user_id', user.id)
        .order('next_reminder_at', { ascending: true });
      if (!error && data) {
        const normalized = (data as Reminder[]).map((r) => ({
          ...r,
          reminder_type: extractType(r.description),
          description: stripTypePrefix(r.description),
        }));
        setReminders(normalized);
      }
    } finally {
      setLoading(false);
    }
  }, [canUseDb, user]);

  useEffect(() => { fetchReminders(); }, [fetchReminders]);

  const addReminder = useCallback(async (
    title: string,
    intervalDays: number,
    description?: string,
    reminderType: 'browser' | 'email' = 'browser'
  ) => {
    if (!canUseDb || !user) return null;
    const nextAt = new Date();
    nextAt.setDate(nextAt.getDate() + intervalDays);

    const packedDescription = `${TYPE_PREFIX}${reminderType}] ${description || ''}`.trim();

    const { data, error } = await supabase
      .from('reminders')
      .insert({
        user_id: user.id,
        title,
        description: packedDescription || null,
        interval_days: intervalDays,
        next_reminder_at: nextAt.toISOString(),
      })
      .select()
      .single();

    if (!error && data) {
      const normalized: Reminder = {
        ...(data as Reminder),
        reminder_type: reminderType,
        description: description || null,
      };
      setReminders(prev => [...prev, normalized]);
      return normalized;
    }
    return null;
  }, [canUseDb, user]);

  const addReminderAt = useCallback(async (
    title: string,
    at: Date,
    description?: string,
    reminderType: 'browser' | 'email' = 'browser'
  ) => {
    if (!canUseDb || !user) return null;
    const packedDescription = `${TYPE_PREFIX}${reminderType}] ${description || ''}`.trim();
    const { data, error } = await supabase
      .from('reminders')
      .insert({
        user_id: user.id,
        title,
        description: packedDescription || null,
        interval_days: 0,
        next_reminder_at: at.toISOString(),
      })
      .select()
      .single();
    if (!error && data) {
      const normalized: Reminder = {
        ...(data as Reminder),
        reminder_type: reminderType,
        description: description || null,
      };
      setReminders(prev => [...prev, normalized]);
      return normalized;
    }
    return null;
  }, [canUseDb, user]);

  const deleteReminder = useCallback(async (id: string) => {
    if (!canUseDb) return;
    await supabase.from('reminders').delete().eq('id', id);
    setReminders(prev => prev.filter(r => r.id !== id));
  }, [canUseDb]);

  const toggleReminder = useCallback(async (id: string) => {
    const reminder = reminders.find(r => r.id === id);
    if (!reminder || !canUseDb) return;
    const newActive = !reminder.is_active;
    await supabase.from('reminders').update({ is_active: newActive }).eq('id', id);
    setReminders(prev => prev.map(r => r.id === id ? { ...r, is_active: newActive } : r));
  }, [reminders, canUseDb]);

  // Runtime notifier: browser + email(mailto)
  useEffect(() => {
    if (!canUseDb || !user || reminders.length === 0) return;

    const tick = async () => {
      if (document.visibilityState !== 'visible') return;
      const now = new Date();
      let changed = false;
      for (const r of reminders) {
        if (!r.is_active) continue;
        const handled = await withExclusiveWrite(`reminder-fire:${r.id}`, async () => {
          // Several mounted views use this hook. Re-read inside the shared lock
          // so only one hook/tab can deliver and advance a due reminder.
          const { data } = await supabase
            .from('reminders')
            .select('*')
            .eq('id', r.id)
            .eq('user_id', user.id)
            .maybeSingle();
          if (!data || !data.is_active) return false;

          const current: Reminder = {
            ...(data as Reminder),
            reminder_type: extractType(data.description),
            description: stripTypePrefix(data.description),
          };

          if (isSpentOneShotReminder(current)) {
            await supabase.from('reminders').update({ is_active: false }).eq('id', current.id).eq('is_active', true);
            return true;
          }

          if (new Date(current.next_reminder_at) > now) return false;

          const type = current.reminder_type || 'browser';
          const message = current.description || current.title;

          if (type === 'browser') {
            if ('Notification' in window) {
              if (Notification.permission === 'default') {
                await Notification.requestPermission();
              }
              if (Notification.permission === 'granted') {
                new Notification(current.title, { body: message });
              } else {
                toast.info(`提醒：${current.title}`);
              }
            } else {
              toast.info(`提醒：${current.title}`);
            }
          } else {
            const to = encodeURIComponent(user.email || '');
            const subject = encodeURIComponent(`Reminder: ${current.title}`);
            const body = encodeURIComponent(message || current.title);
            if (user.email) {
              window.open(`mailto:${to}?subject=${subject}&body=${body}`, '_blank');
            }
            toast.info(`邮件提醒：${current.title}`);
          }

          const patch = patchAfterReminderFire(current, now);
          await supabase.from('reminders').update(patch).eq('id', current.id).eq('is_active', true);
          return true;
        });
        if (handled) changed = true;
      }

      if (changed) fetchReminders();
    };

    const timer = window.setInterval(() => {
      tick();
    }, 30000);
    // Run once soon so stuck one-shots (e.g. Brainbox) stop without waiting a full interval.
    void tick();

    return () => window.clearInterval(timer);
  }, [canUseDb, user, reminders, fetchReminders]);

  return { reminders, loading, addReminder, addReminderAt, deleteReminder, toggleReminder, refetch: fetchReminders };
}
