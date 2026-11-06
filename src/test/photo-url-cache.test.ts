import { beforeEach, describe, expect, it, vi } from 'vitest';

const createSignedUrl = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { storage: { from: () => ({ createSignedUrl }) } },
}));

describe('signed photo URL cache', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    createSignedUrl.mockReset();
    createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://x/sign/a.jpg?token=1' }, error: null });
  });

  it('reuses a signed URL after a reload instead of signing (and downloading) again', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const first = await import('@/lib/momentPhotos');
    expect(await first.resolveMomentPhotoUrl('user/a.jpg')).toBe('https://x/sign/a.jpg?token=1');
    await vi.advanceTimersByTimeAsync(600);
    vi.useRealTimers();

    vi.resetModules(); // simulate a page reload: fresh module, same localStorage
    const second = await import('@/lib/momentPhotos');
    expect(await second.resolveMomentPhotoUrl('user/a.jpg')).toBe('https://x/sign/a.jpg?token=1');
    expect(createSignedUrl).toHaveBeenCalledTimes(1);
  });

  it('forgets cached links on sign-out', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const mod = await import('@/lib/momentPhotos');
    await mod.resolveMomentPhotoUrl('user/a.jpg');
    await vi.advanceTimersByTimeAsync(600);
    vi.useRealTimers();
    mod.clearPhotoUrlCache();
    expect(localStorage.getItem('eol-photo-urls-v1')).toBeNull();
  });
});
