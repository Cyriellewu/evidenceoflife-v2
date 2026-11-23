/**
 * City name for a point on the Life Map.
 *
 * The map used to ask one edge function for every cluster, one at a time with
 * a 1.5 s pause, and only showed the names once ALL had answered — any
 * re-render in between threw the work away, so cards stayed "Area 3",
 * "Area 5"… Names are now looked up through the free Photon reverse API first
 * (edge function as fallback), remembered on the device, and reported one by
 * one.
 */
import { supabase } from '@/integrations/supabase/client';

const CACHE_KEY = 'eol-city-names-v1';
const CACHE_MAX = 400;

type PhotonCityProps = {
  city?: string;
  town?: string;
  village?: string;
  locality?: string;
  district?: string;
  county?: string;
  state?: string;
  country?: string;
  type?: string;
  name?: string;
};

/** Names that mean "we don't know": never show or cache them as a city. */
export function isUnknownCityName(name?: string | null): boolean {
  const n = (name ?? '').trim();
  return !n || /^(unknown|未知|current location|当前位置)$/i.test(n) || /^Area \d+$/.test(n);
}

/** Best city-level name in a Photon reverse result. */
export function pickCityFromPhoton(props: PhotonCityProps | undefined): string {
  if (!props) return '';
  // A result that IS a city/town carries its name in `name`, not `city`.
  const selfIsPlace = props.type === 'city' || props.type === 'town' || props.type === 'village';
  const candidates = [props.city, props.town, props.village, selfIsPlace ? props.name : '', props.locality, props.county, props.state];
  return candidates.map(v => (v ?? '').trim()).find(v => v && !isUnknownCityName(v)) ?? '';
}

/** Cache key: ~1 km cells, per language (names are localized). */
export function cityCacheKey(lat: number, lng: number, lang: string): string {
  return `${lang.startsWith('zh') ? 'zh' : 'en'}:${lat.toFixed(2)},${lng.toFixed(2)}`;
}

function readCache(): Record<string, string> {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function getCachedCityName(lat: number, lng: number, lang: string): string {
  const name = readCache()[cityCacheKey(lat, lng, lang)];
  return isUnknownCityName(name) ? '' : name;
}

function rememberCityName(lat: number, lng: number, lang: string, name: string) {
  try {
    const cache = readCache();
    cache[cityCacheKey(lat, lng, lang)] = name;
    const keys = Object.keys(cache);
    for (const k of keys.slice(0, Math.max(0, keys.length - CACHE_MAX))) delete cache[k];
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* storage blocked — just don't cache */
  }
}

async function fetchJson(url: string, ms: number): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function photonCity(lat: number, lng: number, lang: string): Promise<string> {
  const params = new URLSearchParams({ lat: String(lat), lon: String(lng), lang: lang.startsWith('zh') ? 'zh' : 'en' });
  const json = (await fetchJson(`https://photon.komoot.io/reverse?${params.toString()}`, 6_000)) as {
    features?: Array<{ properties?: PhotonCityProps }>;
  };
  return pickCityFromPhoton(json.features?.[0]?.properties);
}

async function edgeCity(lat: number, lng: number, lang: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('geo', { body: { type: 'reverse', lat, lng, lang } });
  if (error) return '';
  const city = String(data?.city ?? '').trim();
  return isUnknownCityName(city) ? '' : city;
}

/** Resolve a city name; '' when no source knows. Cached per device. */
export async function resolveCityName(lat: number, lng: number, lang: string): Promise<string> {
  const cached = getCachedCityName(lat, lng, lang);
  if (cached) return cached;
  let name = '';
  try { name = await photonCity(lat, lng, lang); } catch { /* try the edge function */ }
  if (!name) {
    try { name = await edgeCity(lat, lng, lang); } catch { /* unknown */ }
  }
  if (name) rememberCityName(lat, lng, lang, name);
  return name;
}
