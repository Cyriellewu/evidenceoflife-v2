import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  description?: string;
  location?: string;
  htmlLink?: string;
}

async function getFunctionErrorMessage(error: unknown, fallback: string) {
  if (!(error instanceof Error)) return fallback;

  const response = (error as Error & { context?: Response }).context;
  if (!response || typeof response.clone !== 'function') {
    return error.message || fallback;
  }

  try {
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const payload = await response.clone().json();
      if (typeof payload?.error === 'string' && payload.error.trim()) {
        return payload.error;
      }
    } else {
      const text = await response.clone().text();
      if (text.trim()) {
        return text;
      }
    }
  } catch {
    // Fall back to the original error message below.
  }

  return error.message || fallback;
}

interface UseGoogleCalendarOptions {
  /**
   * Calendar metadata is only needed while the calendar menu is open.
   * Keeping this opt-in prevents an unrelated settings panel mount from
   * refreshing Google OAuth credentials and surfacing connection errors.
   */
  loadCalendars?: boolean;
}

export function useGoogleCalendar({ loadCalendars = false }: UseGoogleCalendarOptions = {}) {
  const { user, session } = useAuth();
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [calendars, setCalendars] = useState<Array<{ id: string; summary: string; primary: boolean }>>([]);
  const [selectedCalendarId, setSelectedCalendarId] = useState<string | null>(null);
  const [showInApp, setShowInApp] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const stored = window.localStorage.getItem('gcal.showInApp');
    return stored !== 'false';
  });

  // Check if user has Google Calendar connected (via secure RPC, no token exposure)
  useEffect(() => {
    if (!user) { setLoading(false); return; }

    supabase
      .rpc('is_google_calendar_connected')
      .then(({ data, error }) => {
        setConnected(!!data && !error);
        setLoading(false);
      });
  }, [user]);

  // Check URL for gcal=connected param
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('gcal') === 'connected') {
      setConnected(true);
      // Clean URL
      const url = new URL(window.location.href);
      url.searchParams.delete('gcal');
      window.history.replaceState({}, '', url.pathname);
    }
  }, []);

  // Load available calendars only when the user opens the calendar control.
  // Appearance and other local settings must not trigger an OAuth refresh.
  useEffect(() => {
    if (!loadCalendars || !connected || !session?.access_token) return;

    const loadCalendarOptions = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('google-calendar-sync', {
          headers: { Authorization: `Bearer ${session.access_token}` },
          body: { action: 'listCalendars' },
        });
        if (error) {
          console.error('Failed to list calendars:', error);
          const message = await getFunctionErrorMessage(error, 'Failed to load Google calendars');
          toast.error(message);
          setConnected(false);
          return;
        }
        const list = (data.calendars || []) as Array<{ id: string; summary: string; primary?: boolean }>;
        setCalendars(list.map(c => ({ id: c.id, summary: c.summary, primary: !!c.primary })));

        // Restore last selection or default to primary
        const storedId = typeof window !== 'undefined' ? window.localStorage.getItem('gcal.selectedCalendarId') : null;
        if (storedId && list.some(c => c.id === storedId)) {
          setSelectedCalendarId(storedId);
        } else {
          const primary = list.find(c => c.primary) || list[0];
          if (primary) setSelectedCalendarId(primary.id);
        }
      } catch (err) {
        console.error('Error loading calendars:', err);
        toast.error(err instanceof Error ? err.message : 'Failed to load Google calendars');
        setConnected(false);
      }
    };

    loadCalendarOptions();
  }, [connected, loadCalendars, session]);

  const connect = useCallback(async () => {
    if (!session?.access_token) {
      toast.error('Please sign in before connecting Google Calendar');
      return;
    }

    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('google-calendar-auth', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: {
          redirectTo: window.location.href,
        },
      });

      if (error) {
        console.error('Failed to get auth URL:', error);
        const message = await getFunctionErrorMessage(error, 'Failed to start Google Calendar connection');
        toast.error(message);
        return;
      }

      if (!data?.url) {
        toast.error('Google Calendar auth URL is missing');
        return;
      }

      window.location.href = data.url;
    } catch (err) {
      console.error('Google Calendar connect failed:', err);
      toast.error('Google Calendar connection failed');
    } finally {
      setSyncing(false);
    }
  }, [session]);

  const disconnect = useCallback(async () => {
    if (!user || !session?.access_token) return;
    // Use edge function to delete tokens server-side (no direct client access)
    await supabase.functions.invoke('google-calendar-sync', {
      headers: { Authorization: `Bearer ${session.access_token}` },
      body: { action: 'disconnect' },
    });
    setConnected(false);
    setEvents([]);
  }, [user, session]);

  const fetchEvents = useCallback(async (date: string) => {
    if (!connected || !session?.access_token || !selectedCalendarId || !showInApp) return;

    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('google-calendar-sync', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: { action: 'list', date, calendarId: selectedCalendarId },
      });

      if (error) throw error;
      setEvents(data.events || []);
    } catch (err) {
      console.error('Failed to fetch calendar events:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to fetch Google Calendar events');
    } finally {
      setSyncing(false);
    }
  }, [connected, session, selectedCalendarId, showInApp]);

  const createEvent = useCallback(async (event: {
    summary: string;
    start: { dateTime: string; timeZone?: string };
    end: { dateTime: string; timeZone?: string };
  }) => {
    if (!connected || !session?.access_token || !selectedCalendarId) return;

    try {
      const { data, error } = await supabase.functions.invoke('google-calendar-sync', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: { action: 'create', event, calendarId: selectedCalendarId },
      });

      if (error) throw error;
      return data.event;
    } catch (err) {
      console.error('Failed to create calendar event:', err);
    }
  }, [connected, session, selectedCalendarId]);

  const deleteEvent = useCallback(async (eventId: string) => {
    if (!connected || !session?.access_token || !selectedCalendarId) return;

    try {
      const { error } = await supabase.functions.invoke('google-calendar-sync', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: { action: 'delete', eventId, calendarId: selectedCalendarId },
      });

      if (error) throw error;
      setEvents(prev => prev.filter(e => e.id !== eventId));
    } catch (err) {
      console.error('Failed to delete calendar event:', err);
    }
  }, [connected, session]);

  return {
    connected,
    loading,
    events,
    syncing,
    calendars,
    selectedCalendarId,
    showInApp,
    connect,
    disconnect,
    fetchEvents,
    createEvent,
    deleteEvent,
    setSelectedCalendarId: (id: string) => {
      setSelectedCalendarId(id);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('gcal.selectedCalendarId', id);
      }
    },
    setShowInApp: (show: boolean) => {
      setShowInApp(show);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('gcal.showInApp', show ? 'true' : 'false');
      }
      if (!show) {
        setEvents([]);
      }
    },
  };
}
