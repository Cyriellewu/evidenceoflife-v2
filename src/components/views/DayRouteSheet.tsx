import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { addDays, format, parseISO } from 'date-fns';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Moment } from '@/types';
import { useLanguage } from '@/hooks/useLanguage';
import { useAuth } from '@/hooks/useAuth';
import { useDateLocale } from '@/hooks/useDateLocale';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { StorageImage } from '@/components/StorageImage';
import { addBasemap, LIFE_MAP_COLOR } from '@/lib/mapBasemap';
import { deleteServerRouteDay, fetchServerRoutePoints, mergeRoutePoints } from '@/lib/routeSync';
import {
  clearRouteDay,
  getRoutePoints,
  isRouteRecordingEnabled,
  distanceM,
  localDayKey,
  setRouteRecordingEnabled,
  type RoutePoint,
} from '@/lib/routeRecorder';

interface Stop {
  id: string;
  t: number;
  lat: number;
  lng: number;
  text: string;
  place: string;
  photo?: string;
}

function stopsForDay(moments: Moment[], dayKey: string): Stop[] {
  return moments
    .filter(m => m.location && m.date?.slice(0, 10) === dayKey)
    .map(m => {
      const iso = m.timer_started_at || m.createdAt;
      return {
        id: m.id,
        t: iso ? parseISO(iso).getTime() : 0,
        lat: m.location!.lat,
        lng: m.location!.lng,
        text: m.text || m.emoji || '',
        place: m.location!.name,
        photo: m.photos?.[0],
      };
    })
    .filter(s => Number.isFinite(s.lat) && Number.isFinite(s.lng))
    .sort((a, b) => a.t - b.t);
}

/** Numbered stop pin. Inherits the app font; white ring like the other map pins. */
const stopIconHtml = (label: string) => {
  const w = label.length > 2 ? 30 : 22;
  return `<div style="min-width:${w}px;height:22px;padding:0 4px;box-sizing:border-box;border-radius:999px;background:${LIFE_MAP_COLOR};color:#fff;font:600 12px/18px inherit;text-align:center;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.3)">${label}</div>`;
};

/** Stops within ~80 m share one pin ("2–3") instead of stacking on top of each other. */
function groupStops(stops: Stop[]): { lat: number; lng: number; label: string }[] {
  const groups: { lat: number; lng: number; first: number; last: number }[] = [];
  stops.forEach((s, i) => {
    const near = groups.find(g => distanceM(g, s) < 80);
    if (near) near.last = i + 1;
    else groups.push({ lat: s.lat, lng: s.lng, first: i + 1, last: i + 1 });
  });
  return groups.map(g => ({ lat: g.lat, lng: g.lng, label: g.first === g.last ? String(g.first) : `${g.first}–${g.last}` }));
}

/** The demo must never read or start a real track on this device. */
function useRouteOwner(): string | undefined {
  const { user, isDemo } = useAuth();
  return isDemo ? undefined : user?.id;
}

