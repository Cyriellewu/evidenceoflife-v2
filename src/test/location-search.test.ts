import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  readCachedGeoCoords,
  writeCachedGeoCoords,
  sortPlacesByDistance,
} from '@/lib/geoCoords';
import {
  formatDistanceLabel,
  haversineMeters,
  isCoordLikeName,
  sanitizePlaceName,
  splitPlaceLabel,
} from '@/lib/geoPlaceName';

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

describe('geoPlaceName', () => {
  it('rejects raw lat,lng labels users do not want', () => {
    expect(isCoordLikeName('40.7128, -74.0060')).toBe(true);
    expect(isCoordLikeName('39.9042,116.4074')).toBe(true);
    expect(isCoordLikeName('Starbucks, Beijing')).toBe(false);
  });

  it('sanitizes coords / Nearby into a human fallback', () => {
    expect(sanitizePlaceName('40.7128, -74.0060')).toBe('Current location');
    expect(sanitizePlaceName('Nearby')).toBe('Current location');
    expect(sanitizePlaceName('  ')).toBe('Current location');
    expect(sanitizePlaceName('Blue Bottle Coffee, Oakland')).toBe('Blue Bottle Coffee, Oakland');
  });

  it('ranks nearer places first via haversine for maps-style recommendations', () => {
    const origin = { lat: 39.9042, lng: 116.4074 };
    const near = { lat: 39.91, lng: 116.41 };
    const far = { lat: 31.23, lng: 121.47 };
    expect(haversineMeters(origin, near)).toBeLessThan(haversineMeters(origin, far));
    expect(haversineMeters(origin, near)).toBeLessThan(2_000);
  });

  it('formats short distance labels', () => {
    expect(formatDistanceLabel(320, 'en')).toBe('320 m');
    expect(formatDistanceLabel(320, 'zh')).toBe('320米');
    expect(formatDistanceLabel(2400, 'en')).toBe('2.4 km');
    expect(formatDistanceLabel(2400, 'zh')).toBe('2.4公里');
  });

  it('splits place, city for two-line list rows', () => {
    expect(splitPlaceLabel('Park Plaza Hotel, Beijing')).toEqual({
      title: 'Park Plaza Hotel',
      subtitle: 'Beijing',
    });
    expect(splitPlaceLabel('Starbucks')).toEqual({ title: 'Starbucks', subtitle: '' });
  });
});
