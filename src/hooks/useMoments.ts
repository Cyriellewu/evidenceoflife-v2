import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Moment, DayRecord, MomentLinkPreview } from '@/types';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { fetchAllMoments, isMissingMomentLinksColumn, uploadPhotos } from '@/hooks/moments/data';
import { hasTrackedFirstAction, markFirstActionTracked, trackEvent } from '@/lib/analytics';
import dailyPaintingImage from '@/assets/daily-painting.jpg';
import monetPaintingImage from '@/assets/monet-impression-sunrise.jpg';
import footprintLogoImage from '@/assets/footprint-logo.png';

type MomentUpdates = Partial<Omit<Moment, 'location'>> & {
  location?: Moment['location'] | null;
};

type MomentUpdate = Database['public']['Tables']['moments']['Update'];

function uniquePhotos(photos?: string[]): string[] {
  return Array.from(new Set((photos || []).filter(photo => typeof photo === 'string' && photo.trim().length > 0)));
}

function buildDemoMoments(): Moment[] {
  const demoDayStr = '2026-04-08';
  const previousDayStr = '2026-04-07';
  const nextDayStr = '2026-04-09';

  return [
    {
      id: 'demo-moment-1',
      date: demoDayStr,
      text: 'Walked past the library and the light looked unreal.',
      emoji: '🌤️',
      photos: [dailyPaintingImage],
      tags: ['life'],
      createdAt: new Date(`${demoDayStr}T09:05:00`).toISOString(),
      timer_started_at: new Date(`${demoDayStr}T09:05:00`).toISOString(),
      timer_ended_at: null,
      timer_seconds: 0,
      location: {
        name: 'Butler Library',
        lat: 40.8069,
        lng: -73.9638,
        category: 'other',
      },
    },
    {
      id: 'demo-moment-2',
      date: demoDayStr,
      text: 'Coffee break that turned into an unexpectedly good conversation.',
      emoji: '☕',
      photos: [footprintLogoImage],
      tags: ['social'],
      createdAt: new Date(`${demoDayStr}T12:10:00`).toISOString(),
      timer_started_at: new Date(`${demoDayStr}T12:10:00`).toISOString(),
      timer_ended_at: null,
      timer_seconds: 0,
      location: {
        name: 'Joe Coffee',
        lat: 40.8057,
        lng: -73.9655,
        category: 'coffee',
      },
    },
    {
      id: 'demo-moment-3',
      date: previousDayStr,
      text: 'Finished the rough draft and felt the day click into place.',
      emoji: '✨',
      photos: [],
      tags: ['work'],
      createdAt: new Date(`${previousDayStr}T18:20:00`).toISOString(),
      timer_started_at: new Date(`${previousDayStr}T18:20:00`).toISOString(),
      timer_ended_at: null,
      timer_seconds: 0,
      location: {
        name: 'Riverside Park',
        lat: 40.8096,
        lng: -73.9719,
        category: 'park',
      },
    },
    {
      id: 'demo-moment-4',
      date: demoDayStr,
      text: 'Sat by the river for ten quiet minutes before heading back to campus.',
      emoji: '🌿',
      photos: [monetPaintingImage],
      tags: ['reset'],
      createdAt: new Date(`${demoDayStr}T17:40:00`).toISOString(),
      timer_started_at: new Date(`${demoDayStr}T17:40:00`).toISOString(),
      timer_ended_at: null,
      timer_seconds: 0,
      location: {
        name: 'Riverside Park',
        lat: 40.8096,
        lng: -73.9719,
        category: 'park',
      },
    },
    {
      id: 'demo-moment-5',
      date: previousDayStr,
      text: 'A pastry stop that accidentally became a long debrief about the week.',
      emoji: '🥐',
      photos: [dailyPaintingImage],
      tags: ['food'],
      createdAt: new Date(`${previousDayStr}T10:25:00`).toISOString(),
      timer_started_at: new Date(`${previousDayStr}T10:25:00`).toISOString(),
      timer_ended_at: null,
      timer_seconds: 0,
      location: {
        name: 'Hungarian Pastry Shop',
        lat: 40.8051,
        lng: -73.9618,
        category: 'restaurant',
      },
    },
    {
      id: 'demo-moment-6',
      date: demoDayStr,
      text: 'Stopped by the cathedral steps and took a photo before class.',
      emoji: '📸',
      photos: [monetPaintingImage],
      tags: ['photo'],
      createdAt: new Date(`${demoDayStr}T08:22:00`).toISOString(),
      timer_started_at: new Date(`${demoDayStr}T08:22:00`).toISOString(),
      timer_ended_at: null,
      timer_seconds: 0,
      location: {
        name: 'Cathedral Gardens',
        lat: 40.8044,
        lng: -73.9632,
        category: 'museum',
      },
    },
    {
      id: 'demo-moment-7',
      date: nextDayStr,
      text: 'Picked up one more coffee and outlined the recap on the walk back.',
      emoji: '📝',
      photos: [],
      tags: ['coffee'],
      createdAt: new Date(`${nextDayStr}T11:05:00`).toISOString(),
      timer_started_at: new Date(`${nextDayStr}T11:05:00`).toISOString(),
      timer_ended_at: null,
      timer_seconds: 0,
      location: {
        name: 'Blue Bottle Coffee',
        lat: 40.8073,
        lng: -73.9645,
        category: 'coffee',
      },
    },
  ];
}

