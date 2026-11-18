/**
 * "I'm at Hilton Club Tahoe and searching 'hilton' shows places thousands of
 * km away." Searches must rank places near the person first, and a saved
 * position must not outlive a trip.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { bboxAround, mapOverpassElements, mergeSearchResults, placeMatchScore, placeMatchesQuery } from '@/lib/geoClient';
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

describe('only places whose name matches what was typed', () => {
  it('drops the nearby junk a fuzzy geocoder returns', () => {
    expect(placeMatchesQuery('Lake Tahoe Vacation Resort', 'ha noi pho')).toBe(false);
    expect(placeMatchesQuery('Cafe Fiore', 'ha noi pho')).toBe(false);
  });
  it('keeps real matches, ignoring accents and spacing', () => {
    expect(placeMatchesQuery('Phở Hà Nội', 'ha noi pho')).toBe(true);
    expect(placeMatchesQuery('Hanoi Pho Restaurant', 'ha noi pho')).toBe(true);
    expect(placeMatchesQuery('Hilton Vacation Club Lake Tahoe', 'hilton')).toBe(true);
    expect(placeMatchesQuery('星巴克 南湖店', '星巴克')).toBe(true);
  });
});

describe('brand / operator names ("hilton club" → Lake Tahoe Vacation Resort)', () => {
  const elements = [
    { lat: 38.957, lon: -119.943, tags: { name: 'Lake Tahoe Vacation Resort', tourism: 'hotel', brand: 'Hilton Grand Vacations', operator: 'Hilton Vacation Club' } },
    { lat: 38.93, lon: -119.98, tags: { name: 'Tahoe Paradise Golf Club', leisure: 'golf_course' } },
  ];

  it('keeps the brand and operator as an alias', () => {
    const [resort] = mapOverpassElements(elements, tahoe, 10);
    expect(resort.name).toContain('Lake Tahoe Vacation Resort');
    expect(resort.alias).toContain('Hilton');
  });

  it('matches on the alias and ranks the better match first', () => {
    const places = mapOverpassElements(elements, tahoe, 10);
    const resort = places.find(p => p.name.includes('Vacation Resort'))!;
    const golf = places.find(p => p.name.includes('Golf'))!;
    expect(placeMatchesQuery(resort.name, 'hilton club', resort.alias)).toBe(true);
    expect(placeMatchesQuery(resort.name, 'hilton club')).toBe(false); // the name alone doesn't say Hilton
    expect(placeMatchScore(resort, 'hilton club')).toBeGreaterThan(placeMatchScore(golf, 'hilton club'));
    const out = mergeSearchResults([[golf, resort]], tahoe, 10, 60_000, 'hilton club');
    expect(out[0].name).toContain('Lake Tahoe Vacation Resort');
  });

  it('a far place that matches every word does not beat a near one that matches the brand', () => {
    const far = { name: 'Hilton Grand Vacations Club Pool', lat: 33.7, lng: -117.1, category: 'other' };
    const near = mapOverpassElements(elements, tahoe, 10)[0];
    const out = mergeSearchResults([[far], [near]], tahoe, 10, 60_000, 'hilton club');
    expect(out.map(r => r.name)[0]).toContain('Lake Tahoe Vacation Resort');
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
