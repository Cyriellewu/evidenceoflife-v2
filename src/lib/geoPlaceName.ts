import type { GeoCoords } from '@/lib/geoCoords';

/** True when a label is just raw coordinates (never show these to users). */
export function isCoordLikeName(name: string): boolean {
  const t = name.trim();
  if (!t) return false;
  return /^-?\d{1,3}(?:\.\d+)?\s*,\s*-?\d{1,3}(?:\.\d+)?$/.test(t);
}

/** Replace empty / "Nearby" / lat,lng labels with a human fallback. */
export function sanitizePlaceName(name: string, fallback = 'Current location'): string {
  const t = name.trim();
  if (!t || t === 'Nearby' || isCoordLikeName(t)) return fallback;
  return t;
}

const EARTH_M = 6_371_000;

/** Great-circle distance in meters. */
export function haversineMeters(a: GeoCoords, b: GeoCoords): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Short distance label for nearby search results (maps-style). */
export function formatDistanceLabel(meters: number, lang: 'en' | 'zh' = 'en'): string {
  if (!Number.isFinite(meters) || meters < 0) return '';
  if (meters < 1000) {
    const m = Math.max(1, Math.round(meters));
    return lang === 'zh' ? `${m}米` : `${m} m`;
  }
  const km = meters / 1000;
  const rounded = km < 10 ? km.toFixed(1).replace(/\.0$/, '') : String(Math.round(km));
  return lang === 'zh' ? `${rounded}公里` : `${rounded} km`;
}
