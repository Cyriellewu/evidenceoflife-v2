import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { getErrorMessage } from '@/lib/utils';

export interface ImportedEvent {
  id: string;
  title: string;
  description: string | null;
  start_time: string;
  end_time: string | null;
  timer_started_at: string | null;
  timer_ended_at: string | null;
  timer_seconds: number | null;
  location: string | null;
  source_file: string;
  import_batch_id: string;
  is_completed: boolean;
  created_at: string;
}

type ImportedEventUpdates = Partial<Pick<
  ImportedEvent,
  'title' | 'description' | 'start_time' | 'end_time' | 'timer_started_at' | 'timer_ended_at' | 'timer_seconds' | 'location' | 'is_completed'
>>;

const IMPORTED_EVENTS_CHANGED = 'eol-imported-events-changed';

function notifyImportedEventsChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(IMPORTED_EVENTS_CHANGED));
  }
}

export interface ImportBatch {
  batch_id: string;
  source_file: string;
  count: number;
}

function parseICS(text: string): { title: string; description?: string; start_time: string; end_time?: string; location?: string }[] {
  const events: { title: string; description?: string; start_time: string; end_time?: string; location?: string }[] = [];
  const lines = text.replace(/\r\n /g, '').split(/\r?\n/);
  
  let inEvent = false;
  let current: Record<string, string> = {};

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      inEvent = true;
      current = {};
    } else if (line === 'END:VEVENT') {
      if (current.summary && current.dtstart) {
        events.push({
          title: current.summary,
          description: current.description,
          start_time: parseICSDate(current.dtstart),
          end_time: current.dtend ? parseICSDate(current.dtend) : undefined,
          location: current.location,
        });
      }
      inEvent = false;
    } else if (inEvent) {
      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) continue;
      const keyPart = line.substring(0, colonIdx);
      const value = line.substring(colonIdx + 1);
      const key = keyPart.split(';')[0].toUpperCase();

      if (key === 'SUMMARY') current.summary = value;
      else if (key === 'DESCRIPTION') current.description = value;
      else if (key === 'DTSTART') current.dtstart = value;
      else if (key === 'DTEND') current.dtend = value;
      else if (key === 'LOCATION') current.location = value;
    }
  }
  return events;
}

function parseICSDate(str: string): string {
  // Handle formats: 20250101T120000Z, 20250101T120000, 20250101
  const clean = str.replace(/[^0-9TZ]/g, '');
  if (clean.length >= 15) {
    const y = clean.slice(0, 4), mo = clean.slice(4, 6), d = clean.slice(6, 8);
    const h = clean.slice(9, 11), mi = clean.slice(11, 13), s = clean.slice(13, 15);
    const suffix = clean.endsWith('Z') ? 'Z' : '';
    return `${y}-${mo}-${d}T${h}:${mi}:${s}${suffix}`;
  }
  if (clean.length >= 8) {
    const y = clean.slice(0, 4), mo = clean.slice(4, 6), d = clean.slice(6, 8);
    return `${y}-${mo}-${d}T00:00:00`;
  }
  return new Date().toISOString();
}

