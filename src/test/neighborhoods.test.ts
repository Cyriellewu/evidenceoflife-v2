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
