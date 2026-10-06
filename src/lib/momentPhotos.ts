const BUCKET = 'moment-photos';
const SIGNED_URL_TTL_SEC = 60 * 60; // 1 hour
const PHOTO_URL_CACHE_MS = (SIGNED_URL_TTL_SEC - 60) * 1000;
const PHOTO_URL_FAILURE_COOLDOWN_MS = 30_000;
// Memory only: reuse the same URL across cards and remounts, so the browser
// can reuse the image response rather than downloading a newly signed URL.
const photoUrls = new Map<string, { url: string; expiresAt: number }>();
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
export async function uploadMomentPhotoObject(
  userId: string,
  blob: Blob,
  contentType: string,
  ext = 'png',
): Promise<string | null> {
  const supabase = await getSupabase();
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType, upsert: false });

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
