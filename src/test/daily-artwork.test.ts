import { describe, expect, it } from 'vitest';
import { getDailyArtwork } from '@/lib/dailyArtwork';

describe('getDailyArtwork', () => {
  it('returns the same open-access artwork throughout a local day', () => {
    const morning = getDailyArtwork(new Date(2026, 9, 4, 8, 15));
    const evening = getDailyArtwork(new Date(2026, 9, 4, 22, 45));

    expect(evening).toEqual(morning);
    expect(morning.imageUrl).toMatch(/^https:\/\/www\.artic\.edu\/iiif\/2\/.+\/full\/843,\/0\/default\.jpg$/);
    expect(morning.artworkUrl).toBe(`https://www.artic.edu/artworks/${morning.id}`);
  });

  it('rotates to a different work on the next day', () => {
    const today = getDailyArtwork(new Date(2026, 9, 4));
    const tomorrow = getDailyArtwork(new Date(2026, 9, 5));

    expect(tomorrow.id).not.toBe(today.id);
  });
});

