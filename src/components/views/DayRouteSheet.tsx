import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { addDays, format, parseISO } from 'date-fns';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Moment } from '@/types';
import { useLanguage } from '@/hooks/useLanguage';
import { Switch } from '@/components/ui/switch';
import { StorageImage } from '@/components/StorageImage';
import { addBasemap } from '@/lib/mapBasemap';
import {
  getRoutePoints,
  isRouteRecordingEnabled,
  localDayKey,
  setRouteRecordingEnabled,
  type RoutePoint,
} from '@/lib/routeRecorder';

const ROUTE_COLOR = '#e8825a';

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

export function DayRouteSheet({ moments, onClose }: { moments: Moment[]; onClose: () => void }) {
  const { lang } = useLanguage();
  const zh = lang === 'zh';
  const [dayKey, setDayKey] = useState(() => localDayKey(Date.now()));
  const [recording, setRecording] = useState(isRouteRecordingEnabled);
  const [tick, setTick] = useState(0);
  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  const stops = useMemo(() => stopsForDay(moments, dayKey), [moments, dayKey]);
  // Re-read recorded points when the day changes or new ones land.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const tracked = useMemo<RoutePoint[]>(() => getRoutePoints(dayKey), [dayKey, tick]);
  const path = useMemo(
    () => [...tracked.map(p => ({ t: p.t, lat: p.lat, lng: p.lng })), ...stops.map(s => ({ t: s.t, lat: s.lat, lng: s.lng }))]
      .sort((a, b) => a.t - b.t),
    [tracked, stops],
  );

  // Pick up points the recorder stores while this sheet is open.
  useEffect(() => {
    if (!recording) return;
    const id = window.setInterval(() => setTick(n => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, [recording]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (!mapEl.current || mapRef.current) return;
    const map = L.map(mapEl.current, { zoomControl: false, attributionControl: true }).setView([40.7, -74], 12);
    addBasemap(map);
    mapRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);
    return () => { map.remove(); mapRef.current = null; layerRef.current = null; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    if (path.length === 0) return;
    const latlngs = path.map(p => L.latLng(p.lat, p.lng));
    if (latlngs.length > 1) {
      L.polyline(latlngs, { color: ROUTE_COLOR, weight: 4, opacity: 0.85, lineJoin: 'round' }).addTo(layer);
    }
    stops.forEach((s, i) => {
      L.marker([s.lat, s.lng], {
        icon: L.divIcon({
          className: '',
          html: `<div style="width:22px;height:22px;border-radius:999px;background:${ROUTE_COLOR};color:#fff;font:600 12px/22px system-ui;text-align:center;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.3)">${i + 1}</div>`,
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        }),
      }).addTo(layer);
    });
    if (stops.length === 0) {
      // Recorded track only: mark where the day started and where it is now.
      const dot = (ll: L.LatLng) => L.circleMarker(ll, { radius: 5, color: '#fff', weight: 2, fillColor: ROUTE_COLOR, fillOpacity: 1 }).addTo(layer);
      dot(latlngs[0]);
      if (latlngs.length > 1) dot(latlngs[latlngs.length - 1]);
    }
    map.fitBounds(L.latLngBounds(latlngs), { padding: [36, 36], maxZoom: 16 });
  }, [path, stops]);

  const toggleRecording = (on: boolean) => {
    if (on && navigator.geolocation) {
      // Ask now, from the tap, so the permission prompt has context.
      navigator.geolocation.getCurrentPosition(() => setTick(n => n + 1), () => {}, { timeout: 15_000 });
    }
    setRouteRecordingEnabled(on);
    setRecording(on);
  };

  const isToday = dayKey === localDayKey(Date.now());
  const dayLabel = format(parseISO(dayKey), zh ? 'M月d日 EEE' : 'EEE, MMM d');
  const shiftDay = (n: number) => setDayKey(k => format(addDays(parseISO(k), n), 'yyyy-MM-dd'));

  return createPortal(
    <div className="fixed inset-0 z-[240] flex flex-col bg-background" role="dialog" aria-label={zh ? '一天的路线' : 'Day route'}>
      <div className="flex items-center justify-between gap-2 border-b border-border/40 px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <button type="button" onClick={onClose} aria-label={zh ? '关闭' : 'Close'} className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground active:opacity-50">
          <X size={20} />
        </button>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => shiftDay(-1)} aria-label={zh ? '前一天' : 'Previous day'} className="flex h-9 w-9 items-center justify-center text-primary active:opacity-50">
            <ChevronLeft size={22} />
          </button>
          <span className="min-w-[8rem] text-center text-[16px] font-semibold text-foreground">{dayLabel}</span>
          <button type="button" onClick={() => shiftDay(1)} disabled={isToday} aria-label={zh ? '后一天' : 'Next day'} className="flex h-9 w-9 items-center justify-center text-primary active:opacity-50 disabled:opacity-25">
            <ChevronRight size={22} />
          </button>
        </div>
        <span className="w-9" />
      </div>

      <div className="relative h-[52vh] shrink-0 lg:h-[60vh]">
        <div ref={mapEl} className="absolute inset-0" />
        {path.length === 0 && (
          <div className="pointer-events-none absolute inset-0 z-[500] flex items-center justify-center">
            <span className="rounded-full bg-background/90 px-4 py-2 text-[13px] text-muted-foreground shadow-sm">
              {zh ? '这天还没有位置记录' : 'No locations for this day yet'}
            </span>
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3 lg:mx-auto lg:w-full lg:max-w-[720px]">
        <label className="flex items-center justify-between gap-4 rounded-2xl bg-secondary/40 px-4 py-3">
          <span className="min-w-0">
            <span className="block text-[15px] text-foreground">{zh ? '打开 App 时记录位置' : 'Record location while the app is open'}</span>
            <span className="mt-0.5 block text-[12px] leading-snug text-muted-foreground">
              {zh
                ? '网页版在后台或锁屏时拿不到位置。记录只存在这台设备上。'
                : 'The web app gets no location in the background or when locked. Points stay on this device.'}
            </span>
          </span>
          <Switch checked={recording} onCheckedChange={toggleRecording} />
        </label>

        {tracked.length > 0 && (
          <p className="mt-3 px-1 text-[12px] text-muted-foreground">
            {zh ? `已记录 ${tracked.length} 个位置点` : `${tracked.length} recorded ${tracked.length === 1 ? 'point' : 'points'}`}
          </p>
        )}

        {stops.length > 0 && (
          <ol className="mt-3 divide-y divide-border/30">
            {stops.map((s, i) => (
              <li key={s.id} className="flex items-center gap-3 py-2.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold text-white" style={{ backgroundColor: ROUTE_COLOR }}>
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] text-foreground">{s.place}</span>
                  <span className="block truncate text-[12px] text-muted-foreground">
                    {[s.t ? format(s.t, 'HH:mm') : '', s.text].filter(Boolean).join(' · ')}
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