/** One day's stops (moments with a location) + recorded points, merged in time order. */
function useDayRoute(moments: Moment[], dayKey: string, owner: string | undefined, live: boolean) {
  const [tick, setTick] = useState(0);
  const stops = useMemo(() => stopsForDay(moments, dayKey), [moments, dayKey]);
  // Re-read recorded points when the day changes or new ones land.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const local = useMemo<RoutePoint[]>(() => getRoutePoints(owner, dayKey), [owner, dayKey, tick]);
  // Points other devices uploaded for this day (cached; one small query per day).
  const [server, setServer] = useState<{ key: string; points: RoutePoint[] }>({ key: '', points: [] });
  useEffect(() => {
    if (!owner) return;
    let cancelled = false;
    void fetchServerRoutePoints(owner, dayKey)
      .then(points => {
        if (cancelled) return;
        const key = `${owner}:${dayKey}`;
        // Same cached array → keep state, so the map doesn't redraw and re-fit.
        setServer(prev => (prev.key === key && prev.points === points ? prev : { key, points }));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [owner, dayKey, tick]);
  const tracked = useMemo(
    () => mergeRoutePoints(local, server.key === `${owner}:${dayKey}` ? server.points : []),
    [local, server, owner, dayKey],
  );
  const path = useMemo(
    () => [...tracked.map(p => ({ t: p.t, lat: p.lat, lng: p.lng })), ...stops.map(s => ({ t: s.t, lat: s.lat, lng: s.lng }))]
      .sort((a, b) => a.t - b.t),
    [tracked, stops],
  );
  // Pick up points the recorder stores while this is on screen.
  useEffect(() => {
    if (!live) return;
    const id = window.setInterval(() => setTick(n => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, [live]);
  const refresh = () => setTick(n => n + 1);
  return { stops, tracked, path, refresh };
}

/** Draws a route into a Leaflet map mounted on `mapEl`. */
function useRouteMap(
  mapEl: React.RefObject<HTMLDivElement>,
  path: { lat: number; lng: number }[],
  stops: Stop[],
  fallbackCenter: [number, number] | null,
  interactive: boolean,
) {
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!mapEl.current || mapRef.current) return;
    const map = L.map(mapEl.current, {
      zoomControl: false,
      attributionControl: true, // OpenStreetMap data needs visible credit, also on the mini map
      dragging: interactive,
      scrollWheelZoom: interactive,
      doubleClickZoom: interactive,
      touchZoom: interactive,
      boxZoom: interactive,
      keyboard: interactive,
    }).setView([20, 0], 2);
    addBasemap(map);
    mapRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);
    return () => { map.remove(); mapRef.current = null; layerRef.current = null; };
  }, [mapEl, interactive]);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    if (path.length === 0) {
      if (fallbackCenter) map.setView(fallbackCenter, 13);
      return;
    }
    const latlngs = path.map(p => L.latLng(p.lat, p.lng));
    if (latlngs.length > 1) {
      L.polyline(latlngs, { color: LIFE_MAP_COLOR, weight: 4, opacity: 0.85, lineJoin: 'round' }).addTo(layer);
    }
    groupStops(stops).forEach(g => {
      const w = g.label.length > 2 ? 30 : 22;
      L.marker([g.lat, g.lng], {
        icon: L.divIcon({ className: '', html: stopIconHtml(g.label), iconSize: [w, 22], iconAnchor: [w / 2, 11] }),
        interactive: false,
      }).addTo(layer);
    });
    if (stops.length === 0) {
      // Recorded track only: mark where the day started and where it ends.
      const dot = (ll: L.LatLng) =>
        L.circleMarker(ll, { radius: 5, color: '#fff', weight: 2, fillColor: LIFE_MAP_COLOR, fillOpacity: 1, interactive: false }).addTo(layer);
      dot(latlngs[0]);
      if (latlngs.length > 1) dot(latlngs[latlngs.length - 1]);
    }
    map.fitBounds(L.latLngBounds(latlngs), { padding: [28, 28], maxZoom: 16 });
  }, [path, stops, fallbackCenter]);
}

/**
 * Desktop Recap side card: the selected day's route as a small, still map.
 * Hidden when the day has no locations. Click opens the full Day route sheet.
 */
