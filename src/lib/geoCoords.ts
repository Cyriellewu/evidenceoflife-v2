const GEO_COORDS_KEY = 'eol-geo-coords';

export type GeoCoords = { lat: number; lng: number };

export function readCachedGeoCoords(): GeoCoords | null {
  try {
    const raw = sessionStorage.getItem(GEO_COORDS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { lat?: number; lng?: number };
    if (typeof parsed.lat !== 'number' || typeof parsed.lng !== 'number') return null;
    return { lat: parsed.lat, lng: parsed.lng };
  } catch {
    return null;
  }
}

export function writeCachedGeoCoords(coords: GeoCoords) {
  try {
    sessionStorage.setItem(GEO_COORDS_KEY, JSON.stringify({ ...coords, at: Date.now() }));
  } catch {
    /* private mode */
  }
}

/** Squared Euclidean distance — enough for relative nearby ranking. */
export function geoDist2(a: GeoCoords, b: GeoCoords): number {
  const dLat = a.lat - b.lat;
  const dLng = a.lng - b.lng;
  return dLat * dLat + dLng * dLng;
}

export function sortPlacesByDistance<T extends GeoCoords>(places: T[], origin: GeoCoords): T[] {
  return [...places].sort((a, b) => geoDist2(a, origin) - geoDist2(b, origin));
}
