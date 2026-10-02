import { supabase } from '@/integrations/supabase/client';
import { haversineMeters, sanitizePlaceName } from '@/lib/geoPlaceName';
import type { GeoCoords } from '@/lib/geoCoords';

export type GeoPlaceResult = {
  name: string;
  lat: number;
  lng: number;
  category: string;
  distance_m?: number;
  city?: string;
};

type SearchOpts = {
  q: string;
  limit?: number;
  coords?: GeoCoords | null;
};

type ReverseOpts = {
  lat: number;
  lng: number;
  lang?: string;
};

type PhotonProps = {
  name?: string;
  street?: string;
  housenumber?: string;
  city?: string;
  town?: string;
  village?: string;
  state?: string;
  country?: string;
  osm_value?: string;
  osm_key?: string;
  type?: string;
};

function photonLabel(props: PhotonProps): string {
  const primary =
    props.name ||
    [props.housenumber, props.street].filter(Boolean).join(' ').trim() ||
    props.city ||
    props.town ||
    props.village ||
    '';
  const city = props.city || props.town || props.village || props.state || '';
  if (primary && city && primary !== city && !primary.includes(city)) {
    return sanitizePlaceName(`${primary}, ${city}`, primary);
  }
  return sanitizePlaceName(primary || city, '');
}

function photonCategory(props: PhotonProps): string {
  const key = `${props.osm_key || ''} ${props.osm_value || ''} ${props.type || ''}`.toLowerCase();
  if (/restaurant|fast_food|food/.test(key)) return 'restaurant';
  if (/cafe|coffee|bar|pub|tea/.test(key)) return 'coffee';
  if (/shop|convenience|supermarket|mall/.test(key)) return 'grocery';
  if (/park|garden|nature|forest/.test(key)) return 'park';
  if (/museum|gallery|theatre|cinema|library/.test(key)) return 'museum';
  return 'other';
}

/** Public Photon API — CORS-friendly Nominatim-style fallback when the geo edge is down. */
async function photonSearch(opts: SearchOpts): Promise<GeoPlaceResult[]> {
  const limit = Math.max(1, Math.min(opts.limit ?? 8, 12));
  const params = new URLSearchParams({
    q: opts.q,
    limit: String(limit),
    lang: 'en',
  });
  if (opts.coords) {
    params.set('lat', String(opts.coords.lat));
    params.set('lon', String(opts.coords.lng));
  }
  const res = await fetch(`https://photon.komoot.io/api/?${params.toString()}`);
  if (!res.ok) throw new Error(`Photon search failed: ${res.status}`);
  const json = (await res.json()) as {
    features?: Array<{
      geometry?: { coordinates?: [number, number] };
      properties?: PhotonProps;
    }>;
  };

  const origin = opts.coords ?? null;
  const mapped: GeoPlaceResult[] = (json.features ?? [])
    .map((f) => {
      const [lng, lat] = f.geometry?.coordinates ?? [];
      const props = f.properties ?? {};
      const name = photonLabel(props);
      if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      const distance_m = origin
        ? Math.round(haversineMeters(origin, { lat, lng }))
        : undefined;
      return {
        name,
        lat,
        lng,
        category: photonCategory(props),
        ...(distance_m !== undefined ? { distance_m } : {}),
        city: props.city || props.town || props.village || '',
      } as GeoPlaceResult;
    })
    .filter((r): r is GeoPlaceResult => r !== null);

  if (origin) {
    mapped.sort((a, b) => (a.distance_m ?? 0) - (b.distance_m ?? 0));
  }
  return mapped.slice(0, limit);
}

