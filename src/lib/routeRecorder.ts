/**
 * Day route recorder — foreground only.
 *
 * Browsers (iOS Safari especially) give a web app no location in the
 * background, so this only records while the app is open and visible. Points
 * stay on this device (localStorage); nothing is sent to the server.
 */

export interface RoutePoint {
  lat: number;
  lng: number;
  /** epoch ms */
  t: number;
  /** accuracy in metres */
  acc?: number;
}

// Keyed per account so another sign-in on the same browser never sees or
// continues someone else's track.
const pointsKey = (owner: string) => `eol:route-points:v1:${owner}`;
const enabledKey = (owner: string) => `eol:route-recording:v1:${owner}`;
const KEEP_DAYS = 30;
/** Hard cap per day so the track can't crowd out other local storage. */
export const MAX_POINTS_PER_DAY = 1500;
/** Ignore fixes worse than this (metres). */
export const MAX_ACCURACY_M = 150;
/** Record when moved at least this far… */
export const MIN_MOVE_M = 60;
/** …or this long since the last point while standing still. */
export const MIN_INTERVAL_MS = 10 * 60 * 1000;

export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Whether a new fix is worth keeping after `last`. */
export function shouldRecordPoint(last: RoutePoint | undefined, next: RoutePoint): boolean {
  if (next.acc != null && next.acc > MAX_ACCURACY_M) return false;
  if (!last) return true;
  if (next.t <= last.t) return false;
  return distanceM(last, next) >= MIN_MOVE_M || next.t - last.t >= MIN_INTERVAL_MS;
}

export function localDayKey(t: number): string {
  const d = new Date(t);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

type Store = Record<string, RoutePoint[]>;

function readStore(owner: string): Store {
  try {
    const raw = localStorage.getItem(pointsKey(owner));
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(owner: string, store: Store) {
  try {
    localStorage.setItem(pointsKey(owner), JSON.stringify(store));
  } catch {
    /* storage full or blocked — recording is best-effort */
  }
}

export function getRoutePoints(owner: string | undefined, dayKey: string): RoutePoint[] {
  if (!owner) return [];
  const pts = readStore(owner)[dayKey];
  return Array.isArray(pts) ? pts : [];
}

/** Append a fix if it passes `shouldRecordPoint`; prunes days older than KEEP_DAYS. */
export function addRoutePoint(owner: string, point: RoutePoint): boolean {
  const store = readStore(owner);
  const key = localDayKey(point.t);
  const day = Array.isArray(store[key]) ? store[key] : [];
  if (day.length >= MAX_POINTS_PER_DAY) return false;
  if (!shouldRecordPoint(day[day.length - 1], point)) return false;
  day.push({
    lat: Math.round(point.lat * 1e5) / 1e5,
    lng: Math.round(point.lng * 1e5) / 1e5,
    t: point.t,
    acc: point.acc != null ? Math.round(point.acc) : undefined,
  });
  store[key] = day;
  const cutoff = localDayKey(point.t - KEEP_DAYS * 86400000);
  for (const k of Object.keys(store)) if (k < cutoff) delete store[k];
  writeStore(owner, store);
  return true;
}

export function clearRouteDay(owner: string, dayKey: string) {
  const store = readStore(owner);
  delete store[dayKey];
  writeStore(owner, store);
}

export function isRouteRecordingEnabled(owner: string | undefined): boolean {
  if (!owner) return false;
  try {
    return localStorage.getItem(enabledKey(owner)) === '1';
  } catch {
    return false;
  }
}

export function setRouteRecordingEnabled(owner: string, on: boolean) {
  try {
    if (on) localStorage.setItem(enabledKey(owner), '1');
    else localStorage.removeItem(enabledKey(owner));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent('eol:route-recording-change'));
}

/**
 * Watch position while the page is visible. Returns a stop function.
 * `onPoint` fires for every fix that was stored.
 */
export function startRouteRecorder(owner: string, onPoint?: (p: RoutePoint) => void): () => void {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return () => {};
  let watchId: number | null = null;

  const start = () => {
    if (watchId != null || document.visibilityState !== 'visible') return;
    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const p: RoutePoint = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          t: pos.timestamp || Date.now(),
          acc: pos.coords.accuracy,
        };
        if (addRoutePoint(owner, p)) onPoint?.(p);
      },
      () => { /* denied or unavailable — stay quiet */ },
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 30_000 },
    );
  };
  const stop = () => {
    if (watchId != null) navigator.geolocation.clearWatch(watchId);
    watchId = null;
  };
  const onVisibility = () => (document.visibilityState === 'visible' ? start() : stop());

  start();
  document.addEventListener('visibilitychange', onVisibility);
  return () => {
    document.removeEventListener('visibilitychange', onVisibility);
    stop();
  };
}
