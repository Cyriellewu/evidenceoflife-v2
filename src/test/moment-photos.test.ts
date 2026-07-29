import { describe, expect, it } from 'vitest';
import { momentPhotoObjectPath } from '@/lib/momentPhotos';

describe('momentPhotoObjectPath', () => {
  it('passes through raw storage paths', () => {
    expect(momentPhotoObjectPath('user-1/abc.jpg')).toBe('user-1/abc.jpg');
  });

  it('extracts path from legacy public URLs', () => {
    const url =
      'https://nfhnfeurajtrrtqvckpx.supabase.co/storage/v1/object/public/moment-photos/user-1/abc.jpg';
    expect(momentPhotoObjectPath(url)).toBe('user-1/abc.jpg');
  });

  it('returns null for unrelated URLs', () => {
    expect(momentPhotoObjectPath('https://example.com/x.jpg')).toBeNull();
  });
});
