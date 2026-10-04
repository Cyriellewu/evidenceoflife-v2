import type { GeoCoords } from '@/lib/geoCoords';
import { readCachedGeoCoords, writeCachedGeoCoords } from '@/lib/geoCoords';

export type GeoErrorKind =
  | 'unsupported'
  | 'insecure'
  | 'permission'
  | 'unavailable'
  | 'timeout'
  | 'unknown';

export class GeoPositionError extends Error {
  kind: GeoErrorKind;
  constructor(kind: GeoErrorKind, message?: string) {
    super(message || kind);
    this.kind = kind;
    this.name = 'GeoPositionError';
  }
}

/** Classify browser GeolocationPositionError (and our wrappers). */
export function classifyGeoError(err: unknown): GeoErrorKind {
  if (err instanceof GeoPositionError) return err.kind;
  if (typeof err === 'object' && err && 'code' in err) {
    const code = Number((err as { code: number }).code);
    // 1 PERMISSION_DENIED, 2 POSITION_UNAVAILABLE, 3 TIMEOUT
    if (code === 1) return 'permission';
    if (code === 2) return 'unavailable';
    if (code === 3) return 'timeout';
  }
  const msg = String((err as { message?: string })?.message || err || '').toLowerCase();
  if (/permission|denied|secure|only secure/i.test(msg)) return 'permission';
  if (/timeout/i.test(msg)) return 'timeout';
  if (/unavailable|not supported/i.test(msg)) return 'unavailable';
  return 'unknown';
}

export function geoErrorMessage(kind: GeoErrorKind, lang: string): string {
  const zh = lang.startsWith('zh');
  switch (kind) {
    case 'permission':
      return zh
        ? '定位权限被拒绝。请在系统设置里允许此网站使用位置，然后重试。'
        : 'Location permission denied. Allow it in Settings, then try again.';
    case 'timeout':
      return zh
        ? '定位超时。请到开阔处重试，或先搜索地点名称。'
        : 'Location timed out. Try again outdoors, or search by place name.';
    case 'insecure':
      return zh
        ? '当前页面不是安全连接，浏览器不允许定位。'
        : 'This page is not a secure context, so location is blocked.';
    case 'unsupported':
      return zh ? '此浏览器不支持定位。' : 'This browser does not support location.';
    case 'unavailable':
      return zh
        ? '暂时无法确定位置。请稍后重试，或直接搜索地点。'
        : 'Could not determine your position. Retry later, or search by name.';
    default:
      return zh
        ? '无法获取位置。请重试，或直接搜索地点名称。'
        : 'Could not get your location. Retry, or search by place name.';
  }
}

const CACHED_OPTS: PositionOptions = {
  enableHighAccuracy: false,
  // Prefer a recent fix — iOS often returns instantly from Wi‑Fi cache.
  maximumAge: 5 * 60_000,
  timeout: 12_000,
};

const FRESH_OPTS: PositionOptions = {
  enableHighAccuracy: false,
  // A user-initiated retry must not reuse the failed reading that iOS Safari
  // can retain after the website permission changes in Settings.
  maximumAge: 0,
  timeout: 18_000,
};

function requestPosition(options: PositionOptions): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new GeoPositionError('unsupported'));
      return;
    }
    // Geolocation requires a secure context (https / localhost).
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      reject(new GeoPositionError('insecure'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });
}

/**
 * iOS-friendly getCurrentPosition:
 * 1) return session cache when allowed
 * 2) try a cache-friendly GPS read
 * 3) one fresh retry on transient failures, including a stale iOS permission
 *    callback after the user has just changed Safari Settings
 *
 * Never conflates timeout with permission denial.
 */
export async function getGeoPosition(opts?: {
  force?: boolean;
  allowCache?: boolean;
}): Promise<GeoCoords> {
  const allowCache = opts?.allowCache !== false;
  const force = opts?.force === true;

  if (!force && allowCache) {
    const cached = readCachedGeoCoords();
    if (cached) return cached;
  }

  try {
    const pos = await requestPosition(force ? FRESH_OPTS : CACHED_OPTS);
    const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    writeCachedGeoCoords(next);
    return next;
  } catch (err) {
    const kind = classifyGeoError(err);
    // A permission callback is normally final. On an explicit user retry,
    // however, iOS Safari can deliver one stale PERMISSION_DENIED result after
    // the site was changed to Allow in Settings. Ask the browser once more;
    // never loop or retry silent/background requests.
    const shouldRetry =
      kind === 'timeout'
      || kind === 'unavailable'
      || kind === 'unknown'
      || (force && kind === 'permission');
    if (shouldRetry) {
      try {
        const pos = await requestPosition(FRESH_OPTS);
        const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        writeCachedGeoCoords(next);
        return next;
      } catch (retryErr) {
        throw new GeoPositionError(classifyGeoError(retryErr));
      }
    }
    throw new GeoPositionError(kind);
  }
}
