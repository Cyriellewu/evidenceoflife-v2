import type { FeatureCollection, MultiPolygon } from 'geojson';

export interface NeighborhoodProperties {
  ntaname: string;
  boroname: string;
  ntatype: string;
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
