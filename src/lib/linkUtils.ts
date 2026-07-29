/**
 * Shared link / URL helpers used by Links, Dues, StickyNotes, Today and
 * link-preview cards. Centralised here to avoid copy-pasted variants.
 */

/** Normalize a user-typed value into an absolute URL (adds https:// if missing). */
export function normalizeUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    return new URL(withProtocol).toString();
  } catch {
    return null;
  }
}

/** True when the whole string is a single bare URL (http(s):// or www.). */
export function isUrlLike(text: string): boolean {
  return /^(?:https?:\/\/|www\.)[^\s]+$/i.test(text.trim());
}

/** Extract the first URL-looking token from free text. */
export function extractFirstUrl(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/((?:https?:\/\/|www\.)[^\s]+)/i);
  return match?.[1] || null;
}

/** Hostname without the leading www., falling back to the raw url. */
export function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** Route an external image through the Supabase image-proxy edge function. */
export function buildProxyImageUrl(imageUrl: string): string {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl) return imageUrl;
  const params = new URLSearchParams({ url: imageUrl });
  if (anonKey) params.set('apikey', anonKey);
  return `${supabaseUrl}/functions/v1/image-proxy?${params.toString()}`;
}

/** Google favicon service URL for a given page url. */
export function getFaviconUrl(url: string, size = 128): string {
  return `https://www.google.com/s2/favicons?sz=${size}&domain_url=${encodeURIComponent(url)}`;
}
