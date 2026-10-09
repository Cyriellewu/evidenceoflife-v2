import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { isUniqueViolation, stableWriteUuid } from '@/lib/writeSafety';

export interface City {
  id: string;
  name: string;
  country: string | null;
  lat: number;
  lng: number;
}

export interface Place {
  id: string;
  city_id: string;
  name: string;
  category: string;
  lat: number;
  lng: number;
}

export interface Visit {
  id: string;
  place_id: string;
  moment_id: string | null;
  date: string;
  note: string | null;
  photos: string[];
}

export interface PlaceWithVisits extends Place {
  visits: Visit[];
  cityName: string;
}

export interface CityWithPlaces extends City {
  places: PlaceWithVisits[];
  totalVisits: number;
}

function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

// Visits only keep storage references. Inline data: URLs are multi-MB and
// belong in Storage via the moment upload path, never in a table row.
function uniquePhotos(photos?: string[]): string[] {
  return Array.from(new Set((photos || []).filter(photo =>
    typeof photo === 'string' && photo.trim().length > 0 && !photo.startsWith('data:'))));
}

export function usePlaces() {
  const { user, isDemo } = useAuth();
  const [cities, setCities] = useState<CityWithPlaces[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!user || isDemo) {
      setCities([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const [citiesRes, placesRes, visitsRes] = await Promise.all([
        supabase.from('cities').select('*').eq('user_id', user.id),
        supabase.from('places').select('*').eq('user_id', user.id),
        // Skip visits.photos: legacy rows hold multi-MB base64 images, and pulling
        // them on every refresh exhausted the egress quota. The map falls back to
        // the linked moment's storage photos instead.
        supabase.from('visits').select('id, place_id, moment_id, date, note').eq('user_id', user.id).order('created_at', { ascending: false }),
      ]);

      const rawCities = (citiesRes.data || []) as City[];
      const rawPlaces = (placesRes.data || []) as Place[];
      const rawVisits = ((visitsRes.data || []) as Omit<Visit, 'photos'>[]).map(v => ({ ...v, photos: [] }));

      const result: CityWithPlaces[] = rawCities.map((c) => {
        const cPlaces = rawPlaces
          .filter((p) => p.city_id === c.id)
          .map((p) => ({
            ...p,
            cityName: c.name,
            visits: rawVisits.filter((v) => v.place_id === p.id),
          }));
        return {
          ...c,
          places: cPlaces,
          totalVisits: cPlaces.reduce((s: number, p: PlaceWithVisits) => s + p.visits.length, 0),
        };
      });

      setCities(result);
    } catch (err) {
      console.error('Failed to fetch places (exception):', err);
      setCities([]);
    } finally {
      setLoading(false);
    }
  }, [user, isDemo]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Find or create a city by name (using reverse geocode city name)
  const findOrCreateCity = useCallback(async (cityName: string, lat: number, lng: number, country?: string): Promise<string | null> => {
    if (!user || isDemo) return null;
    // Check existing
    const existing = cities.find(c => sameName(c.name, cityName));
    if (existing) return existing.id;

    const { data: existingRows } = await supabase
      .from('cities')
      .select('id, name')
      .eq('user_id', user.id);
    const existingFromDb = ((existingRows || []) as Pick<City, 'id' | 'name'>[])
      .find(city => sameName(city.name, cityName));
    if (existingFromDb) return existingFromDb.id;

    const cityId = await stableWriteUuid('city', user.id, cityName.trim().toLowerCase());
    const { data, error } = await supabase
      .from('cities')
      .upsert({ id: cityId, user_id: user.id, name: cityName.trim(), country: country || null, lat, lng }, { onConflict: 'id' })
      .select()
      .single();
    if (error) {
      // Unique constraint - try select again
      if (isUniqueViolation(error)) {
        const { data: ex } = await supabase.from('cities').select('id').eq('user_id', user.id).eq('name', cityName.trim()).single();
        return ex?.id || null;
      }
      console.error('Failed to create city:', error);
      return null;
    }
    return data?.id || null;
  }, [user, isDemo, cities]);

  // Find or create a place
  const findOrCreatePlace = useCallback(async (
    cityId: string, name: string, lat: number, lng: number, category: string
  ): Promise<string | null> => {
    if (!user || isDemo) return null;
    // Check existing place in city with similar name
    const city = cities.find(c => c.id === cityId);
    const existing = city?.places.find(p => sameName(p.name, name));
    if (existing) {
      // If the user corrected the address, keep the place row aligned so map pins move.
      const moved = Math.abs(existing.lat - lat) > 0.00001 || Math.abs(existing.lng - lng) > 0.00001;
      if (moved || existing.category !== category || existing.name !== name) {
        await supabase
          .from('places')
          .update({ name, category, lat, lng })
          .eq('id', existing.id)
          .eq('user_id', user.id);
      }
      return existing.id;
    }

    const { data: existingRows } = await supabase
      .from('places')
      .select('id, name, lat, lng, category')
      .eq('user_id', user.id)
      .eq('city_id', cityId);
    const existingFromDb = ((existingRows || []) as Pick<Place, 'id' | 'name' | 'lat' | 'lng' | 'category'>[]).find(p => sameName(p.name, name));
    if (existingFromDb) {
      const moved = Math.abs(existingFromDb.lat - lat) > 0.00001 || Math.abs(existingFromDb.lng - lng) > 0.00001;
      if (moved || existingFromDb.category !== category || existingFromDb.name !== name) {
        await supabase
          .from('places')
          .update({ name, category, lat, lng })
          .eq('id', existingFromDb.id)
          .eq('user_id', user.id);
      }
      return existingFromDb.id;
    }

    const placeId = await stableWriteUuid('place', user.id, cityId, name.trim().toLowerCase());
    const { data, error } = await supabase
      .from('places')
      .upsert({ id: placeId, user_id: user.id, city_id: cityId, name, category, lat, lng }, { onConflict: 'id' })
      .select()
      .single();
    if (error) { console.error('Failed to create place:', error); return null; }
    return data?.id || null;
  }, [user, isDemo, cities]);

  // Create or update the visit bound to a moment. A moment should only own one map visit.
  const createVisit = useCallback(async (
    placeId: string, date: string, momentId?: string, note?: string, photos?: string[]
  ) => {
    if (!user || isDemo) return;
    const payload = {
      user_id: user.id,
      place_id: placeId,
      moment_id: momentId || null,
      date,
      note: note || null,
      photos: uniquePhotos(photos),
    };

    if (momentId) {
      const { data: existingVisits } = await supabase
        .from('visits')
        .select('id')
        .eq('user_id', user.id)
        .eq('moment_id', momentId)
        .order('created_at', { ascending: true });

      const existing = (existingVisits || []) as { id: string }[];
      if (existing.length > 0) {
        await supabase.from('visits').update(payload).eq('id', existing[0].id).eq('user_id', user.id);
        const duplicates = existing.slice(1).map(visit => visit.id);
        if (duplicates.length > 0) {
          await supabase.from('visits').delete().eq('user_id', user.id).in('id', duplicates);
        }
        return;
      }
    }

    if (momentId) {
      // A visit is a projection of one moment. Reusing the moment UUID makes
      // concurrent tabs and ambiguous retries converge on the same visit row.
      await supabase.from('visits').upsert({ ...payload, id: momentId }, { onConflict: 'id' });
      return;
    }

    await supabase.from('visits').insert(payload);
  }, [user, isDemo]);

  // High-level: keep places/visits in sync with the source moment.
  const syncVisitFromMoment = useCallback(async (
    location: { name: string; lat: number; lng: number; category?: string } | null | undefined,
    date: string,
    momentId: string,
    note?: string,
    photos?: string[]
  ) => {
    if (!user || isDemo) return;
    try {
      if (!location?.name || !Number.isFinite(location.lat) || !Number.isFinite(location.lng)) {
        await supabase.from('visits').delete().eq('user_id', user.id).eq('moment_id', momentId);
        await fetchAll();
        return;
      }

      // Resolve city name via reverse geocode
      const { data: geoData } = await supabase.functions.invoke('geo', {
        body: { type: 'reverse', lat: location.lat, lng: location.lng },
      });
      const cityName = geoData?.city || 'Unknown';
      const cityLat = location.lat; // approximate city center
      const cityLng = location.lng;

      const cityId = await findOrCreateCity(cityName, cityLat, cityLng);
      if (!cityId) return;

      const placeId = await findOrCreatePlace(cityId, location.name, location.lat, location.lng, location.category || 'other');
      if (!placeId) return;

      await createVisit(placeId, date, momentId, note, photos);
      await fetchAll(); // refresh
    } catch (err) {
      console.warn('Failed to sync visit from moment:', err);
    }
  }, [user, isDemo, findOrCreateCity, findOrCreatePlace, createVisit, fetchAll]);

  // Backwards-compatible name for callers that create a brand new moment.
  const recordVisitFromMoment = useCallback(async (
    location: { name: string; lat: number; lng: number; category?: string },
    date: string,
    momentId: string,
    photos?: string[]
  ) => {
    await syncVisitFromMoment(location, date, momentId, undefined, photos);
  }, [syncVisitFromMoment]);

  const deleteVisit = useCallback(async (visitId: string) => {
    if (!user || isDemo) return;
    await supabase.from('visits').delete().eq('id', visitId);
    await fetchAll();
  }, [user, isDemo, fetchAll]);

  const deletePlace = useCallback(async (placeId: string) => {
    if (!user || isDemo) return;
    await supabase.from('places').delete().eq('id', placeId);
    await fetchAll();
  }, [user, isDemo, fetchAll]);

  const deleteCity = useCallback(async (cityId: string) => {
    if (!user || isDemo) return;
    await supabase.from('cities').delete().eq('id', cityId);
    await fetchAll();
  }, [user, isDemo, fetchAll]);

  return {
    cities, loading, fetchAll,
    findOrCreateCity, findOrCreatePlace, createVisit,
    recordVisitFromMoment, syncVisitFromMoment,
    deleteVisit, deletePlace, deleteCity,
  };
}
