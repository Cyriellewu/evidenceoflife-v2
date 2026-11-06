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

/**
 * NYC's official tabulation areas are finer than how people talk about the
 * city ("Upper West Side (Central)", "Upper West Side-Lincoln Square").
 * Fold them into the everyday area name: text before " (" or the first "-".
 */
export function areaNameFor(ntaname: string): string {
  return ntaname.split(' (')[0].split('-')[0].trim();
}

const AREA_NAMES_ZH: Record<string, string> = {
  'Upper West Side': '上西区',
  'Upper East Side': '上东区',
  'Midtown': '中城',
  'Midtown South': '中城南',
  'Harlem': '哈莱姆',
  'East Harlem': '东哈莱姆',
  'Morningside Heights': '晨边高地',
  'Hamilton Heights': '汉密尔顿高地',
  'Washington Heights': '华盛顿高地',
  'Chelsea': '切尔西',
  "Hell's Kitchen": '地狱厨房',
  'Greenwich Village': '格林威治村',
  'West Village': '西村',
  'East Village': '东村',
  'SoHo': '苏荷',
  'Chinatown': '唐人街',
  'Lower East Side': '下东区',
  'Financial District': '金融区',
  'Tribeca': '翠贝卡',
  'Murray Hill': '默里山',
  'Gramercy': '格拉梅西',
  'Williamsburg': '威廉斯堡',
  'Greenpoint': '绿点',
  'DUMBO': '丹波',
  'Downtown Brooklyn': '布鲁克林市中心',
  'Park Slope': '公园坡',
  'Flushing': '法拉盛',
  'Long Island City': '长岛市',
  'Astoria': '阿斯托利亚',
  'Jamaica': '牙买加',
};

export function localizedAreaName(area: string, lang: string): string {
  return lang.startsWith('zh') ? AREA_NAMES_ZH[area] ?? area : area;
}

export interface VisitedArea {
  name: string;
  borough: string;
  placeCount: number;
  /** [lat, lng] label anchor: centre of the area's bounding box. */
  anchor: [number, number];
  features: NeighborhoodCollection['features'];
}

/** Visited neighborhoods grouped into everyday areas, most-visited first. */
export function visitedAreas(
  collection: NeighborhoodCollection,
  points: Array<{ lat: number; lng: number }>,
): VisitedArea[] {
  const areas = new Map<string, VisitedArea>();
  for (const feature of collection.features) {
    const inside = points.filter(p => multiPolygonContains(feature.geometry.coordinates as Ring[][], p.lng, p.lat)).length;
    if (inside === 0) continue;
    const name = areaNameFor(feature.properties.ntaname);
    const area = areas.get(name) ?? { name, borough: feature.properties.boroname, placeCount: 0, anchor: [0, 0], features: [] };
    area.placeCount += inside;
    area.features.push(feature);
    areas.set(name, area);
  }
  return [...areas.values()]
    .map(area => {
      let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
      for (const f of area.features) {
        for (const polygon of f.geometry.coordinates as Ring[][]) {
          for (const [lng, lat] of polygon[0] ?? []) {
            minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
            minLng = Math.min(minLng, lng); maxLng = Math.max(maxLng, lng);
          }
        }
      }
      return { ...area, anchor: [(minLat + maxLat) / 2, (minLng + maxLng) / 2] as [number, number] };
    })
    .sort((a, b) => b.placeCount - a.placeCount);
}
