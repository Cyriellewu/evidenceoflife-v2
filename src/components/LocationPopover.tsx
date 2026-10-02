import { forwardRef, useState, useEffect, useCallback, useRef } from 'react';
import { MapPin, Navigation, Search, Loader2 } from 'lucide-react';
import { cn, isImeComposing } from '@/lib/utils';
import { useLanguage } from '@/hooks/useLanguage';
import { readCachedGeoCoords, writeCachedGeoCoords } from '@/lib/geoCoords';
import {
  formatDistanceLabel,
  sanitizePlaceName,
} from '@/lib/geoPlaceName';
import {
  nearbyRecommendations,
  reversePlace,
  searchPlaces,
  type GeoPlaceResult,
} from '@/lib/geoClient';
import { toast } from 'sonner';

type LocationCategory = 'restaurant' | 'coffee' | 'grocery' | 'park' | 'museum' | 'other';

interface LocationPopoverProps {
  onSelect: (location: { name: string; lat: number; lng: number; category: LocationCategory }) => void;
  onClose: () => void;
  autoLocateToken?: number;
  className?: string;
}

const GEO_OPTS: PositionOptions = {
  // Network/cell location is enough for nearby search bias and much faster than GPS.
  enableHighAccuracy: false,
  maximumAge: 120_000,
  timeout: 8_000,
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

export const LocationPopover = forwardRef<HTMLDivElement, LocationPopoverProps>(
  function LocationPopover({ onSelect, onClose, autoLocateToken, className }, ref) {
    const { lang } = useLanguage();
    const [search, setSearch] = useState('');
    const [results, setResults] = useState<GeoPlaceResult[]>([]);
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
        const next = await searchPlaces({ q: trimmed, limit: 8, coords });
        if (searchRef.current.trim() !== trimmed) return;
        setResults(next);
      } catch {
        if (searchRef.current.trim() === trimmed) setResults([]);
      } finally {
        if (searchRef.current.trim() === trimmed) setIsSearching(false);
      }
    }, []);

    useEffect(() => {
      const q = search.trim();
      if (!q || q.length < 2) {
        return;
      }

      const handle = window.setTimeout(() => {
        void runSearch(q, coordsRef.current);
      }, 280);

      return () => window.clearTimeout(handle);
    }, [search, coordsEpoch, runSearch]);

    const handleUseCurrentLocation = useCallback(async () => {
      setIsGettingLocation(true);
      try {
        const q = searchRef.current.trim();
        const coords = await ensureCoords(true);
        if (!coords) {
          toast.error(lang === 'zh' ? '无法获取当前位置，请允许定位权限' : 'Could not get your location — allow location access');
          return;
        }

        // Typed query + current position → closest place recommendations.
        if (q.length >= 2) {
          await runSearch(q, coords);
          return;
        }

        // No query: map-style nearby recommendations (best place underfoot + nearby POIs).
        setIsSearching(true);
        try {
          const nearby = await nearbyRecommendations(coords, lang);
          setResults(nearby);
          if (nearby.length === 0) {
            const alone = await reversePlace({ ...coords, lang });
            onSelect({
              name: alone.name,
              lat: alone.lat,
              lng: alone.lng,
              category: alone.category as LocationCategory,
            });
            onClose();
          }
        } catch {
          toast.error(lang === 'zh' ? '附近地点加载失败，请稍后重试' : 'Could not load nearby places');
        } finally {
          setIsSearching(false);
        }
      } finally {
        setIsGettingLocation(false);
      }
    }, [ensureCoords, runSearch, onSelect, onClose, lang]);

    useEffect(() => {
      if (autoLocateToken === undefined) return;
      void handleUseCurrentLocation();
    }, [autoLocateToken, handleUseCurrentLocation]);

    const handleSelectResult = useCallback((r: GeoPlaceResult) => {
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
        const found = await searchPlaces({ q: search.trim(), limit: 1, coords });
        const first = found[0];
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
      : (lang === 'zh' ? '推荐当前最合适的地点' : 'Recommend the best places near you');

    return (
      <div
        ref={ref}
        className={cn(
          'w-full min-w-[240px] max-w-[min(100vw-1.5rem,300px)] overflow-hidden rounded-[14px] border border-border/55 bg-[hsl(var(--background)/0.98)] shadow-[0_12px_28px_hsl(var(--foreground)/0.09)] backdrop-blur-xl',
          className,
        )}
        data-edit-popover="true"
      >
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
