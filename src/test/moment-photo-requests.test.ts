import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { createSignedUrl } = vi.hoisted(() => ({ createSignedUrl: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { storage: { from: () => ({ createSignedUrl }) } },
}));

beforeEach(() => {
  vi.resetModules();
  createSignedUrl.mockReset();
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe('photo request reuse', () => {
  it('shares in-flight and completed requests for the same object across URL formats', async () => {
    const { resolveMomentPhotoUrl } = await import('@/lib/momentPhotos');
    let finish!: (value: unknown) => void;
    createSignedUrl.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const first = resolveMomentPhotoUrl('user/photo.png');
    const second = resolveMomentPhotoUrl('https://example.supabase.co/storage/v1/object/public/moment-photos/user/photo.png');
    await vi.waitFor(() => expect(createSignedUrl).toHaveBeenCalledTimes(1));
    finish({ data: { signedUrl: 'https://example.com/signed.png' }, error: null });
    expect(await Promise.all([first, second])).toEqual([
      'https://example.com/signed.png', 'https://example.com/signed.png',
    ]);
    expect(await resolveMomentPhotoUrl('user/photo.png')).toBe('https://example.com/signed.png');
    expect(createSignedUrl).toHaveBeenCalledTimes(1);
  });

  it('renews before the signed URL expires', async () => {
    const { resolveMomentPhotoUrl } = await import('@/lib/momentPhotos');
    createSignedUrl.mockResolvedValueOnce({ data: { signedUrl: 'first' }, error: null })
      .mockResolvedValueOnce({ data: { signedUrl: 'renewed' }, error: null });
    await resolveMomentPhotoUrl('user/photo.png');
    vi.advanceTimersByTime(59 * 60 * 1000);
    expect(await resolveMomentPhotoUrl('user/photo.png')).toBe('renewed');
    expect(createSignedUrl).toHaveBeenCalledTimes(2);
  });

  it('backs off service restrictions and never falls back to a public download', async () => {
    const { resolveMomentPhotoUrl } = await import('@/lib/momentPhotos');
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    createSignedUrl.mockResolvedValue({ data: null, error: { message: 'exceed_egress_quota' } });
    const src = 'https://example.supabase.co/storage/v1/object/public/moment-photos/user/photo.png';
    expect(await resolveMomentPhotoUrl(src)).toBe('');
    expect(await resolveMomentPhotoUrl(src)).toBe('');
    expect(createSignedUrl).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(30_000);
    await resolveMomentPhotoUrl(src);
    expect(createSignedUrl).toHaveBeenCalledTimes(2);
    log.mockRestore();
  });
});
