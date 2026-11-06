import type { FeatureCollection, MultiPolygon } from 'geojson';

export interface NeighborhoodProperties {
  ntaname: string;
  boroname: string;
  ntatype: string;
  /** Set by visitedNeighborhoods: how many of the user's places fall inside. */
  placeCount?: number;
}

export type NeighborhoodCollection = FeatureCollection<MultiPolygon, NeighborhoodProperties>;

// NYC Department of City Planning, 2020 Neighborhood Tabulation Areas.
// The geometry is simplified server-side so the learning overlay stays light
// enough for a city map while preserving recognizable neighborhood shapes.
export const NYC_NEIGHBORHOODS_URL =
  'https://data.cityofnewyork.us/resource/9nt8-h7nd.geojson' +
  '?$select=ntaname,boroname,ntatype,simplify_preserve_topology(the_geom,0.0002)%20as%20the_geom' +
  '&$where=ntatype%3D%270%27&$limit=500';

let nycNeighborhoodsPromise: Promise<NeighborhoodCollection> | null = null;

export function isNewYorkCity(city: { cityName?: string; centerLat: number; centerLng: number } | null | undefined) {
  if (!city) return false;

  const normalizedName = (city.cityName || '').trim().toLowerCase();
  const nameMatches = normalizedName === 'new york'
    || normalizedName === 'new york city'
    || normalizedName === 'nyc'
    || normalizedName === '纽约'
    || normalizedName === '纽约市';
  const insideCityBounds = city.centerLat >= 40.48
    && city.centerLat <= 40.93
    && city.centerLng >= -74.28
    && city.centerLng <= -73.67;

  return nameMatches || insideCityBounds;
}

export async function loadNewYorkNeighborhoods(): Promise<NeighborhoodCollection> {
  if (!nycNeighborhoodsPromise) {
    nycNeighborhoodsPromise = fetch(NYC_NEIGHBORHOODS_URL)
      .then(async (response) => {
        if (!response.ok) throw new Error(`Neighborhood request failed (${response.status})`);
        return response.json() as Promise<NeighborhoodCollection>;
      })
      .then((collection) => ({
        ...collection,
        features: collection.features.filter((feature) => (
          feature.geometry?.type === 'MultiPolygon'
          && typeof feature.properties?.ntaname === 'string'
          && feature.properties.ntaname.trim().length > 0
        )),
      }))
      .catch((error) => {
        // A transient network failure should not poison every later attempt.
        nycNeighborhoodsPromise = null;
        throw error;
      });
  }

  return nycNeighborhoodsPromise;
}

type Ring = number[][];

/** Ray casting on one ring of [lng, lat] pairs. */
function inRing(lng: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Point in a MultiPolygon (outer ring in, holes out). */
export function multiPolygonContains(coords: Ring[][], lng: number, lat: number): boolean {
  return coords.some(([outer, ...holes]) => outer && inRing(lng, lat, outer) && !holes.some(h => inRing(lng, lat, h)));
}

/**
 * Only the neighborhoods the user has actually been to, with how many places
 * fall in each. The map shows these instead of every NYC boundary.
 */
export function visitedNeighborhoods(
  collection: NeighborhoodCollection,
  points: Array<{ lat: number; lng: number }>,
): NeighborhoodCollection {
  const features = collection.features
    .map(feature => {
      const count = points.filter(p => multiPolygonContains(feature.geometry.coordinates as Ring[][], p.lng, p.lat)).length;
      return { ...feature, properties: { ...feature.properties, placeCount: count } };
    })
    .filter(feature => (feature.properties.placeCount ?? 0) > 0);
  return { ...collection, features };
}