export function useImportedEvents(enabled = true) {
  const { user } = useAuth();
  const [events, setEvents] = useState<ImportedEvent[]>([]);
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchEvents = useCallback(async () => {
    if (!enabled || !user) return;

    try {
      const { data, error } = await supabase
        .from('imported_events')
        .select('*')
        .order('start_time', { ascending: true });

      if (error) {
        console.error('Failed to fetch imported events:', error);
        return;
      }

      if (data) {
        setEvents(data);
        // Build batches
        const batchMap = new Map<string, ImportBatch>();
        data.forEach(e => {
          const existing = batchMap.get(e.import_batch_id);
          if (existing) existing.count++;
          else batchMap.set(e.import_batch_id, { batch_id: e.import_batch_id, source_file: e.source_file, count: 1 });
        });
        setBatches(Array.from(batchMap.values()));
      }
    } catch (err) {
      console.error('Failed to fetch imported events (exception):', err);
    }
  }, [enabled, user]);

  useEffect(() => {
    if (enabled) void fetchEvents();
  }, [enabled, fetchEvents]);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;
    window.addEventListener(IMPORTED_EVENTS_CHANGED, fetchEvents);
    return () => window.removeEventListener(IMPORTED_EVENTS_CHANGED, fetchEvents);
  }, [enabled, fetchEvents]);

  const importICS = useCallback(async (file: File): Promise<boolean> => {
    if (!user) return false;
    setLoading(true);
    try {
      const text = await file.text();
      const parsed = parseICS(text);
      if (parsed.length === 0) {
        toast.error('No events found in file');
        return false;
      }

      const batchId = crypto.randomUUID();
      const rows = parsed.map(e => ({
        user_id: user.id,
        title: e.title,
        description: e.description || null,
        start_time: e.start_time,
        end_time: e.end_time || null,
        location: e.location || null,
        source_file: file.name,
        import_batch_id: batchId,
      }));

      const { error } = await supabase.from('imported_events').insert(rows);
      if (error) throw error;
      toast.success(`Imported ${parsed.length} events from ${file.name}`);
      await fetchEvents();
      notifyImportedEventsChanged();
      return true;
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Import failed'));
      return false;
    } finally {
      setLoading(false);
    }
  }, [user, fetchEvents]);

  const addManualEvent = useCallback(async (input: { title: string; startISO: string; endISO: string; description?: string | null; location?: string | null; }) => {
    if (!user) return false;
    const { error } = await supabase.from('imported_events').insert({
      user_id: user.id,
      title: input.title,
      description: input.description || null,
      start_time: input.startISO,
      end_time: input.endISO,
      location: input.location || null,
      source_file: 'manual',
      import_batch_id: 'manual',
    });
    if (error) {
      toast.error('Create event failed');
      return false;
    }
    toast.success('Event created');
    await fetchEvents();
    notifyImportedEventsChanged();
    return true;
  }, [user, fetchEvents]);

  const updateEvent = useCallback(async (id: string, updates: ImportedEventUpdates) => {
    setEvents(prev => prev.map(e => e.id === id ? { ...e, ...updates } : e));
    const { error } = await supabase.from('imported_events').update(updates).eq('id', id);
    if (error) {
      toast.error('Update event failed');
      await fetchEvents();
      return false;
    }
    notifyImportedEventsChanged();
    return true;
  }, [fetchEvents]);

  const deleteBatch = useCallback(async (batchId: string) => {
    const { error } = await supabase.from('imported_events').delete().eq('import_batch_id', batchId);
    if (error) { toast.error('Delete failed'); return; }
    toast.success('Batch deleted');
    await fetchEvents();
    notifyImportedEventsChanged();
  }, [fetchEvents]);

  const deleteSelected = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    const { error } = await supabase.from('imported_events').delete().in('id', ids);
    if (error) { toast.error('Delete failed'); return; }
    toast.success(`Deleted ${ids.length} events`);
    await fetchEvents();
    notifyImportedEventsChanged();
  }, [fetchEvents]);

  const searchEvents = useCallback((query: string) => {
    if (!query.trim()) return events;
    const q = query.toLowerCase();
    return events.filter(e => e.title.toLowerCase().includes(q) || (e.description || '').toLowerCase().includes(q) || (e.location || '').toLowerCase().includes(q));
  }, [events]);

  const toggleComplete = useCallback(async (id: string) => {
    const event = events.find(e => e.id === id);
    if (!event) return;
    const newVal = !event.is_completed;
    // Optimistic update
    setEvents(prev => prev.map(e => e.id === id ? { ...e, is_completed: newVal } : e));
    const { error } = await supabase.from('imported_events').update({ is_completed: newVal }).eq('id', id);
    if (error) { toast.error('Update failed'); await fetchEvents(); return; }
    notifyImportedEventsChanged();
  }, [events, fetchEvents]);

  return { events, batches, loading, importICS, addManualEvent, updateEvent, deleteBatch, deleteSelected, searchEvents, toggleComplete, refetch: fetchEvents };
}
