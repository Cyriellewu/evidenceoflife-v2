import { uploadPhotos } from '@/hooks/moments/data';

// Images inlined as data: URLs (multi-MB) or blob: URLs (tab-local, dead after
// reload) must never be written to a database row: every list fetch would pull
// them again, which is what exhausted the Supabase egress quota.
export function isInlineImage(src: string): boolean {
  return src.startsWith('data:') || src.startsWith('blob:');
}

export function stripInlineImages(images: string[] | undefined): string[] {
  return (images || []).filter(src => typeof src === 'string' && !isInlineImage(src));
}

/**
 * Upload any data: images to Storage under `<uid>/<folder>/` and return the
 * list to persist: storage paths and existing URLs, never data:/blob:.
 * `failed` counts images that could not be uploaded (and were dropped).
 */
export async function toCloudImages(
  userId: string,
  images: string[] | undefined,
  folder: string,
): Promise<{ images: string[]; failed: number }> {
  const list = (images || []).filter(src => typeof src === 'string' && src.length > 0);
  const toUpload = list.filter(src => src.startsWith('data:'));
  const uploaded = toUpload.length ? await uploadPhotos(userId, toUpload, folder) : [];
  const failed = toUpload.length - uploaded.length + list.filter(src => src.startsWith('blob:')).length;
  return { images: [...stripInlineImages(list), ...uploaded], failed };
}
