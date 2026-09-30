import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { isSpentOneShotReminder, patchAfterReminderFire } from '@/lib/reminderSchedule';

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

  // Heal legacy one-shots that already fired but stayed active because the old
  // tick used Math.max(1, interval_days) and rescheduled them daily forever.
  const healedRef = useRef(false);
  useEffect(() => {
    if (!canUseDb || healedRef.current || reminders.length === 0) return;
    const stuck = reminders.filter(r => r.is_active && isSpentOneShotReminder(r));
    if (stuck.length === 0) {
      healedRef.current = true;
      return;
    }
    healedRef.current = true;
    (async () => {
      await Promise.all(
        stuck.map(r =>
          supabase.from('reminders').update({ is_active: false }).eq('id', r.id),
        ),
      );
      await fetchReminders();
    })();
  }, [canUseDb, reminders, fetchReminders]);

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

        // Already-delivered one-shot: stop quietly (covers rows healed mid-session
        // or any that slipped past the mount heal).
        if (isSpentOneShotReminder(r)) {
          await supabase.from('reminders').update({ is_active: false }).eq('id', r.id);
          changed = true;
          continue;
        }

        const due = new Date(r.next_reminder_at);
        if (due > now) continue;
        changed = true;

        const type = r.reminder_type || 'browser';
        const message = r.description || r.title;

        if (type === 'browser') {
          if ('Notification' in window) {
            if (Notification.permission === 'default') {
              await Notification.requestPermission();
            }
            if (Notification.permission === 'granted') {
              new Notification(r.title, { body: message });
            } else {
              toast.info(`提醒：${r.title}`);
            }
          } else {
            toast.info(`提醒：${r.title}`);
          }
        } else {
          const to = encodeURIComponent(user.email || '');
          const subject = encodeURIComponent(`Reminder: ${r.title}`);
          const body = encodeURIComponent(message || r.title);
          if (user.email) {
            window.open(`mailto:${to}?subject=${subject}&body=${body}`, '_blank');
          }
          toast.info(`邮件提醒：${r.title}`);
        }

        const patch = patchAfterReminderFire(r, now);
        await supabase.from('reminders').update(patch).eq('id', r.id);
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
