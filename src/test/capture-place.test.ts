import { describe, expect, it } from 'vitest';
import { capturePlaceOptions, metersBetween } from '@/lib/capturePlace';

const here = { lat: 40.8075, lng: -73.9626 };
const reverse = { name: '3333 Broadway', lat: 40.8075, lng: -73.9626, category: 'other' as const };
// ~30 m and ~150 m and ~2 km away
const butler = { name: 'Butler Library', lat: 40.80777, lng: -73.9626, category: 'museum', visits: 3 };
const joe = { name: 'Joe Coffee', lat: 40.8088, lng: -73.9626, category: 'coffee', visits: 1 };
const far = { name: 'Blue Bottle', lat: 40.79, lng: -73.97, category: 'coffee' };

describe('capturePlaceOptions', () => {
  it('measures distance in metres', () => {
    expect(Math.round(metersBetween(here, butler))).toBeGreaterThan(20);
    expect(Math.round(metersBetween(here, butler))).toBeLessThan(40);
  });

  it('snaps to a known place within 60 m and offers the rest nearby', () => {
    const { chosen, options } = capturePlaceOptions(here, [far, joe, butler], reverse);
    expect(chosen?.name).toBe('Butler Library');
    expect(options.map(o => o.name)).toEqual(['Butler Library', 'Joe Coffee', '3333 Broadway']);
  });

  it('uses the reverse-geocoded address when nothing known is that close', () => {
    const { chosen, options } = capturePlaceOptions(here, [joe, far], reverse);
    expect(chosen?.name).toBe('3333 Broadway');
    expect(options.map(o => o.name)).toEqual(['3333 Broadway', 'Joe Coffee']);
  });

  it('falls back to a nearby known place when reverse geocoding failed', () => {
    expect(capturePlaceOptions(here, [joe], null).chosen?.name).toBe('Joe Coffee');
    expect(capturePlaceOptions(here, [], null).chosen).toBeNull();
  });
});
