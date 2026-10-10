import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type AnalyticsModule = typeof import('@/lib/analytics');

async function loadAnalytics(): Promise<AnalyticsModule> {
  vi.resetModules();
  return import('@/lib/analytics');
}

function setReferrer(value: string) {
  Object.defineProperty(document, 'referrer', { configurable: true, get: () => value });
}

describe('analytics attribution', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState(null, '', '/');
    setReferrer('');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
    delete window.gtag;
  });

  it('stores first touch once and never overwrites it', async () => {
    window.history.replaceState(null, '', '/?utm_source=reddit&utm_medium=post&utm_campaign=adhd-week&ref=friend1');
    const a = await loadAnalytics();
    a.captureFirstTouch();
    window.history.replaceState(null, '', '/?utm_source=google');
    a.captureFirstTouch();

    expect(a.getAttribution()).toEqual({
      first_utm_source: 'reddit',
      first_utm_medium: 'post',
      first_utm_campaign: 'adhd-week',
      first_ref: 'friend1',
      first_landing_path: '/',
    });
  });

  it('never stores search or hash (auth tokens) and sanitizes values', async () => {
    window.history.replaceState(null, '', '/auth/callback?code=secret-code&utm_source=<script>x</script>#access_token=tok');
    const a = await loadAnalytics();
    a.captureFirstTouch();

    const stored = window.localStorage.getItem('analytics.first_touch') ?? '';
    expect(stored).not.toContain('secret-code');
    expect(stored).not.toContain('access_token');
    expect(a.getAttribution()).toMatchObject({ first_landing_path: '/auth/callback', first_utm_source: 'scriptxscript' });
  });

  it('keeps only the host of a cross-origin referrer', async () => {
    setReferrer('https://www.reddit.com/r/ADHD/comments/abc?utm=1');
    const a = await loadAnalytics();
    a.captureFirstTouch();
    expect(a.getAttribution().first_referrer_host).toBe('www.reddit.com');
  });

  it('drops same-origin referrers', async () => {
    setReferrer(`${window.location.origin}/demo-app`);
    const a = await loadAnalytics();
    a.captureFirstTouch();
    expect(a.getAttribution().first_referrer_host).toBeUndefined();
  });

  it('returns {} when nothing was captured', async () => {
    const a = await loadAnalytics();
    expect(a.getAttribution()).toEqual({});
  });
});

describe('isFreshAccount', () => {
  it('compares two server timestamps within the window', async () => {
    const { isFreshAccount, FRESH_ACCOUNT_WINDOW_MS } = await loadAnalytics();
    const created = '2026-10-01T10:00:00.000Z';
    expect(isFreshAccount(created, '2026-10-01T10:00:05.000Z')).toBe(true);
    expect(isFreshAccount(created, new Date(Date.parse(created) + FRESH_ACCOUNT_WINDOW_MS).toISOString())).toBe(true);
    expect(isFreshAccount(created, '2026-10-03T09:00:00.000Z')).toBe(false);
    expect(isFreshAccount(created, null)).toBe(false);
    expect(isFreshAccount(undefined, created)).toBe(false);
    expect(isFreshAccount('not-a-date', created)).toBe(false);
  });
});

describe('trackDayReturned', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    delete window.gtag;
  });

  async function withGtag() {
    vi.stubEnv('VITE_GA_MEASUREMENT_ID', 'G-TEST');
    const a = await loadAnalytics();
    const gtag = vi.fn();
    window.gtag = gtag;
    const dayReturned = () => gtag.mock.calls.filter(call => call[0] === 'event' && call[1] === 'day_returned');
    return { a, dayReturned };
  }

  it('does not fire on the first visit or again on the same day', async () => {
    const { a, dayReturned } = await withGtag();
    a.trackDayReturned('user-1', new Date(2026, 9, 1, 9));
    a.trackDayReturned('user-1', new Date(2026, 9, 1, 22));
    expect(dayReturned()).toHaveLength(0);
  });

  it('fires with days_since_last when the local day changes', async () => {
    const { a, dayReturned } = await withGtag();
    a.trackDayReturned('user-1', new Date(2026, 9, 1, 9));
    a.trackDayReturned('user-1', new Date(2026, 9, 4, 8));
    expect(dayReturned()).toHaveLength(1);
    expect(dayReturned()[0][2]).toEqual({ days_since_last: 3 });
  });

  it('tracks each user separately', async () => {
    const { a, dayReturned } = await withGtag();
    a.trackDayReturned('user-1', new Date(2026, 9, 1, 9));
    a.trackDayReturned('user-2', new Date(2026, 9, 2, 9));
    expect(dayReturned()).toHaveLength(0);
  });
});

describe('trackEvent safety', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    delete window.gtag;
  });

  it('never throws into the caller when a backend throws', async () => {
    vi.stubEnv('VITE_GA_MEASUREMENT_ID', 'G-TEST');
    const a = await loadAnalytics();
    window.gtag = () => { throw new Error('blocked by extension'); };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(() => a.trackEvent('timer_started', { source: 'focus' })).not.toThrow();
    warn.mockRestore();
  });
});

describe('identifyUser', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    delete window.gtag;
  });

  it('does not touch GA identity for anonymous visitors, but clears it on sign-out', async () => {
    vi.stubEnv('VITE_GA_MEASUREMENT_ID', 'G-TEST');
    const a = await loadAnalytics();
    const gtag = vi.fn();
    window.gtag = gtag;
    const userIdConfigs = () => gtag.mock.calls.filter(call => call[0] === 'config' && 'user_id' in (call[2] ?? {}));

    a.identifyUser(null);
    expect(userIdConfigs()).toHaveLength(0);

    a.identifyUser('user-1');
    a.identifyUser(null);
    expect(userIdConfigs().map(call => call[2].user_id)).toEqual(['user-1', null]);
  });
});

describe('amplitude loading', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
    delete window.amplitude;
  });

  it('initializes once the SDK replaces the stub, then replays identity and queued events', async () => {
    vi.useFakeTimers();
    vi.stubEnv('VITE_AMPLITUDE_API_KEY', 'amp-key');
    delete window.amplitude;
    const a = await loadAnalytics();

    a.identifyUser('user-1');
    a.trackEvent('landing_page_view', { page: '/' });

    const sdk = { init: vi.fn(), track: vi.fn(), setUserId: vi.fn(), reset: vi.fn() };
    window.amplitude = sdk;
    vi.advanceTimersByTime(200);

    expect(sdk.init).toHaveBeenCalledWith('amp-key', undefined, expect.any(Object));
    expect(sdk.setUserId).toHaveBeenCalledWith('user-1');
    expect(sdk.track).toHaveBeenCalledWith('landing_page_view', { page: '/' });
  });
});
