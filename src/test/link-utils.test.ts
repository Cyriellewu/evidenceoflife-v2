import { describe, expect, it } from 'vitest';
import {
  extractFirstUrl,
  getDomain,
  isUrlLike,
  normalizeUrl,
} from '@/lib/linkUtils';

describe('normalizeUrl', () => {
  it('adds https:// when the scheme is missing', () => {
    expect(normalizeUrl('example.com')).toBe('https://example.com/');
    expect(normalizeUrl('example.com/docs')).toBe('https://example.com/docs');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeUrl('  example.com/path  ')).toBe('https://example.com/path');
  });

  it('preserves an existing http or https scheme', () => {
    expect(normalizeUrl('https://example.com')).toBe('https://example.com/');
    expect(normalizeUrl('http://example.com')).toBe('http://example.com/');
  });

  it('returns null for blank or invalid input', () => {
    expect(normalizeUrl('   ')).toBeNull();
    expect(normalizeUrl('not a url')).toBeNull();
  });
});

describe('isUrlLike', () => {
  it('accepts a single bare URL with a scheme or www', () => {
    expect(isUrlLike('https://example.com')).toBe(true);
    expect(isUrlLike('http://example.com/path')).toBe(true);
    expect(isUrlLike('www.example.com')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isUrlLike('WWW.EXAMPLE.COM')).toBe(true);
  });

  it('rejects plain text, sentences, and blank input', () => {
    expect(isUrlLike('example.com')).toBe(false);
    expect(isUrlLike('visit https://example.com now')).toBe(false);
    expect(isUrlLike('')).toBe(false);
    expect(isUrlLike('   ')).toBe(false);
  });
});

describe('extractFirstUrl', () => {
  it('pulls the first URL token from mixed text', () => {
    expect(extractFirstUrl('Read https://example.com/docs now')).toBe(
      'https://example.com/docs',
    );
    expect(extractFirstUrl('See www.example.com for info')).toBe(
      'www.example.com',
    );
  });

  it('returns null when there is no URL-looking token', () => {
    expect(extractFirstUrl('plain text')).toBeNull();
    expect(extractFirstUrl('   ')).toBeNull();
  });
});

describe('getDomain', () => {
  it('strips a leading www from a parsed hostname', () => {
    expect(getDomain('https://www.example.com/path')).toBe('example.com');
    expect(getDomain('https://example.com/path')).toBe('example.com');
  });

  it('keeps subdomains intact', () => {
    expect(getDomain('https://sub.example.com/path')).toBe('sub.example.com');
  });

  it('falls back to the raw string for unparseable input', () => {
    expect(getDomain('www.example.com')).toBe('www.example.com');
    expect(getDomain('not a url')).toBe('not a url');
  });
});
