import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StorageImage } from '@/components/StorageImage';
import { resolveMomentPhotoUrl } from '@/lib/momentPhotos';

vi.mock('@/lib/momentPhotos', () => ({ resolveMomentPhotoUrl: vi.fn() }));
afterEach(() => vi.clearAllMocks());

describe('StorageImage', () => {
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
