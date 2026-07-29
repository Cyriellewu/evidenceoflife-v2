const BUCKET = 'moment-photos';
const SIGNED_URL_TTL_SEC = 60 * 60; // 1 hour

async function getSupabase() {
  const { supabase } = await import('@/integrations/supabase/client');
  return supabase;
}

/** Extract storage object path from a stored public URL or raw path. */
export function momentPhotoObjectPath(pathOrUrl: string): string | null {
  const value = pathOrUrl.trim();
  if (!value) return null;

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

  const supabase = await getSupabase();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SEC);

  if (error || !data?.signedUrl) {
    console.error('Signed URL failed:', error);
    return pathOrUrl;
  }

  return data.signedUrl;
}

export async function resolveMomentPhotoUrls(pathsOrUrls: string[]): Promise<string[]> {
  return Promise.all(pathsOrUrls.map((p) => resolveMomentPhotoUrl(p)));
}
