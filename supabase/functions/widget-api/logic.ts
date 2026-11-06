// Pure helpers for the widget-api edge function (no network, no Deno env),
// so they can be unit-tested in isolation.

export const TOKEN_PREFIX = "eolw_";
export const MAX_TOKENS_PER_USER = 5;
export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
export const MAX_TITLE = 200;
export const MAX_TEXT = 2000;

const CATEGORIES = new Set(["restaurant", "coffee", "grocery", "park", "museum", "other"]);

export function newRawToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return TOKEN_PREFIX + btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function hashToken(raw: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function looksLikeToken(raw: unknown): raw is string {
  return typeof raw === "string" && raw.startsWith(TOKEN_PREFIX) && raw.length >= 40 && raw.length <= 80 &&
    /^[A-Za-z0-9_-]+$/.test(raw);
}

export function isDateKey(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
}

export function cleanTitle(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.replace(/\s+/g, " ").trim();
  return t.length > 0 && t.length <= MAX_TITLE ? t : null;
}

export function cleanText(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t.slice(0, MAX_TEXT) : null;
}

export interface WidgetLocation { name: string; lat: number; lng: number; category: string }

export function cleanLocation(v: unknown): WidgetLocation | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const lat = Number(o.lat);
  const lng = Number(o.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  const name = typeof o.name === "string" && o.name.trim() ? o.name.trim().slice(0, 120) : "Current location";
  const category = typeof o.category === "string" && CATEGORIES.has(o.category) ? o.category : "other";
  return { name, lat, lng, category };
}

const IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/heic": "heic",
  "image/webp": "webp",
};

/** Decode a base64 photo, enforcing type and size. */
export function decodePhoto(v: unknown): { bytes: Uint8Array; contentType: string; ext: string } | { error: string } | null {
  if (v == null) return null;
  if (typeof v !== "object") return { error: "photo must be an object" };
  const o = v as Record<string, unknown>;
  const contentType = typeof o.contentType === "string" ? o.contentType.toLowerCase() : "";
  const ext = IMAGE_TYPES[contentType];
  if (!ext) return { error: "unsupported photo type" };
  if (typeof o.base64 !== "string" || o.base64.length === 0) return { error: "photo data missing" };
  if (o.base64.length > Math.ceil(MAX_PHOTO_BYTES / 3) * 4 + 4) return { error: "photo too large" };
  let bin: string;
  try {
    bin = atob(o.base64);
  } catch {
    return { error: "photo is not base64" };
  }
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, contentType, ext };
}