export function DayRouteCard({ moments, allMoments, dayKey }: { moments: Moment[]; allMoments?: Moment[]; dayKey: string }) {
  const { lang } = useLanguage();
  const zh = lang === 'zh';
  const owner = useRouteOwner();
  const isToday = dayKey === localDayKey(Date.now());
  // Today keeps polling (cache-throttled to one small query per 5 min) so a
  // route the phone records shows up here even when this device isn't recording.
  const live = isToday && !!owner;
  const { stops, tracked, path } = useDayRoute(moments, dayKey, owner, live);
  const [open, setOpen] = useState(false);

  if (path.length === 0) return null;
  const summary = [
    stops.length > 0 ? (zh ? `${stops.length} 个地点` : `${stops.length} ${stops.length === 1 ? 'place' : 'places'}`) : '',
    tracked.length > 0 ? (zh ? `${tracked.length} 个位置点` : `${tracked.length} points`) : '',
  ].filter(Boolean).join(' · ');

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="block w-full rounded-2xl border border-border/40 bg-card p-4 text-left transition-colors hover:border-border/70"
      >
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[17px] font-semibold tracking-tight text-foreground">{zh ? (isToday ? '今天的路线' : '这天的路线') : (isToday ? "Today's route" : 'Route')}</span>
          <span className="text-[13px] text-muted-foreground">{summary}</span>
        </div>
        <div className="mt-3 overflow-hidden rounded-xl">
          <RouteMiniMap path={path} stops={stops} />
        </div>
      </button>
      {open && <DayRouteSheet moments={allMoments ?? moments} initialDayKey={dayKey} onClose={() => setOpen(false)} />}
    </>
  );
}

/** Mounted only once there is a route, so Leaflet always gets a sized container. */
function RouteMiniMap({ path, stops }: { path: { lat: number; lng: number }[]; stops: Stop[] }) {
  const mapEl = useRef<HTMLDivElement | null>(null);
  useRouteMap(mapEl, path, stops, null, false);
  // The basemap is dimmed and desaturated so the route, not the road network, reads first.
  return (
    <div
      ref={mapEl}
      className="pointer-events-none h-40 w-full !bg-background [&_.leaflet-tile-pane]:opacity-70 [&_.leaflet-tile-pane]:saturate-50 [&_.leaflet-control-attribution]:!bg-background/60 [&_.leaflet-control-attribution]:!text-[9px] [&_.leaflet-control-attribution]:!leading-tight [&_.leaflet-control-attribution]:!text-muted-foreground"
    />
  );
}

