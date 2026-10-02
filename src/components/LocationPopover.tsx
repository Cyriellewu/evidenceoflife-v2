import { forwardRef, useState, useEffect, useCallback, useRef } from 'react';
import { MapPin, Navigation, Search, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn, isImeComposing } from '@/lib/utils';
import { useLanguage } from '@/hooks/useLanguage';
import { readCachedGeoCoords, writeCachedGeoCoords } from '@/lib/geoCoords';
import {
  formatDistanceLabel,
  sanitizePlaceName,
} from '@/lib/geoPlaceName';

interface LocationResult {
  name: string;
  lat: number;
  lng: number;
  category?: string;
  distance_m?: number;
}

type LocationCategory = 'restaurant' | 'coffee' | 'grocery' | 'park' | 'museum' | 'other';
type GeoBody = {
  type: string;
  q?: string;
  limit?: number;
  lat?: number;
  lng?: number;
  lang?: string;
};

interface LocationPopoverProps {
  onSelect: (location: { name: string; lat: number; lng: number; category: 'restaurant' | 'coffee' | 'grocery' | 'park' | 'museum' | 'other' }) => void;
  onClose: () => void;
  autoLocateToken?: number;
  className?: string;
}

const GEO_OPTS: PositionOptions = {
  // Network/cell location is enough for nearby search bias and much faster than GPS.
  enableHighAccuracy: false,
  maximumAge: 120_000,
  timeout: 6_000,
};

function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation unavailable'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, GEO_OPTS);
  });
}

function mapGeoResults(data: { results?: Array<Record<string, unknown>> } | null): LocationResult[] {
  return (data?.results ?? [])
    .map((r) => ({
      name: sanitizePlaceName(String(r.name ?? ''), ''),
      lat: Number(r.lat),
      lng: Number(r.lng),
      category: (r.category as string) || 'other',
      distance_m: typeof r.distance_m === 'number' ? r.distance_m : undefined,
    }))
    .filter((r) => r.name && Number.isFinite(r.lat) && Number.isFinite(r.lng));
}

