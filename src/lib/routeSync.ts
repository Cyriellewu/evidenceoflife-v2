/**
 * Sync day-route points with Supabase (`route_points`) so a route recorded on
 * the phone shows on the desktop Recap.
 *
 * Egress rules (the project once exhausted its free egress quota):
 *  - uploads never read rows back (no select / returning)
 *  - reads ask for one day only, three columns, ordered and paged
 *  - a day already fetched is cached; today only asks for points newer than
 *    the last one it has, at most every 5 minutes
 */
import { supabase } from '@/integrations/supabase/client';
import { getAllRoutePoints, localDayKey, type RoutePoint } from '@/lib/routeRecorder';

const PAGE = 1000;
const TODAY_REFRESH_MS = 5 * 60 * 1000;
const UPLOAD_CHUNK = 500;
const RETENTION_DAYS = 90;

const syncedUntilKey = (owner: string) => `eol:route-synced-until:v1:${owner}`;
const prunedOnKey = (owner: string) => `eol:route-pruned-on:v1:${owner}`;

function readNumber(key: string): number {
  try {
    const n = Number(localStorage.getItem(key));
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

function writeValue(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

let uploading = false;

/** Upload points recorded on this device that the server doesn't have yet. */
export async function uploadRoutePoints(owner: string): Promise<void> {
  if (uploading) return;
  uploading = true;
  try {
    const since = readNumber(syncedUntilKey(owner));
    const pending = getAllRoutePoints(owner)
      .filter(({ point }) => point.t > since)
      .sort((a, b) => a.point.t - b.point.t);
    for (let i = 0; i < pending.length; i += UPLOAD_CHUNK) {
      const chunk = pending.slice(i, i + UPLOAD_CHUNK);
      const rows = chunk.map(({ day, point }) => ({
        user_id: owner,
        day,
        t: new Date(point.t).toISOString(),
        lat: point.lat,
        lng: point.lng,
        acc: point.acc != null ? Math.max(0, Math.round(point.acc)) : null,
      }));
      // Duplicates are skipped (unique user_id,t + insert trigger), so a retry is safe.
      const { error } = await supabase
        .from('route_points')
        .upsert(rows, { onConflict: 'user_id,t', ignoreDuplicates: true });
      if (error) return; // try again on the next flush
      writeValue(syncedUntilKey(owner), String(chunk[chunk.length - 1].point.t));
    }
    await pruneOldRows(owner);
  } finally {
    uploading = false;
  }
}

/** Delete this user's rows older than RETENTION_DAYS, at most once a day. */
async function pruneOldRows(owner: string) {
  const today = localDayKey(Date.now());
  try {
    if (localStorage.getItem(prunedOnKey(owner)) === today) return;
  } catch {
    return;
  }
  const cutoff = localDayKey(Date.now() - RETENTION_DAYS * 86400000);
  const { error } = await supabase.from('route_points').delete().eq('user_id', owner).lt('day', cutoff);
  if (!error) writeValue(prunedOnKey(owner), today);
}

type CacheEntry = { points: RoutePoint[]; fetchedAt: number; inflight?: Promise<RoutePoint[]> };
const cache = new Map<string, CacheEntry>();

async function fetchPage(owner: string, day: string, afterIso: string | null, from: number) {
  let q = supabase.from('route_points').select('t,lat,lng').eq('user_id', owner).eq('day', day);
  if (afterIso) q = q.gt('t', afterIso);
  return q.order('t', { ascending: true }).range(from, from + PAGE - 1);
}

/** Points the server has for `day` (all devices). Cached; see egress rules above. */
export async function fetchServerRoutePoints(owner: string, day: string): Promise<RoutePoint[]> {
  const key = `${owner}:${day}`;
  const entry = cache.get(key);
  const isToday = day === localDayKey(Date.now());
  if (entry?.inflight) return entry.inflight;
  if (entry && (!isToday || Date.now() - entry.fetchedAt < TODAY_REFRESH_MS)) return entry.points;

  const known = entry?.points ?? [];
  const afterIso = known.length ? new Date(known[known.length - 1].t).toISOString() : null;
  const run = (async () => {
    const fresh: RoutePoint[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await fetchPage(owner, day, afterIso, from);
      // Throw so a failed read isn't cached as "this day has no points".
      if (error || !data) throw error ?? new Error('route points read failed');
      for (const r of data) fresh.push({ t: new Date(r.t).getTime(), lat: r.lat, lng: r.lng });
      if (data.length < PAGE) break;
    }
    const points = [...known, ...fresh];
    cache.set(key, { points, fetchedAt: Date.now() });
    return points;
  })();
  cache.set(key, { points: known, fetchedAt: entry?.fetchedAt ?? 0, inflight: run });
  try {
    return await run;
  } catch {
    cache.set(key, { points: known, fetchedAt: entry?.fetchedAt ?? 0 });
    return known;
  }
}

/** Remove a day's points everywhere (server + cache). */
export async function deleteServerRouteDay(owner: string, day: string): Promise<boolean> {
  cache.delete(`${owner}:${day}`);
  const { error } = await supabase.from('route_points').delete().eq('user_id', owner).eq('day', day);
  return !error;
}

/** Merge local and server points for one day, de-duplicated by timestamp. */
export function mergeRoutePoints(local: RoutePoint[], server: RoutePoint[]): RoutePoint[] {
  const byT = new Map<number, RoutePoint>();
  for (const p of server) byT.set(p.t, p);
  for (const p of local) byT.set(p.t, p);
  return [...byT.values()].sort((a, b) => a.t - b.t);
}
