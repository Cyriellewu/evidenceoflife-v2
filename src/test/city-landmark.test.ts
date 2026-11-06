import { describe, expect, it } from 'vitest';
import { landmarkFor } from '@/components/CityLandmark';

describe('landmarkFor', () => {
  it('maps English and Chinese city names to a landmark', () => {
    expect(landmarkFor('New York')).toBe('new-york');
    expect(landmarkFor('纽约市')).toBe('new-york');
    expect(landmarkFor('Beijing')).toBe('beijing');
    expect(landmarkFor('北京市')).toBe('beijing');
    expect(landmarkFor('Budapest')).toBe('budapest');
    expect(landmarkFor('东京都')).toBe('tokyo');
  });
  it('returns null for unknown or empty names so the card keeps its category icon', () => {
    expect(landmarkFor('Unknown')).toBeNull();
    expect(landmarkFor('')).toBeNull();
    expect(landmarkFor(undefined)).toBeNull();
  });
});
