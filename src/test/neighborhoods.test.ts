import { describe, expect, it } from 'vitest';
import { isNewYorkCity, NYC_NEIGHBORHOODS_URL } from '@/lib/neighborhoods';

describe('neighborhood learning layer', () => {
  it('recognizes New York names and coordinates', () => {
    expect(isNewYorkCity({ cityName: 'New York', centerLat: 40.75, centerLng: -73.98 })).toBe(true);
    expect(isNewYorkCity({ cityName: '纽约市', centerLat: 0, centerLng: 0 })).toBe(true);
    expect(isNewYorkCity({ cityName: 'Area 1', centerLat: 40.72, centerLng: -74.01 })).toBe(true);
    expect(isNewYorkCity({ cityName: 'Boston', centerLat: 42.36, centerLng: -71.06 })).toBe(false);
  });

  it('uses the official NYC Open Data NTA dataset with simplified residential geometry', () => {
    expect(NYC_NEIGHBORHOODS_URL).toContain('data.cityofnewyork.us/resource/9nt8-h7nd.geojson');
    expect(NYC_NEIGHBORHOODS_URL).toContain('simplify_preserve_topology');
    expect(NYC_NEIGHBORHOODS_URL).toContain('ntatype%3D%270%27');
  });
});

import { multiPolygonContains, visitedNeighborhoods, type NeighborhoodCollection } from '@/lib/neighborhoods';

const square = (x: number, y: number) => [[[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1], [x, y]]];
const collection = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { ntaname: 'Upper East Side', boroname: 'Manhattan', ntatype: '0' }, geometry: { type: 'MultiPolygon', coordinates: [square(0, 0)] } },
    { type: 'Feature', properties: { ntaname: 'Upper West Side', boroname: 'Manhattan', ntatype: '0' }, geometry: { type: 'MultiPolygon', coordinates: [square(2, 0)] } },
    { type: 'Feature', properties: { ntaname: 'Astoria', boroname: 'Queens', ntatype: '0' }, geometry: { type: 'MultiPolygon', coordinates: [square(4, 0)] } },
  ],
} as unknown as NeighborhoodCollection;

describe('visited neighborhoods', () => {
  it('tests points against polygons, honouring holes', () => {
    const withHole = [[[[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]], [[1, 1], [3, 1], [3, 3], [1, 3], [1, 1]]]];
    expect(multiPolygonContains(withHole, 0.5, 0.5)).toBe(true);
    expect(multiPolygonContains(withHole, 2, 2)).toBe(false);
  });

  it('keeps only neighborhoods that contain a visited place, with counts', () => {
    const result = visitedNeighborhoods(collection, [
      { lng: 0.5, lat: 0.5 }, { lng: 0.2, lat: 0.8 }, { lng: 2.5, lat: 0.5 },
    ]);
    expect(result.features.map(f => [f.properties.ntaname, f.properties.placeCount])).toEqual([
      ['Upper East Side', 2], ['Upper West Side', 1],
    ]);
  });
});

import { areaNameFor, localizedAreaName, visitedAreas } from '@/lib/neighborhoods';

describe('everyday areas', () => {
  it('folds official tabulation names into everyday area names', () => {
    expect(areaNameFor('Upper West Side (Central)')).toBe('Upper West Side');
    expect(areaNameFor('Upper West Side-Lincoln Square')).toBe('Upper West Side');
    expect(areaNameFor('Morningside Heights')).toBe('Morningside Heights');
    expect(localizedAreaName('Upper East Side', 'zh')).toBe('上东区');
    expect(localizedAreaName('Bushwick', 'zh')).toBe('Bushwick');
  });

  it('groups visited blocks into one area with a combined count', () => {
    const blocks = {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: { ntaname: 'Upper West Side (Central)', boroname: 'Manhattan', ntatype: '0' }, geometry: { type: 'MultiPolygon', coordinates: [square(0, 0)] } },
        { type: 'Feature', properties: { ntaname: 'Upper West Side-Lincoln Square', boroname: 'Manhattan', ntatype: '0' }, geometry: { type: 'MultiPolygon', coordinates: [square(0, 1)] } },
        { type: 'Feature', properties: { ntaname: 'Astoria (Central)', boroname: 'Queens', ntatype: '0' }, geometry: { type: 'MultiPolygon', coordinates: [square(4, 0)] } },
      ],
    } as unknown as NeighborhoodCollection;
    const areas = visitedAreas(blocks, [{ lng: 0.5, lat: 0.5 }, { lng: 0.5, lat: 1.5 }, { lng: 4.5, lat: 0.5 }, { lng: 9, lat: 9 }]);
    expect(areas.map(a => [a.name, a.placeCount, a.features.length])).toEqual([
      ['Upper West Side', 2, 2], ['Astoria', 1, 1],
    ]);
    expect(areas[0].anchor).toEqual([1, 0.5]);
  });
});

import { areaColorIndexes } from '@/lib/neighborhoods';

describe('area colours', () => {
  it('never gives neighbouring areas the same colour', () => {
    const blocks = {
      type: 'FeatureCollection',
      features: [0, 1, 2, 3, 4, 5].map(i => ({
        type: 'Feature',
        properties: { ntaname: `Area ${i}`, boroname: 'Manhattan', ntatype: '0' },
        geometry: { type: 'MultiPolygon', coordinates: [square(0, i)] },
      })),
    } as unknown as NeighborhoodCollection;
    // Six stacked squares, each touching the next; one visit in each.
    const areas = visitedAreas(blocks, [0, 1, 2, 3, 4, 5].map(i => ({ lng: 0.5, lat: i + 0.5 })));
    const byName = new Map(areas.map((a, i) => [a.name, i]));
    const colors = areaColorIndexes(areas, 5);
    for (let i = 0; i < 5; i++) {
      expect(colors[byName.get(`Area ${i}`)!]).not.toBe(colors[byName.get(`Area ${i + 1}`)!]);
    }
  });
});
