import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StorageImage } from '@/components/StorageImage';
import { resolveMomentPhotoUrl } from '@/lib/momentPhotos';

vi.mock('@/lib/momentPhotos', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/momentPhotos')>(),
  resolveMomentPhotoUrl: vi.fn(),
}));
afterEach(() => vi.clearAllMocks());

describe('StorageImage', () => {
  it('does not load a public URL before signing or re-resolve on unrelated renders', async () => {
    let resolve!: (url: string) => void;
    vi.mocked(resolveMomentPhotoUrl).mockReturnValueOnce(new Promise(done => { resolve = done; }));
    const src = 'https://example.supabase.co/storage/v1/object/public/moment-photos/user/photo.png';
    const { rerender } = render(<StorageImage src={src} alt="Saved photo" />);
    expect(screen.getByAltText('Saved photo')).not.toHaveAttribute('src');
    rerender(<StorageImage src={src} alt="Saved photo" className="updated" />);
    await act(async () => { resolve('https://example.com/signed.png'); });
    expect(screen.getByAltText('Saved photo')).toHaveAttribute('src', 'https://example.com/signed.png');
    expect(resolveMomentPhotoUrl).toHaveBeenCalledTimes(1);
  });
  it('replaces the old image immediately and ignores late resolutions', async () => {
    let resolveOld!: (url: string) => void;
    let resolveNew!: (url: string) => void;
    vi.mocked(resolveMomentPhotoUrl)
      .mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve; }))
      .mockReturnValueOnce(new Promise(resolve => { resolveNew = resolve; }));
    const { rerender } = render(<StorageImage src="user/old.png" alt="Preview" />);
    rerender(<StorageImage src="data:image/png;base64,new" alt="Preview" />);
    expect(screen.getByAltText('Preview')).toHaveAttribute('src', 'data:image/png;base64,new');
    await act(async () => { resolveOld('https://example.com/old-signed.png'); });
    expect(screen.getByAltText('Preview')).toHaveAttribute('src', 'data:image/png;base64,new');
    await act(async () => { resolveNew('data:image/png;base64,new'); });
    expect(screen.getByAltText('Preview')).toHaveAttribute('src', 'data:image/png;base64,new');
  });
});
