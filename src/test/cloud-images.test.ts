import { beforeEach, describe, expect, it, vi } from 'vitest';

const { uploadPhotos } = vi.hoisted(() => ({ uploadPhotos: vi.fn() }));
vi.mock('@/hooks/moments/data', () => ({ uploadPhotos }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { isInlineImage, stripInlineImages, toCloudImages } from '@/lib/cloudImages';
import { createMomentPhotoObjectPath } from '@/lib/momentPhotos';
import { groupsForCloud, type LinkGroup } from '@/hooks/useLinks';

const DATA = 'data:image/png;base64,AAAA';
const BLOB = 'blob:https://app/123';

beforeEach(() => uploadPhotos.mockReset());

describe('inline image detection', () => {
  it('treats data: and blob: as inline, storage paths and URLs as durable', () => {
    expect(isInlineImage(DATA)).toBe(true);
    expect(isInlineImage(BLOB)).toBe(true);
    expect(isInlineImage('u1/sticky/1-a.webp')).toBe(false);
    expect(stripInlineImages([DATA, 'u1/a.webp', BLOB, 'https://x/y.png'])).toEqual(['u1/a.webp', 'https://x/y.png']);
  });
});

describe('toCloudImages', () => {
  it('uploads data: images into the folder and never returns data:/blob:', async () => {
    uploadPhotos.mockResolvedValue(['u1/sticky/1-a.webp']);
    const result = await toCloudImages('u1', ['u1/old.webp', DATA], 'sticky');
    expect(uploadPhotos).toHaveBeenCalledWith('u1', [DATA], 'sticky');
    expect(result).toEqual({ images: ['u1/old.webp', 'u1/sticky/1-a.webp'], failed: 0 });
  });

  it('drops images that failed to upload and counts them', async () => {
    uploadPhotos.mockResolvedValue([]);
    const result = await toCloudImages('u1', [DATA, BLOB], 'sticky');
    expect(result.images).toEqual([]);
    expect(result.failed).toBe(2);
  });

  it('skips the upload call when nothing is inline', async () => {
    const result = await toCloudImages('u1', ['u1/a.webp'], 'sticky');
    expect(uploadPhotos).not.toHaveBeenCalled();
    expect(result).toEqual({ images: ['u1/a.webp'], failed: 0 });
  });
});

describe('storage paths', () => {
  it('nests a folder under the user id (the segment storage policies check)', () => {
    expect(createMomentPhotoObjectPath('u1', 'webp', 'sticky')).toMatch(/^u1\/sticky\/\d+-[0-9a-f-]+\.webp$/);
    expect(createMomentPhotoObjectPath('u1', 'webp')).toMatch(/^u1\/\d+-[0-9a-f-]+\.webp$/);
  });
});

describe('Links cloud copy', () => {
  it('strips blob:/data: section photos before writing profiles.settings', () => {
    const groups = [{
      id: 'g', title: 'G', collapsed: false, createdAt: '',
      sections: [{ id: 's', title: 'S', links: [], photos: [BLOB, DATA, 'u1/links/1-a.png'], collapsed: false, createdAt: '' }],
    }] as unknown as LinkGroup[];
    expect(groupsForCloud(groups)[0].sections[0].photos).toEqual(['u1/links/1-a.png']);
    // the local (in-memory) copy keeps the preview
    expect(groups[0].sections[0].photos).toHaveLength(3);
  });
});
