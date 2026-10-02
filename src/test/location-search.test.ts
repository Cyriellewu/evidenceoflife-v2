import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  readCachedGeoCoords,
  writeCachedGeoCoords,
  sortPlacesByDistance,
} from '@/lib/geoCoords';

describe('geoCoords cache', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it('returns null when empty', () => {
    expect(readCachedGeoCoords()).toBeNull();
  });

  it('round-trips coords used to bias search + speed up Use current', () => {
    writeCachedGeoCoords({ lat: 40.7128, lng: -74.006 });
    expect(readCachedGeoCoords()).toEqual({ lat: 40.7128, lng: -74.006 });
  });

  it('ignores corrupt payloads', () => {
    sessionStorage.setItem('eol-geo-coords', '{not-json');
    expect(readCachedGeoCoords()).toBeNull();
  });
});

describe('sortPlacesByDistance', () => {
  it('sorts closer places first for joint input+current search', () => {
    const origin = { lat: 40.71, lng: -74.0 };
    const results = [
      { name: 'Far', lat: 34.05, lng: -118.24 },
      { name: 'Near', lat: 40.72, lng: -74.01 },
      { name: 'Mid', lat: 41.5, lng: -73.5 },
    ];
    expect(sortPlacesByDistance(results, origin).map((r) => r.name)).toEqual([
      'Near',
      'Mid',
      'Far',
    ]);
  });
});
