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
import { mapOverpassElements, overpassCategory } from '@/lib/geoClient';

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

<<<<<<< HEAD
=======
describe('geolocation error classification', () => {
  it('does not treat timeout as permission denial', async () => {
    const { classifyGeoError, geoErrorMessage, GeoPositionError } = await import('@/lib/geolocation');
    expect(classifyGeoError({ code: 1 })).toBe('permission');
    expect(classifyGeoError({ code: 2 })).toBe('unavailable');
    expect(classifyGeoError({ code: 3 })).toBe('timeout');
    expect(classifyGeoError(new GeoPositionError('timeout'))).toBe('timeout');
    expect(geoErrorMessage('timeout', 'zh')).toMatch(/超时/);
    expect(geoErrorMessage('permission', 'zh')).toMatch(/权限/);
    expect(geoErrorMessage('timeout', 'en')).not.toMatch(/permission/i);
  });
});

>>>>>>> 7903ca8 (fix: iOS location reliability + less clumsy place picker)
describe('overpass nearby POI mapping (free, no API key)', () => {
  it('maps amenity/leisure tags to app categories', () => {
    expect(overpassCategory({ amenity: 'cafe' })).toBe('coffee');
    expect(overpassCategory({ amenity: 'restaurant' })).toBe('restaurant');
    expect(overpassCategory({ leisure: 'park' })).toBe('park');
    expect(overpassCategory({ shop: 'supermarket' })).toBe('grocery');
    expect(overpassCategory({ tourism: 'museum' })).toBe('museum');
  });

  it('keeps named nodes/ways, drops unnamed, sorts by distance', () => {
    const origin = { lat: 40.71, lng: -74.0 };
    const results = mapOverpassElements(
      [
        {
          type: 'node',
          lat: 41.0,
          lon: -74.0,
          tags: { name: 'Far Cafe', amenity: 'cafe' },
        },
        {
          type: 'node',
          lat: 40.711,
          lon: -74.001,
          tags: { name: 'Near Cafe', amenity: 'cafe', 'addr:city': 'NYC' },
        },
        {
          type: 'way',
          center: { lat: 40.712, lon: -74.002 },
          tags: { name: 'City Park', leisure: 'park' },
        },
        {
          type: 'node',
          lat: 40.7115,
          lon: -74.0015,
          tags: { amenity: 'cafe' }, // no name — skip
        },
      ],
      origin,
      8,
    );
    expect(results.map((r) => r.name)).toEqual([
      'Near Cafe, NYC',
      'City Park',
      'Far Cafe',
    ]);
    expect(results[0].category).toBe('coffee');
    expect(results[1].category).toBe('park');
    expect(results[0].distance_m).toBeLessThan(results[2].distance_m!);
  });
});
