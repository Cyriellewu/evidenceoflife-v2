export type SupabaseQueryResult<T> = { data: T | null; error: unknown };

export function isRetryableSupabaseError(error: unknown): boolean {
  const value = error as { status?: unknown; statusCode?: unknown; code?: unknown; message?: unknown } | null;
  const status = Number(value?.status ?? value?.statusCode);
  const code = String(value?.code || '');
  const message = String(value?.message || error || '').toLowerCase();

  if (message.includes('exceed_egress_quota') || message.includes('payment required')) return false;
  if (Number.isFinite(status) && status >= 400 && status < 500) {
    return status === 408 || status === 429;
  }
  if (status >= 500) return true;
  return ['57014', '53300', '57P01', '57P02', '57P03'].includes(code)
    || /network|fetch|timeout|temporar|connection/.test(message);
}

export async function fetchSupabaseWithRetry<T>(
  fn: () => PromiseLike<SupabaseQueryResult<T>>,
  maxAttempts = 3,
  delayMs = 1200,
): Promise<SupabaseQueryResult<T>> {
  let lastResult: SupabaseQueryResult<T> = { data: null, error: null };

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      lastResult = await fn();
    } catch (error) {
      lastResult = { data: null, error };
    }

    if (!lastResult.error && lastResult.data !== null) return lastResult;
    if (!isRetryableSupabaseError(lastResult.error) || attempt >= maxAttempts - 1) break;
    await new Promise(resolve => setTimeout(resolve, delayMs * (attempt + 1)));
  }

  return lastResult;
}