export const LocationPopover = forwardRef<HTMLDivElement, LocationPopoverProps>(
  function LocationPopover({ onSelect, onClose, autoLocateToken, className }, ref) {
    const { lang } = useLanguage();
    const [search, setSearch] = useState('');
    const [results, setResults] = useState<LocationResult[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [isGettingLocation, setIsGettingLocation] = useState(false);
    // Bumps when coords become available so an in-progress query re-runs with near-me bias.
    const [coordsEpoch, setCoordsEpoch] = useState(0);
    const composingRef = useRef(false);
    const coordsRef = useRef<{ lat: number; lng: number } | null>(readCachedGeoCoords());
    const searchRef = useRef(search);
    searchRef.current = search;

    const ensureCoords = useCallback(async (force = false): Promise<{ lat: number; lng: number } | null> => {
      if (!force && coordsRef.current) return coordsRef.current;
      try {
        const pos = await getPosition();
        const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        coordsRef.current = next;
        writeCachedGeoCoords(next);
        setCoordsEpoch((n) => n + 1);
        return next;
      } catch {
        return coordsRef.current;
      }
    }, []);

    useEffect(() => {
      // Warm coords in the background so typing can bias immediately.
      void ensureCoords(false);
    }, [ensureCoords]);

    const runSearch = useCallback(async (q: string, coords: { lat: number; lng: number } | null) => {
      const trimmed = q.trim();
      if (trimmed.length < 2) {
        setResults([]);
        return;
      }
      try {
        setIsSearching(true);
        const body: GeoBody = { type: 'search', q: trimmed, limit: 8 };
        if (coords) {
          body.lat = coords.lat;
          body.lng = coords.lng;
        }
        const { data, error } = await supabase.functions.invoke('geo', { body });
        if (error) throw error;
        // Ignore stale responses if the user kept typing.
        if (searchRef.current.trim() !== trimmed) return;
        setResults(mapGeoResults(data));
      } catch {
        if (searchRef.current.trim() === trimmed) setResults([]);
      } finally {
        if (searchRef.current.trim() === trimmed) setIsSearching(false);
      }
    }, []);

    useEffect(() => {
      const q = search.trim();
      if (!q || q.length < 2) {
        setResults([]);
        return;
      }

      const handle = window.setTimeout(() => {
        void runSearch(q, coordsRef.current);
      }, 280);

      return () => window.clearTimeout(handle);
    }, [search, coordsEpoch, runSearch]);

    const reverseGeocode = useCallback(async (lat: number, lng: number) => {
      const fallback = lang === 'zh' ? '当前位置' : 'Current location';
      try {
        const { data, error } = await supabase.functions.invoke('geo', {
          body: { type: 'reverse', lat, lng, lang },
        });
        if (error) throw error;
        const name = sanitizePlaceName(String(data?.name ?? ''), '');
        const city = sanitizePlaceName(String(data?.city ?? ''), '');
        const category = data?.category || 'other';
        return { name: name || city || fallback, category };
      } catch {
        return { name: fallback, category: 'other' };
      }
    }, [lang]);

    const handleUseCurrentLocation = useCallback(async () => {
      setIsGettingLocation(true);
      try {
        const q = searchRef.current.trim();
        // Fresh fix when the user explicitly asks for near-me recommendations.
        const coords = await ensureCoords(q.length >= 2);
        if (!coords) {
          setIsGettingLocation(false);
          return;
        }

        // Typed query + current position → closest place recommendations (maps-style).
        if (q.length >= 2) {
          await runSearch(q, coords);
          setIsGettingLocation(false);
          return;
        }

        const result = await reverseGeocode(coords.lat, coords.lng);
        onSelect({
          name: result.name,
          lat: coords.lat,
          lng: coords.lng,
          category: result.category as LocationCategory,
        });
        onClose();
      } finally {
        setIsGettingLocation(false);
      }
    }, [ensureCoords, runSearch, reverseGeocode, onSelect, onClose]);

    useEffect(() => {
      if (autoLocateToken === undefined) return;
      void handleUseCurrentLocation();
    }, [autoLocateToken, handleUseCurrentLocation]);

    const handleSelectResult = useCallback((r: LocationResult) => {
      onSelect({
        name: sanitizePlaceName(r.name, lang === 'zh' ? '当前位置' : 'Current location'),
        lat: r.lat,
        lng: r.lng,
        category: (r.category || 'other') as LocationCategory,
      });
      onClose();
    }, [onSelect, onClose, lang]);

    const handleAddManual = useCallback(async () => {
      if (!search.trim()) return;
      try {
        const coords = coordsRef.current ?? (await ensureCoords(false));
        const body: GeoBody = { type: 'search', q: search.trim(), limit: 1 };
        if (coords) {
          body.lat = coords.lat;
          body.lng = coords.lng;
        }
        const { data } = await supabase.functions.invoke('geo', { body });
        const first = mapGeoResults(data)[0];
        if (first) {
          onSelect({
            name: first.name,
            lat: first.lat,
            lng: first.lng,
            category: (first.category || 'other') as LocationCategory,
          });
          onClose();
          return;
        }
      } catch { /* fall through */ }
      const coords = coordsRef.current;
      onSelect({
        name: search.trim(),
        lat: coords?.lat ?? 0,
        lng: coords?.lng ?? 0,
        category: 'other',
      });
      onClose();
    }, [search, onSelect, onClose, ensureCoords]);

    const hasQuery = search.trim().length >= 2;
    const useCurrentLabel = hasQuery
      ? (lang === 'zh' ? '在附近搜索' : 'Search near me')
      : (lang === 'zh' ? '使用当前位置' : 'Use current location');
    const nearHint = hasQuery
      ? (lang === 'zh' ? '按距离推荐最贴近的地点' : 'Closest matches near you')
      : (lang === 'zh' ? '解析为最合适的地点名称' : 'Resolve to the best place name');

    return (
      <div
        ref={ref}
        className={cn(
          'w-full min-w-[240px] max-w-[min(100vw-1.5rem,300px)] overflow-hidden rounded-[14px] border border-border/55 bg-[hsl(var(--background)/0.98)] shadow-[0_12px_28px_hsl(var(--foreground)/0.09)] backdrop-blur-xl',
          className,
        )}
        data-edit-popover="true"
      >
        {/* Use current / search near me */}
        <button
          type="button"
          onClick={() => { void handleUseCurrentLocation(); }}
          disabled={isGettingLocation}
          className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-[hsl(var(--surface-soft))] disabled:opacity-60"
        >
          <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            {isGettingLocation ? <Loader2 size={12} className="animate-spin" /> : <Navigation size={12} />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-medium text-foreground/88">{useCurrentLabel}</span>
            <span className="mt-0.5 block truncate text-[11px] text-muted-foreground/65">
              {hasQuery ? `“${search.trim()}” · ${nearHint}` : nearHint}
            </span>
          </span>
        </button>

        <div className="mx-2 h-px bg-border/30" />

        {/* Search input */}
        <div className="flex items-center gap-2 px-3 py-2">
          {isSearching
            ? <Loader2 size={13} className="flex-shrink-0 animate-spin text-muted-foreground/45" />
            : <Search size={13} className="flex-shrink-0 text-muted-foreground/45" />
          }
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onCompositionStart={() => { composingRef.current = true; }}
            onCompositionEnd={() => { composingRef.current = false; }}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (composingRef.current || isImeComposing(e.nativeEvent as KeyboardEvent)) return;
                handleAddManual();
              }
              e.stopPropagation();
            }}
            placeholder={lang === 'zh' ? '搜索附近地点…' : 'Search nearby…'}
            className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none"
            autoFocus
          />
        </div>

        {/* Results — nearest first when coords are known */}
        {results.length > 0 && (
          <>
            <div className="mx-2 h-px bg-border/30" />
            <div className="max-h-[min(240px,40vh)] overflow-y-auto py-1">
              {results.map((r) => (
                <button
                  type="button"
                  key={`${r.lat}-${r.lng}-${r.name}`}
                  onClick={() => handleSelectResult(r)}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-[hsl(var(--surface-soft))]"
                >
                  <MapPin size={12} className="flex-shrink-0 text-muted-foreground/50" />
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-foreground/85">{r.name}</span>
                  {typeof r.distance_m === 'number' && (
                    <span className="flex-shrink-0 text-[11px] tabular-nums text-muted-foreground/55">
                      {formatDistanceLabel(r.distance_m, lang === 'zh' ? 'zh' : 'en')}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </>
        )}

        {/* Manual add fallback */}
        {search.trim().length >= 2 && results.length === 0 && !isSearching && (
          <>
            <div className="mx-2 h-px bg-border/30" />
            <button
              type="button"
              onClick={() => { void handleAddManual(); }}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-[hsl(var(--surface-soft))]"
            >
              <MapPin size={12} className="flex-shrink-0 text-primary/70" />
              <span className="truncate text-[12.5px] text-primary/80">Add &quot;{search}&quot;</span>
            </button>
          </>
        )}
      </div>
    );
  }
);
