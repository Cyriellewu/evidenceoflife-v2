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

/** Public Overpass mirrors — free, no API key. Prefer CORS-friendly hosts. */
const OVERPASS_ENDPOINTS = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://overpass-api.de/api/interpreter',
] as const;

const NEARBY_RADIUS_M = 1_500;

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

/** Map Overpass amenity/leisure/shop tags → app categories. */
export function overpassCategory(tags: Record<string, string | undefined>): string {
  const amenity = (tags.amenity || '').toLowerCase();
  const leisure = (tags.leisure || '').toLowerCase();
  const shop = (tags.shop || '').toLowerCase();
  const tourism = (tags.tourism || '').toLowerCase();
  if (/restaurant|fast_food|food_court/.test(amenity)) return 'restaurant';
  if (/cafe|coffee|bar|pub|biergarten/.test(amenity)) return 'coffee';
  if (/supermarket|convenience|mall|grocery/.test(shop)) return 'grocery';
  if (/park|garden|nature_reserve/.test(leisure)) return 'park';
  if (/museum|gallery/.test(tourism) || amenity === 'library' || amenity === 'theatre' || amenity === 'cinema') {
    return 'museum';
  }
  return 'other';
}

export type OverpassElement = {
  type?: string;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string>;
};

/** Pure mapper — unit-tested without hitting Overpass. */
export function mapOverpassElements(
  elements: OverpassElement[],
  origin: GeoCoords,
  limit = 8,
): GeoPlaceResult[] {
  const mapped: GeoPlaceResult[] = [];
  for (const el of elements) {
    const tags = el.tags ?? {};
    const rawName = (tags.name || tags['name:en'] || tags['name:zh'] || '').trim();
    if (!rawName) continue;
    const lat = Number(el.lat ?? el.center?.lat);
    const lng = Number(el.lon ?? el.center?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const city = (tags['addr:city'] || tags['addr:town'] || '').trim();
    const name = city && !rawName.includes(city)
      ? sanitizePlaceName(`${rawName}, ${city}`, rawName)
      : sanitizePlaceName(rawName, rawName);
    if (!name) continue;
    mapped.push({
      name,
      lat,
      lng,
      category: overpassCategory(tags),
      distance_m: Math.round(haversineMeters(origin, { lat, lng })),
      ...(city ? { city } : {}),
    });
  }
  mapped.sort((a, b) => (a.distance_m ?? 0) - (b.distance_m ?? 0));
  return mapped.slice(0, limit);
}

/** Public Photon API — free, no key, CORS-friendly (Komoot fair-use). */
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

function buildNearbyOverpassQuery(coords: GeoCoords, radiusM = NEARBY_RADIUS_M): string {
  const { lat, lng } = coords;
  // Named POIs only — cafe / restaurant / park within walking distance.
  return `
[out:json][timeout:15];
(
  node["name"]["amenity"="cafe"](around:${radiusM},${lat},${lng});
  node["name"]["amenity"="restaurant"](around:${radiusM},${lat},${lng});
  node["name"]["amenity"="fast_food"](around:${radiusM},${lat},${lng});
  node["name"]["leisure"="park"](around:${radiusM},${lat},${lng});
  way["name"]["leisure"="park"](around:${radiusM},${lat},${lng});
  node["name"]["shop"~"supermarket|convenience"](around:${radiusM},${lat},${lng});
);
out center 24;
`.trim();
}

async function overpassNearby(coords: GeoCoords, limit = 8): Promise<GeoPlaceResult[]> {
  // Simple urlencoded POST (no custom headers) so browsers skip CORS preflight.
  const body = new URLSearchParams({ data: buildNearbyOverpassQuery(coords) });
  let lastErr: unknown;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, { method: 'POST', body });
      if (!res.ok) throw new Error(`Overpass ${res.status}`);
      const json = (await res.json()) as { elements?: OverpassElement[] };
      return mapOverpassElements(json.elements ?? [], coords, limit);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Overpass nearby failed');
}

/**
 * Prefer free no-key Photon; fall back to the Nominatim edge proxy.
 * Neither path requires a paid API key.
 */
export async function searchPlaces(opts: SearchOpts): Promise<GeoPlaceResult[]> {
  const q = opts.q.trim();
  if (q.length < 2) return [];
  try {
    const photon = await photonSearch(opts);
    if (photon.length > 0) return photon;
  } catch {
    /* fall through */
  }
  return edgeSearch(opts);
}

export async function reversePlace(opts: ReverseOpts): Promise<GeoPlaceResult> {
  try {
    return await photonReverse(opts);
  } catch {
    return edgeReverse(opts);
  }
}

/**
 * Map-style “near me” recommendations when the user taps Use current with no query:
 * reverse for the best place underfoot, plus nearby named OSM POIs via Overpass
 * (free, no key). Falls back to Photon category searches if Overpass is down.
 */
export async function nearbyRecommendations(
  coords: GeoCoords,
  lang?: string,
): Promise<GeoPlaceResult[]> {
  const here = await reversePlace({ ...coords, lang });

  let nearby: GeoPlaceResult[] = [];
  try {
    nearby = await overpassNearby(coords, 8);
  } catch {
    const queries = lang?.startsWith('zh')
      ? ['咖啡', '餐厅', '公园']
      : ['cafe', 'restaurant', 'park'];
    const batches = await Promise.all(
      queries.map((q) =>
        searchPlaces({ q, limit: 4, coords }).catch(() => [] as GeoPlaceResult[]),
      ),
    );
    nearby = batches.flat();
  }

  const seen = new Set<string>();
  const out: GeoPlaceResult[] = [];
  const push = (r: GeoPlaceResult) => {
    const key = `${r.name}|${r.lat.toFixed(4)}|${r.lng.toFixed(4)}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(r);
  };

  push({ ...here, distance_m: 0 });
  for (const r of nearby) push(r);

  return out
    .sort((a, b) => (a.distance_m ?? 0) - (b.distance_m ?? 0))
    .slice(0, 8);
}
