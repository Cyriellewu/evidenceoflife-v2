const BUCKET = 'moment-photos';
// Signed URLs are long enough to be reused across reloads: a new URL is a
// browser-cache miss and a full re-download, which is what burned storage
// egress (every reload re-fetched every photo). 12 h keeps links short-lived.
const SIGNED_URL_TTL_SEC = 12 * 60 * 60;
const PHOTO_URL_CACHE_MS = (SIGNED_URL_TTL_SEC - 10 * 60) * 1000;
const PHOTO_URL_FAILURE_COOLDOWN_MS = 30_000;
const PERSIST_KEY = 'eol-photo-urls-v1';
const PERSIST_MAX = 300;
// Same URL across cards, remounts and page reloads, so the browser's HTTP
// cache serves the image instead of downloading it again.
const photoUrls = new Map<string, { url: string; expiresAt: number }>(loadPersisted());

function loadPersisted(): Array<[string, { url: string; expiresAt: number }]> {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(PERSIST_KEY) : null;
    if (!raw) return [];
    const now = Date.now();
    return (JSON.parse(raw) as Array<[string, { url: string; expiresAt: number }]>)
      .filter(([, v]) => v && typeof v.url === 'string' && v.url && v.expiresAt > now);
  } catch {
    return [];
  }
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;
function persistSoon() {
  if (persistTimer || typeof localStorage === 'undefined') return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    try {
      const now = Date.now();
      const rows = [...photoUrls.entries()].filter(([, v]) => v.url && v.expiresAt > now).slice(-PERSIST_MAX);
      localStorage.setItem(PERSIST_KEY, JSON.stringify(rows));
    } catch {
      /* private mode / quota: memory cache still works */
    }
  }, 500);
}

/** Forget cached links (e.g. on sign-out). */
export function clearPhotoUrlCache() {
  photoUrls.clear();
  try { localStorage.removeItem(PERSIST_KEY); } catch { /* ignore */ }
}
const pendingPhotoUrls = new Map<string, Promise<string>>();

async function getSupabase() {
  const { supabase } = await import('@/integrations/supabase/client');
  return supabase;
}

/** Extract storage object path from a stored public URL or raw path. */
export function momentPhotoObjectPath(pathOrUrl: string): string | null {
  const value = pathOrUrl.trim();
  if (!value) return null;
  // Local previews and bundled images are not private storage objects.
  if (/^(?:data:|blob:|\/)/i.test(value)) return null;

  if (!/^https?:\/\//i.test(value)) {
    return value.replace(/^\/+/, '');
  }

  try {
    const url = new URL(value);
    const markers = [
      `/storage/v1/object/public/${BUCKET}/`,
      `/storage/v1/object/sign/${BUCKET}/`,
      `/storage/v1/object/authenticated/${BUCKET}/`,
    ];
    for (const marker of markers) {
      const idx = url.pathname.indexOf(marker);
      if (idx >= 0) {
        return decodeURIComponent(url.pathname.slice(idx + marker.length));
      }
    }
  } catch {
    return null;
  }

  return null;
}

/** Upload a blob and return the storage object path (not a durable public URL). */
// `folder` groups non-moment images (e.g. 'sticky'); the first path segment
// must stay the user id, which the bucket's storage policies check.
export function createMomentPhotoObjectPath(userId: string, ext = 'png', folder?: string): string {
  const prefix = folder ? `${userId}/${folder}` : userId;
  return `${prefix}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
}

const SHRINK_MAX_EDGE = 1600;
const SHRINK_MIN_BYTES = 450 * 1024;

/** Downscale large raster photos to a JPEG; null when not worth it or unsupported. */
export async function shrinkPhoto(blob: Blob, contentType: string): Promise<Blob | null> {
  if (!/^image\/(jpeg|jpg|png|webp|heic|heif)$/i.test(contentType) || blob.size < SHRINK_MIN_BYTES) return null;
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return null;
  try {
    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(1, SHRINK_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const out = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.82));
    return out && out.size < blob.size ? out : null;
  } catch {
    return null; // e.g. HEIC the browser can't decode: upload the original
  }
}

export async function uploadMomentPhotoObject(
  userId: string,
  blob: Blob,
  contentType: string,
  ext = 'png',
  objectPath?: string,
): Promise<string | null> {
  const supabase = await getSupabase();
  // Phone photos are 2–6 MB; the app never shows them larger than a card, so
  // store a 1600 px JPEG (~200–400 KB). Every later view downloads this copy.
  const shrunk = await shrinkPhoto(blob, contentType);
  if (shrunk) {
    blob = shrunk;
    contentType = 'image/jpeg';
    ext = 'jpg';
  }
  const path = objectPath || createMomentPhotoObjectPath(userId, ext);
  const { error } = await supabase.storage
    .from(BUCKET)
    // A caller-supplied path is an idempotency key. Retrying may overwrite the
    // same object, but can never leak another orphan object under a new path.
    // Long cache lifetime: objects are immutable (new photo = new path).
    .upload(path, blob, { contentType, upsert: Boolean(objectPath), cacheControl: '604800' });

  if (error) {
    console.error('Photo upload failed:', error);
    return null;
  }

  return path;
}

/** Resolve a stored path/legacy public URL to a short-lived signed URL. */
export async function resolveMomentPhotoUrl(pathOrUrl: string): Promise<string> {
  const path = momentPhotoObjectPath(pathOrUrl);
  if (!path) return pathOrUrl;

  const cached = photoUrls.get(path);
  if (cached && cached.expiresAt > Date.now()) return cached.url;
  const pending = pendingPhotoUrls.get(path);
  if (pending) return pending;

  const request = (async () => {
    try {
      const supabase = await getSupabase();
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(path, SIGNED_URL_TTL_SEC);
      if (error || !data?.signedUrl) throw error || new Error('Missing signed URL');
      photoUrls.set(path, { url: data.signedUrl, expiresAt: Date.now() + PHOTO_URL_CACHE_MS });
      persistSoon();
      return data.signedUrl;
    } catch (error) {
      console.error('Signed URL failed:', error);
      // A service restriction must not become a retry storm on remount.
      photoUrls.set(path, { url: '', expiresAt: Date.now() + PHOTO_URL_FAILURE_COOLDOWN_MS });
      return '';
    } finally {
      pendingPhotoUrls.delete(path);
      if (photoUrls.size > 512) photoUrls.delete(photoUrls.keys().next().value!);
    }
  })();
  pendingPhotoUrls.set(path, request);
  return request;
}

export async function resolveMomentPhotoUrls(pathsOrUrls: string[]): Promise<string[]> {
  return Promise.all(pathsOrUrls.map((p) => resolveMomentPhotoUrl(p)));
}
