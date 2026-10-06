import { describe, expect, it, vi } from 'vitest';
import { fetchSupabaseWithRetry, isRetryableSupabaseError } from '@/lib/supabaseRetry';

describe('Supabase retry policy', () => {
  it('does not retry quota restrictions', async () => {
    const request = vi.fn().mockResolvedValue({
      data: null,
      error: { status: 402, message: 'exceed_egress_quota' },
    });

    const result = await fetchSupabaseWithRetry(request, 3, 0);

    expect(result.error).toBeTruthy();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('retries transient failures but never exceeds max attempts', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce({ data: null, error: { status: 503, message: 'temporarily unavailable' } })
      .mockResolvedValueOnce({ data: ['ok'], error: null });

    await expect(fetchSupabaseWithRetry(request, 3, 0)).resolves.toEqual({ data: ['ok'], error: null });
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('treats ordinary client errors as permanent', () => {
    expect(isRetryableSupabaseError({ status: 401 })).toBe(false);
    expect(isRetryableSupabaseError({ status: 429 })).toBe(true);
  });
});
