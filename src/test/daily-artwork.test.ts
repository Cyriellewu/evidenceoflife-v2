import { describe, expect, it } from 'vitest';
import { DAILY_ARTWORKS, getDailyArtwork, isLegacyKeyedMapImageUrl, isMuseumArtworkUrl } from '@/lib/dailyArtwork';

describe('daily artwork shuffle', () => {
  it('keeps the same artwork for the same date', () => {
    expect(getDailyArtwork('2026-09-01')).toEqual(getDailyArtwork('2026-09-01'));
  });

  it('moves through the collection and wraps around', () => {
    const date = '2026-09-01';
    expect(getDailyArtwork(date, 1)).not.toEqual(getDailyArtwork(date));
    expect(getDailyArtwork(date, DAILY_ARTWORKS.length)).toEqual(getDailyArtwork(date));
  });

  it('uses only direct museum CDN image URLs', () => {
    expect(DAILY_ARTWORKS.every(artwork => isMuseumArtworkUrl(artwork.imageUrl))).toBe(true);
  });

  it('recognizes legacy TomTom static map images that require an API key', () => {
    expect(isLegacyKeyedMapImageUrl('https://cdn.tomtom.com/static/map.png')).toBe(true);
    expect(isLegacyKeyedMapImageUrl('https://api.tomtom.com/map/1/staticimage')).toBe(true);
    expect(isLegacyKeyedMapImageUrl(DAILY_ARTWORKS[0].imageUrl)).toBe(false);
  });
});