export function DayRouteSheet({ moments, onClose, initialDayKey }: { moments: Moment[]; onClose: () => void; initialDayKey?: string }) {
  const { lang } = useLanguage();
  const zh = lang === 'zh';
  const { formatDate } = useDateLocale();
  const owner = useRouteOwner();
  const todayKey = localDayKey(Date.now());
  const [dayKey, setDayKey] = useState(initialDayKey ?? todayKey);
  const [recording, setRecording] = useState(() => isRouteRecordingEnabled(owner));
  const mapEl = useRef<HTMLDivElement | null>(null);
  const { stops, tracked, path, refresh } = useDayRoute(moments, dayKey, owner, recording);

  // With nothing for the day, open on the last place you recorded, not a fixed city.
  const fallbackCenter = useMemo<[number, number] | null>(() => {
    let best: Moment | null = null;
    for (const m of moments) {
      if (!m.location) continue;
      if (!best || (m.createdAt || '') > (best.createdAt || '')) best = m;
    }
    return best?.location ? [best.location.lat, best.location.lng] : null;
  }, [moments]);
  useRouteMap(mapEl, path, stops, fallbackCenter, true);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const toggleRecording = (on: boolean) => {
    if (!owner) return;
    if (on && navigator.geolocation) {
      // Ask now, from the tap, so the permission prompt has context.
      navigator.geolocation.getCurrentPosition(() => refresh(), () => {}, { timeout: 15_000 });
    }
    setRouteRecordingEnabled(owner, on);
    setRecording(on);
  };

  const clearDay = () => {
    if (!owner) return;
    clearRouteDay(owner, dayKey);
    void deleteServerRouteDay(owner, dayKey).then(ok => {
      if (!ok) toast.error(zh ? '云端的位置点没删掉，请稍后再试' : "Couldn't clear the synced points. Try again later.");
      refresh();
    });
  };

  const isToday = dayKey === todayKey;
  const dayLabel = formatDate(parseISO(dayKey), zh ? 'M月d日 EEE' : 'EEE, MMM d');
  const shiftDay = (n: number) => setDayKey(k => format(addDays(parseISO(k), n), 'yyyy-MM-dd'));

  return createPortal(
    <div className="fixed inset-0 z-[240] flex flex-col bg-background" role="dialog" aria-label={zh ? '一天的路线' : 'Day route'}>
      <div className="relative flex items-center justify-center border-b border-border/40 px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        {/* Same back control as the place sheet. */}
        <button
          type="button"
          onClick={onClose}
          className="absolute left-1.5 flex h-9 items-center text-[17px] text-primary active:opacity-50"
        >
          <ChevronLeft size={26} strokeWidth={2.4} className="-mr-0.5" />
          {zh ? '足迹' : 'Map'}
        </button>
        <div className="flex items-center">
          <button type="button" onClick={() => shiftDay(-1)} aria-label={zh ? '前一天' : 'Previous day'} className="flex h-9 w-9 items-center justify-center text-primary active:opacity-50">
            <ChevronLeft size={20} />
          </button>
          <h2>
            <button
              type="button"
              onClick={() => setDayKey(todayKey)}
              disabled={isToday}
              title={isToday ? undefined : (zh ? '回到今天' : 'Back to today')}
              className="min-w-[7.5rem] text-center text-[17px] font-semibold text-foreground disabled:cursor-default"
            >
              {dayLabel}
            </button>
          </h2>
          <button type="button" onClick={() => shiftDay(1)} disabled={isToday} aria-label={zh ? '后一天' : 'Next day'} className="flex h-9 w-9 items-center justify-center text-primary active:opacity-50 disabled:opacity-25">
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      <div className="relative h-[52vh] shrink-0 lg:h-[60vh]">
        <div ref={mapEl} className="absolute inset-0" />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3 lg:mx-auto lg:w-full lg:max-w-[720px]">
        <label className={`flex items-center justify-between gap-4 rounded-2xl bg-secondary/40 px-4 py-3 ${owner ? '' : 'opacity-60'}`}>
          <span className="min-w-0">
            <span className="block text-[15px] text-foreground">{zh ? '打开 App 时记录位置' : 'Record location while the app is open'}</span>
            <span className="mt-0.5 block text-[12px] leading-snug text-muted-foreground">
              {!owner
                ? (zh ? '演示里不能记录位置。' : 'Not available in the demo.')
                : zh
                  ? '网页版在后台或锁屏时拿不到位置。记录只存在这台设备上。'
                  : 'The web app gets no location in the background or when locked. Points stay on this device.'}
            </span>
          </span>
          <Switch checked={recording && !!owner} onCheckedChange={toggleRecording} disabled={!owner} />
        </label>

        {tracked.length > 0 && (
          <div className="mt-3 flex items-center justify-between px-1 text-[12px] text-muted-foreground">
            <span>{zh ? `这天记录了 ${tracked.length} 个位置点` : `${tracked.length} recorded ${tracked.length === 1 ? 'point' : 'points'} this day`}</span>
            <button type="button" onClick={clearDay} className="text-destructive active:opacity-50">
              {zh ? '清除' : 'Clear'}
            </button>
          </div>
        )}

        {path.length === 0 && (
          <p className="mt-6 text-center text-[13px] text-muted-foreground">
            {zh ? '这天还没有位置记录' : 'No locations for this day yet'}
          </p>
        )}

        {stops.length > 0 && (
          <ol className="mt-3 divide-y divide-border/30">
            {stops.map((s, i) => (
              <li key={s.id} className="flex items-center gap-3 py-2.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-[12px] font-semibold text-primary-foreground">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] text-foreground">{s.place}</span>
                  <span className="block truncate text-[12px] text-muted-foreground">
                    {[s.t ? formatDate(new Date(s.t), 'p') : '', s.text].filter(Boolean).join(' · ')}
                  </span>
                </span>
                {s.photo && (
                  <span className="h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-secondary/50">
                    <StorageImage src={s.photo} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                  </span>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>,
    document.body,
  );
}
