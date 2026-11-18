/**
 * "I'm at Hilton Club Tahoe and searching 'hilton' shows places thousands of
 * km away." Searches must rank places near the person first, and a saved
 * position must not outlive a trip.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { bboxAround, mergeSearchResults } from '@/lib/geoClient';
import { GEO_COORDS_MAX_AGE_MS, readCachedGeoCoords, writeCachedGeoCoords } from '@/lib/geoCoords';

const tahoe = { lat: 38.96, lng: -119.94 };
const place = (name: string, lat: number, lng: number) => ({ name, lat, lng, category: 'hotel' });

describe('near-first place search', () => {
  it('puts the nearby Hilton above famous far ones, closest first', () => {
    const global = [place('Hilton New York Midtown', 40.76, -73.98), place('Hilton Hawaiian Village', 21.28, -157.84)];
    const local = [place('Hilton Vacation Club Lake Tahoe', 38.957, -119.943), place('Hilton Garden Inn Carson City', 39.16, -119.76)];
    const out = mergeSearchResults([global, local], tahoe, 10);
    expect(out.map(r => r.name)).toEqual([
      'Hilton Vacation Club Lake Tahoe',
      'Hilton Garden Inn Carson City',
      'Hilton New York Midtown',
      'Hilton Hawaiian Village',
    ]);
    expect(out[0].distance_m).toBeLessThan(1_000);
  });

  it('drops duplicates that two sources both return', () => {
    const a = [place('Hilton Vacation Club Lake Tahoe', 38.957, -119.943)];
    const b = [place('hilton vacation club lake tahoe', 38.9571, -119.9431)];
    expect(mergeSearchResults([a, b], tahoe, 10)).toHaveLength(1);
  });

  it('builds a box around the person', () => {
    const [minLon, minLat, maxLon, maxLat] = bboxAround(tahoe, 60_000);
    expect(minLat).toBeLessThan(tahoe.lat);
    expect(maxLat).toBeGreaterThan(tahoe.lat);
    expect(minLon).toBeLessThan(tahoe.lng);
    expect(maxLon).toBeGreaterThan(tahoe.lng);
  });
});

describe('saved position expires', () => {
  beforeEach(() => sessionStorage.clear());
  it('forgets yesterday\'s city', () => {
    writeCachedGeoCoords(tahoe);
    expect(readCachedGeoCoords()).toEqual(tahoe);
    expect(readCachedGeoCoords(Date.now() + GEO_COORDS_MAX_AGE_MS + 1)).toBeNull();
  });
});
