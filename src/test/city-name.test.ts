/**
 * Life Map cards stuck on "Area 3", "Area 5"…: city names must resolve from
 * the free reverse geocoder, never be a placeholder, and be remembered.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: vi.fn(async () => ({ data: { city: 'Edge City', name: 'Current location' }, error: null })) } },
}));

import { getCachedCityName, isUnknownCityName, pickCityFromPhoton, resolveCityName } from '@/lib/cityName';

const okJson = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;

describe('city names', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  it('treats placeholders as unknown', () => {
    for (const n of ['', 'Unknown', '未知', 'Current location', '当前位置', 'Area 5']) expect(isUnknownCityName(n)).toBe(true);
    expect(isUnknownCityName('Budapest')).toBe(false);
  });

  it('picks city, then town/village, then the place itself, then county/state', () => {
    expect(pickCityFromPhoton({ name: 'Cafe', city: 'Reno', state: 'Nevada' })).toBe('Reno');
    expect(pickCityFromPhoton({ name: 'Trailhead', village: 'Zephyr Cove', county: 'Douglas County' })).toBe('Zephyr Cove');
    expect(pickCityFromPhoton({ name: 'South Lake Tahoe', type: 'city', state: 'California' })).toBe('South Lake Tahoe');
    expect(pickCityFromPhoton({ name: 'Somewhere', county: 'El Dorado County', state: 'California' })).toBe('El Dorado County');
    expect(pickCityFromPhoton(undefined)).toBe('');
  });

  it('resolves through Photon, remembers the answer, and does not ask twice', async () => {
    const fetchMock = vi.fn(async () => okJson({ features: [{ properties: { name: '999 Pho', city: 'Reno' } }] }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await resolveCityName(39.53, -119.81, 'en')).toBe('Reno');
    expect(getCachedCityName(39.53, -119.81, 'en')).toBe('Reno');
    expect(await resolveCityName(39.531, -119.812, 'en')).toBe('Reno'); // same ~1 km cell
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to the edge function when Photon fails, and never keeps a placeholder', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    expect(await resolveCityName(47.5, 19.04, 'en')).toBe('Edge City');
  });
});