async function photonReverse(opts: ReverseOpts): Promise<GeoPlaceResult> {
  const fallback = opts.lang?.startsWith('zh') ? '当前位置' : 'Current location';
  const params = new URLSearchParams({
    lat: String(opts.lat),
    lon: String(opts.lng),
    lang: opts.lang?.startsWith('zh') ? 'zh' : 'en',
  });
  const res = await fetch(`https://photon.komoot.io/reverse?${params.toString()}`);
  if (!res.ok) throw new Error(`Photon reverse failed: ${res.status}`);
  const json = (await res.json()) as {
    features?: Array<{
      geometry?: { coordinates?: [number, number] };
      properties?: PhotonProps;
    }>;
  };
  const feature = json.features?.[0];
  const props = feature?.properties ?? {};
  const [lng, lat] = feature?.geometry?.coordinates ?? [opts.lng, opts.lat];
  const name = photonLabel(props) || fallback;
  return {
    name,
    lat: Number.isFinite(lat) ? lat : opts.lat,
    lng: Number.isFinite(lng) ? lng : opts.lng,
    category: photonCategory(props),
    city: props.city || props.town || props.village || '',
    distance_m: 0,
  };
}

async function edgeSearch(opts: SearchOpts): Promise<GeoPlaceResult[]> {
  const body: Record<string, unknown> = {
    type: 'search',
    q: opts.q,
    limit: opts.limit ?? 8,
  };
  if (opts.coords) {
    body.lat = opts.coords.lat;
    body.lng = opts.coords.lng;
  }
  const { data, error } = await supabase.functions.invoke('geo', { body });
  if (error) throw error;
  return (data?.results ?? [])
    .map((r: Record<string, unknown>) => ({
      name: sanitizePlaceName(String(r.name ?? ''), ''),
      lat: Number(r.lat),
      lng: Number(r.lng),
      category: String(r.category || 'other'),
      distance_m: typeof r.distance_m === 'number' ? r.distance_m : undefined,
    }))
    .filter((r: GeoPlaceResult) => r.name && Number.isFinite(r.lat) && Number.isFinite(r.lng));
}

async function edgeReverse(opts: ReverseOpts): Promise<GeoPlaceResult> {
  const fallback = opts.lang?.startsWith('zh') ? '当前位置' : 'Current location';
  const { data, error } = await supabase.functions.invoke('geo', {
    body: { type: 'reverse', lat: opts.lat, lng: opts.lng, lang: opts.lang },
  });
  if (error) throw error;
  const name = sanitizePlaceName(String(data?.name ?? ''), '');
  const city = sanitizePlaceName(String(data?.city ?? ''), '');
  return {
    name: name || city || fallback,
    lat: opts.lat,
    lng: opts.lng,
    category: String(data?.category || 'other'),
    city: city || undefined,
    distance_m: 0,
  };
}

/** Prefer the geo edge; fall back to Photon so Use current / nearby still works offline-of-edge. */
export async function searchPlaces(opts: SearchOpts): Promise<GeoPlaceResult[]> {
  const q = opts.q.trim();
  if (q.length < 2) return [];
  try {
    const edge = await edgeSearch(opts);
    if (edge.length > 0) return edge;
  } catch {
    /* fall through */
  }
  return photonSearch(opts);
}

export async function reversePlace(opts: ReverseOpts): Promise<GeoPlaceResult> {
  try {
    return await edgeReverse(opts);
  } catch {
    return photonReverse(opts);
  }
}

/**
 * Map-style “near me” recommendations when the user taps Use current with no query:
 * reverse for the best place underfoot, plus a few nearby named hits.
 */
export async function nearbyRecommendations(
  coords: GeoCoords,
  lang?: string,
): Promise<GeoPlaceResult[]> {
  const here = await reversePlace({ ...coords, lang });
  const queries = lang?.startsWith('zh')
    ? ['咖啡', '餐厅', '公园']
    : ['cafe', 'restaurant', 'park'];

  const batches = await Promise.all(
    queries.map((q) =>
      searchPlaces({ q, limit: 4, coords }).catch(() => [] as GeoPlaceResult[]),
    ),
  );

  const seen = new Set<string>();
  const out: GeoPlaceResult[] = [];
  const push = (r: GeoPlaceResult) => {
    const key = `${r.name}|${r.lat.toFixed(4)}|${r.lng.toFixed(4)}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(r);
  };

  push({ ...here, distance_m: 0 });
  for (const batch of batches) {
    for (const r of batch) push(r);
  }

  return out
    .sort((a, b) => (a.distance_m ?? 0) - (b.distance_m ?? 0))
    .slice(0, 8);
}
