import { toast } from 'sonner';

// Phone photos are big, but uploads are downscaled to a ~1600 px JPEG first
// (shrinkPhoto in momentPhotos.ts), so the original size doesn't drive storage
// egress. 25 MB covers full-resolution iPhone shots.
export const MAX_PHOTO_PICK_BYTES = 25 * 1024 * 1024;
const MAX_FILE_SIZE = MAX_PHOTO_PICK_BYTES;
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp', 'image/heic', 'image/heif'];
const MAX_PHOTOS = 10;

export function validatePhotoFile(file: File): boolean {
  if (!ALLOWED_TYPES.includes(file.type)) {
    toast.error(`Invalid file type: ${file.type}. Only PNG, JPEG, GIF, WebP, HEIC allowed.`);
    return false;
  }
  if (file.size > MAX_FILE_SIZE) {
    toast.error(`File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max ${MAX_FILE_SIZE / 1024 / 1024}MB.`);
    return false;
  }
  return true;
}

export function canAddMorePhotos(currentCount: number, adding: number): boolean {
  if (currentCount + adding > MAX_PHOTOS) {
    toast.error(`Max ${MAX_PHOTOS} photos per moment.`);
    return false;
  }
  return true;
}
