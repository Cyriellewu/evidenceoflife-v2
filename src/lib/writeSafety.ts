const localQueues = new Map<string, Promise<void>>();

/**
 * Serialize writes for one logical resource. Web Locks covers other tabs on
 * the same origin; the promise queue is the fallback and also keeps tests and
 * older browsers safe.
 */
export async function withExclusiveWrite<T>(key: string, write: () => Promise<T>): Promise<T> {
  const lockManager = typeof navigator !== 'undefined'
    ? (navigator as Navigator & { locks?: LockManager }).locks
    : undefined;

  if (lockManager) {
    return lockManager.request(`eol:${key}`, write);
  }

  const previous = localQueues.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>(resolve => { release = resolve; });
  const queued = previous.then(() => current);
  localQueues.set(key, queued);

  await previous;
  try {
    return await write();
  } finally {
    release();
    if (localQueues.get(key) === queued) localQueues.delete(key);
  }
}

/** Build a stable UUID from a logical write key, so retries hit one row. */
export async function stableWriteUuid(...parts: string[]): Promise<string> {
  const input = new TextEncoder().encode(parts.join('\u001f'));
  const digest = await crypto.subtle.digest('SHA-256', input);
  const bytes = new Uint8Array(digest).slice(0, 16);
  // RFC 4122 variant + v5-shaped deterministic UUID.
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function isUniqueViolation(error: unknown): boolean {
  return String((error as { code?: unknown } | null)?.code || '') === '23505';
}