export function useMoments() {
  const { user, isDemo, authReady } = useAuth();
  const [moments, setMoments] = useState<Moment[]>([]);
  const allLocations = useMemo(() => moments.filter(m => m.location), [moments]);
  const [loading, setLoading] = useState(true);
  const pendingAddsRef = useRef(new Set<string>());

  useEffect(() => {
    if (!authReady) {
      setLoading(true);
      return;
    }

    if (!user || isDemo) {
      setMoments(isDemo ? buildDemoMoments() : []);
      setLoading(false);
      return;
    }

    let cancelled = false;

    const fetchMoments = async () => {
      setLoading(true);

      try {
        const { data, error } = await fetchAllMoments(user.id);

        if (cancelled) return;

        if (error) {
          console.error('Failed to fetch moments:', error);
          toast.error('加载记录失败，请检查网络后重试');
          return;
        }

        setMoments(data);
      } catch (err) {
        if (cancelled) return;
        console.error('Failed to fetch moments (exception):', err);
        toast.error('加载记录失败，请检查网络后重试');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchMoments();

    return () => {
      cancelled = true;
    };
  }, [user, isDemo, authReady]);


  const addMoment = useCallback(async (moment: Omit<Moment, 'id' | 'createdAt'>) => {
    if (!user) return;
    const addKey = JSON.stringify([
      moment.date,
      moment.text || '',
      moment.emoji || '',
      moment.location?.lat ?? null,
      moment.location?.lng ?? null,
      moment.photos?.length ?? 0,
    ]);
    if (pendingAddsRef.current.has(addKey)) return;
    pendingAddsRef.current.add(addKey);
    try {

    if (isDemo) {
      const newMoment: Moment = {
        id: crypto.randomUUID(),
        date: moment.date,
        text: moment.text,
        emoji: moment.emoji,
        photos: moment.photos || [],
        links: moment.links || [],
        tags: moment.tags || [],
        location: moment.location,
        isSpecial: moment.isSpecial || false,
        createdAt: new Date().toISOString(),
        timer_started_at: moment.timer_started_at || null,
        timer_ended_at: moment.timer_ended_at || null,
        timer_seconds: moment.timer_seconds || 0,
      };
      setMoments(prev => [newMoment, ...prev]);
      return newMoment;
    }

    let photoUrls: string[] = [];
    if (moment.photos && moment.photos.length > 0) {
      photoUrls = await uploadPhotos(user.id, moment.photos);
      if (photoUrls.length < moment.photos.length) {
        toast.warning('Some photos failed to upload');
      }
    }
    const baseInsert = {
      user_id: user.id,
      date: moment.date,
      text: moment.text || null,
      emoji: moment.emoji || null,
      photos: photoUrls,
      tags: moment.tags || [],
      location_name: moment.location?.name || null,
      location_lat: moment.location?.lat || null,
      location_lng: moment.location?.lng || null,
      location_category: moment.location?.category || null,
      is_special: moment.isSpecial || false,
      timer_started_at: moment.timer_started_at || null,
      timer_ended_at: moment.timer_ended_at || null,
      timer_seconds: moment.timer_seconds || 0,
    };

    let data: unknown = null;
    let error: unknown = null;

    ({ data, error } = await supabase
      .from('moments')
      .insert({
        ...baseInsert,
        links: moment.links || [],
      })
      .select()
      .single());

    if (error && isMissingMomentLinksColumn(error)) {
      ({ data, error } = await supabase
        .from('moments')
        .insert(baseInsert)
        .select()
        .single());
    }

    if (error) { console.error('Failed to add moment:', error); toast.error('Failed to save moment'); return; }
    const row = data as {
      id: string; date: string; text: string | null; emoji: string | null;
      photos?: string[]; links?: MomentLinkPreview[]; tags?: string[];
      location_name: string | null; location_lat: number | null; location_lng: number | null;
      location_category: 'restaurant' | 'coffee' | 'grocery' | 'park' | 'museum' | 'other' | null;
      is_special: boolean; created_at: string;
      timer_started_at: string | null; timer_ended_at: string | null; timer_seconds: number | null;
    };
    const newMoment: Moment = {
      id: row.id, date: row.date, text: row.text ?? undefined, emoji: row.emoji ?? undefined,
      photos: row.photos || [], links: row.links || [], tags: row.tags || [],
      location: row.location_name ? { name: row.location_name, lat: row.location_lat!, lng: row.location_lng!, category: row.location_category || 'other' } : undefined,
      isSpecial: row.is_special, createdAt: row.created_at,
      timer_started_at: row.timer_started_at, timer_ended_at: row.timer_ended_at, timer_seconds: row.timer_seconds,
    };
    setMoments(prev => [newMoment, ...prev]);

    if (!hasTrackedFirstAction(user.id, 'moment_created')) {
      trackEvent('first_action', {
        action_type: 'moment_created',
      });
      markFirstActionTracked(user.id, 'moment_created');
    }
    
    return newMoment;
    } finally {
      pendingAddsRef.current.delete(addKey);
    }
  }, [user, isDemo]);

  const editMoment = useCallback(async (id: string, updates: MomentUpdates) => {
    if (isDemo) {
      setMoments(prev => prev.map(m => {
        if (m.id !== id) return m;
        const next = { ...m, ...updates };
        if (updates.location === null) delete next.location;
        return next;
      }));
      return;
    }

    const dbUpdates: Record<string, unknown> = {};
    if (updates.text !== undefined) dbUpdates.text = updates.text || null;
    if (updates.emoji !== undefined) dbUpdates.emoji = updates.emoji || null;
    if (updates.photos !== undefined) {
      const photos = uniquePhotos(updates.photos);
      if (user && photos.some(p => p.startsWith('data:'))) {
        dbUpdates.photos = await uploadPhotos(user.id, photos);
      } else { dbUpdates.photos = photos; }
    }
    if (updates.links !== undefined) dbUpdates.links = updates.links || [];
    if (updates.isSpecial !== undefined) dbUpdates.is_special = updates.isSpecial;
    if (updates.createdAt !== undefined) dbUpdates.created_at = updates.createdAt;
    if (updates.tags !== undefined) dbUpdates.tags = updates.tags || [];
    if (updates.timer_started_at !== undefined) dbUpdates.timer_started_at = updates.timer_started_at;
    if (updates.timer_ended_at !== undefined) dbUpdates.timer_ended_at = updates.timer_ended_at;
    if (updates.timer_seconds !== undefined) dbUpdates.timer_seconds = updates.timer_seconds;
    if (updates.location !== undefined) {
      dbUpdates.location_name = updates.location?.name || null;
      dbUpdates.location_lat = updates.location?.lat || null;
      dbUpdates.location_lng = updates.location?.lng || null;
      dbUpdates.location_category = updates.location?.category || null;
    }
    let { error } = await supabase.from('moments').update(dbUpdates as MomentUpdate).eq('id', id);
    if (error && updates.links !== undefined && isMissingMomentLinksColumn(error)) {
      const { links, ...fallbackUpdates } = dbUpdates;
      ({ error } = await supabase.from('moments').update(fallbackUpdates as MomentUpdate).eq('id', id));
    }
    if (error) { console.error('Failed to edit moment:', error); return; }
    setMoments(prev => prev.map(m => {
      if (m.id !== id) return m;
      const next = { ...m, ...updates };
      if (dbUpdates.photos !== undefined) next.photos = dbUpdates.photos as string[];
      if (updates.location === null) delete next.location;
      return next;
    }));
  }, [user, isDemo]);

  const deleteMoment = useCallback(async (id: string) => {
    if (isDemo) {
      setMoments(prev => prev.filter(m => m.id !== id));
      return;
    }
    const { error } = await supabase.from('moments').delete().eq('id', id);
    if (error) { console.error('Failed to delete moment:', error); return; }
    setMoments(prev => prev.filter(m => m.id !== id));
  }, [isDemo]);

  // Undo a just-deleted moment by re-inserting it with its original id & fields.
  const restoreMoment = useCallback(async (moment: Moment) => {
    setMoments(prev => {
      if (prev.some(m => m.id === moment.id)) return prev;
      return [moment, ...prev].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    });
    if (isDemo || !user) return;
    const baseInsert = {
      id: moment.id,
      user_id: user.id,
      date: moment.date,
      text: moment.text || null,
      emoji: moment.emoji || null,
      photos: moment.photos || [],
      tags: moment.tags || [],
      location_name: moment.location?.name || null,
      location_lat: moment.location?.lat || null,
      location_lng: moment.location?.lng || null,
      location_category: moment.location?.category || null,
      is_special: moment.isSpecial || false,
      created_at: moment.createdAt,
      timer_started_at: moment.timer_started_at || null,
      timer_ended_at: moment.timer_ended_at || null,
      timer_seconds: moment.timer_seconds || 0,
    };
    let { error } = await supabase.from('moments').insert({ ...baseInsert, links: moment.links || [] });
    if (error && isMissingMomentLinksColumn(error)) {
      ({ error } = await supabase.from('moments').insert(baseInsert));
    }
    if (error) {
      console.error('Failed to restore moment:', error);
      setMoments(prev => prev.filter(m => m.id !== moment.id));
    }
  }, [isDemo, user]);

  const getMomentsForDate = useCallback((date: string): Moment[] => {
    return moments.filter(m => m.date === date);
  }, [moments]);

  const getDayRecords = useCallback((): Map<string, DayRecord> => {
    const records = new Map<string, DayRecord>();
    moments.forEach(moment => {
      const existing = records.get(moment.date);
      if (existing) {
        existing.moments.push(moment);
        if (moment.photos.length > 0) existing.hasPhotos = true;
        if (moment.isSpecial) existing.hasSpecial = true;
      } else {
        records.set(moment.date, { date: moment.date, moments: [moment], hasPhotos: moment.photos.length > 0, hasSpecial: moment.isSpecial || false });
      }
    });
    return records;
  }, [moments]);

  const getRecordedDates = useCallback((): Set<string> => {
    return new Set(moments.map(m => m.date));
  }, [moments]);

  const getStats = useCallback(() => {
    const uniqueDates = new Set(moments.map(m => m.date));
    const uniquePlaces = new Set(moments.filter(m => m.location).map(m => m.location!.name));
    return { daysRecorded: uniqueDates.size, momentsCaptured: moments.length, placesVisited: uniquePlaces.size };
  }, [moments]);

  return {
    moments,
    allLocations,
    loading,
    addMoment, editMoment, deleteMoment, restoreMoment,
    getMomentsForDate, getDayRecords, getRecordedDates, getStats,
  };
}
