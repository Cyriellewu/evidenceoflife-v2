/**
 * Choosing the place for a quick capture.
 *
 * GPS fixes on a phone are often 20–60 m off and reverse geocoding returns an
 * address ("3333 Broadway") rather than the café you're in. When you're close
 * to a place you've already logged, reuse it: the name stays consistent and
 * the visit lands on the same pin. Otherwise fall back to the reverse result.
 */
export type CapturePlaceCategory = 'restaurant' | 'coffee' | 'grocery' | 'park' | 'museum' | 'other';
export interface CapturePlace { name: string; lat: number; lng: number; category: CapturePlaceCategory }
export interface KnownPlace { name: string; lat: number; lng: number; category?: string; visits?: number }

/** Snap to a known place within this distance (metres). */
export const SNAP_METERS = 60;
/** Offer known places within this distance as alternatives. */
export const NEARBY_METERS = 200;

export function metersBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

const CATEGORIES = new Set(['restaurant', 'coffee', 'grocery', 'park', 'museum', 'other']);
const asCategory = (c?: string): CapturePlaceCategory => (c && CATEGORIES.has(c) ? c : 'other') as CapturePlaceCategory;

/**
 * The default place plus up to `limit` one-tap alternatives. Known places
 * close by rank first (nearest, then most visited); the reverse-geocoded
 * address is always offered unless it duplicates a known name.
 */
export function capturePlaceOptions(
  here: { lat: number; lng: number },
  known: KnownPlace[],
  reverse: CapturePlace | null,
  limit = 4,
): { chosen: CapturePlace | null; options: CapturePlace[] } {
  const nearby = known
    .filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng))
    .map(p => ({ p, d: metersBetween(here, p) }))
    .filter(x => x.d <= NEARBY_METERS)
    .sort((a, b) => a.d - b.d || (b.p.visits ?? 0) - (a.p.visits ?? 0));

  const seen = new Set<string>();
  const options: CapturePlace[] = [];
  const push = (place: CapturePlace) => {
    const key = place.name.trim().toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    options.push(place);
  };
  for (const { p } of nearby) push({ name: p.name, lat: p.lat, lng: p.lng, category: asCategory(p.category) });
  if (reverse) push(reverse);

  const snapped = nearby[0] && nearby[0].d <= SNAP_METERS ? options[0] : null;
  const chosen = snapped ?? reverse ?? options[0] ?? null;
  // Keep the chosen place first so the chip row reads "current choice, then others".
  const ordered = chosen ? [chosen, ...options.filter(o => o !== chosen)] : options;
  return { chosen, options: ordered.slice(0, limit) };
}
