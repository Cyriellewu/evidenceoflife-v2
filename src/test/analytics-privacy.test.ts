import { afterEach, describe, expect, it } from 'vitest';
import {
  AUTOCAPTURE_MASK_ATTRIBUTE,
  REPLAY_BLOCK_CLASS,
  setAnalyticsPrivacyShield,
} from '@/lib/analytics';

afterEach(() => setAnalyticsPrivacyShield(false));

describe('analytics privacy shield', () => {
  it('uses the selectors the Amplitude SDKs look for', () => {
    // Session Replay hardcodes BLOCK_CLASS = 'amp-block'; autocapture reads
    // TEXT_MASK_ATTRIBUTE = 'data-amp-mask'. Renaming either silently leaks.
    expect(REPLAY_BLOCK_CLASS).toBe('amp-block');
    expect(AUTOCAPTURE_MASK_ATTRIBUTE).toBe('data-amp-mask');
  });

  it('blocks replay on <body> and masks autocapture text on <html> when enabled', () => {
    setAnalyticsPrivacyShield(true);
    expect(document.body.classList.contains('amp-block')).toBe(true);
    expect(document.documentElement.hasAttribute('data-amp-mask')).toBe(true);
  });

  it('removes both again on sign-out', () => {
    setAnalyticsPrivacyShield(true);
    setAnalyticsPrivacyShield(false);
    expect(document.body.classList.contains('amp-block')).toBe(false);
    expect(document.documentElement.hasAttribute('data-amp-mask')).toBe(false);
  });

  it('is idempotent', () => {
    setAnalyticsPrivacyShield(true);
    setAnalyticsPrivacyShield(true);
    expect(document.body.className.split(/\s+/).filter(c => c === 'amp-block')).toHaveLength(1);
  });
});
