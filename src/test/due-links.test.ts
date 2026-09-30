import { describe, expect, it } from 'vitest';
import { resolveStepLink, type DueLink } from '@/lib/dueLinks';
import { normalizeUrl, isUrlLike, getDomain } from '@/lib/linkUtils';

describe('resolveStepLink', () => {
  it('prefers structured links[0] over the step title', () => {
    const link: DueLink = {
      url: 'https://aa.com/reservations',
      label: 'AA seat select',
      siteName: 'aa.com',
    };
    const resolved = resolveStepLink(
      { title: 'https://other.example/x', links: [link] },
      normalizeUrl,
      isUrlLike,
      getDomain,
    );
    expect(resolved).toEqual(link);
  });

  it('treats a raw URL title as a legacy link step', () => {
    const resolved = resolveStepLink(
      { title: 'https://travelsecure.chase.com/trip/abc' },
      normalizeUrl,
      isUrlLike,
      getDomain,
    );
    expect(resolved?.url).toBe('https://travelsecure.chase.com/trip/abc');
    expect(resolved?.siteName).toBe('travelsecure.chase.com');
    expect(resolved?.label).toBe('travelsecure.chase.com');
  });

  it('returns null for ordinary text steps', () => {
    expect(
      resolveStepLink(
        { title: 'Book hotel' },
        normalizeUrl,
        isUrlLike,
        getDomain,
      ),
    ).toBeNull();
  });
});
