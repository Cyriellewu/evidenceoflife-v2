import { forwardRef, useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { MapPin, Navigation, Search, Loader2, X } from 'lucide-react';
import { cn, isImeComposing } from '@/lib/utils';
import { useLanguage } from '@/hooks/useLanguage';
import { useIsMobile } from '@/hooks/use-mobile';
import { readCachedGeoCoords, writeCachedGeoCoords } from '@/lib/geoCoords';
import {
  formatDistanceLabel,
  sanitizePlaceName,
  splitPlaceLabel,
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
  /** Force sheet/popover. Default: sheet on phone, popover on desktop. */
  presentation?: 'auto' | 'sheet' | 'popover';
}

const GEO_OPTS: PositionOptions = {
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

function PlaceRow({
  place,
  lang,
  onPick,
  emphasize,
}: {
  place: GeoPlaceResult;
  lang: string;
  onPick: () => void;
  emphasize?: boolean;
}) {
  const { title, subtitle } = splitPlaceLabel(place.name);
  const dist =
    typeof place.distance_m === 'number'
      ? formatDistanceLabel(place.distance_m, lang === 'zh' ? 'zh' : 'en')
      : '';
  const meta = [subtitle || place.city, dist].filter(Boolean).join(' · ');

  return (
    <button
      type="button"
      onClick={onPick}
      className={cn(
        'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors active:bg-[hsl(var(--surface-soft))]',
        emphasize ? 'bg-primary/[0.06]' : 'hover:bg-[hsl(var(--surface-soft))]',
      )}
    >
      <span
        className={cn(
          'mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full',
          emphasize ? 'bg-primary/15 text-primary' : 'bg-[hsl(var(--surface-soft))] text-muted-foreground/65',
        )}
      >
        {emphasize ? <Navigation size={15} /> : <MapPin size={15} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium leading-snug text-foreground/90 line-clamp-2">
          {title || place.name}
        </span>
        {meta && (
          <span className="mt-0.5 block text-[12px] leading-snug text-muted-foreground/70 line-clamp-1">
            {meta}
          </span>
        )}
      </span>
      {dist && !subtitle && !place.city && (
        <span className="mt-1 flex-shrink-0 text-[12px] tabular-nums text-muted-foreground/55">{dist}</span>
      )}
    </button>
  );
}

export const LocationPopover = forwardRef<HTMLDivElement, LocationPopoverProps>(
  function LocationPopover({ onSelect, onClose, autoLocateToken, className, presentation = 'auto' }, ref) {
    const { lang } = useLanguage();
    const isMobile = useIsMobile();
    const asSheet = presentation === 'sheet' || (presentation === 'auto' && isMobile);

    const [search, setSearch] = useState('');
    const [results, setResults] = useState<GeoPlaceResult[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [isGettingLocation, setIsGettingLocation] = useState(false);
    const [coordsEpoch, setCoordsEpoch] = useState(0);
    const composingRef = useRef(false);
    const coordsRef = useRef<{ lat: number; lng: number } | null>(readCachedGeoCoords());
    const searchRef = useRef(search);
    const didAutoNearby = useRef(false);
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
        const next = await searchPlaces({ q: trimmed, limit: 10, coords });
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
      if (!q || q.length < 2) return;
      const handle = window.setTimeout(() => {
        void runSearch(q, coordsRef.current);
      }, 280);
      return () => window.clearTimeout(handle);
    }, [search, coordsEpoch, runSearch]);

    const loadNearby = useCallback(async () => {
      setIsGettingLocation(true);
      setIsSearching(true);
      try {
        const coords = await ensureCoords(true);
        if (!coords) {
          toast.error(lang === 'zh' ? '无法获取当前位置，请允许定位权限' : 'Could not get your location — allow location access');
          return;
        }
        const nearby = await nearbyRecommendations(coords, lang);
        setResults(nearby);
        if (nearby.length === 0) {
          const alone = await reversePlace({ ...coords, lang });
          setResults([{ ...alone, distance_m: 0 }]);
        }
      } catch {
        toast.error(lang === 'zh' ? '附近地点加载失败，请稍后重试' : 'Could not load nearby places');
      } finally {
        setIsGettingLocation(false);
        setIsSearching(false);
      }
    }, [ensureCoords, lang]);

    const handleUseCurrentLocation = useCallback(async () => {
      const q = searchRef.current.trim();
      if (q.length >= 2) {
        setIsGettingLocation(true);
        try {
          const coords = await ensureCoords(true);
          if (!coords) {
            toast.error(lang === 'zh' ? '无法获取当前位置，请允许定位权限' : 'Could not get your location — allow location access');
            return;
          }
          await runSearch(q, coords);
        } finally {
          setIsGettingLocation(false);
        }
        return;
      }
      await loadNearby();
    }, [ensureCoords, runSearch, loadNearby, lang]);

    // Phone sheet: load nearby as soon as it opens — one tap less than the old flow.
    useEffect(() => {
      if (!asSheet || didAutoNearby.current) return;
      didAutoNearby.current = true;
      void loadNearby();
    }, [asSheet, loadNearby]);

    useEffect(() => {
      if (autoLocateToken === undefined) return;
      void handleUseCurrentLocation();
    }, [autoLocateToken, handleUseCurrentLocation]);

    useEffect(() => {
      if (!asSheet) return;
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
      };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }, [asSheet, onClose]);

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
    const headerTitle = lang === 'zh' ? '选择地点' : 'Choose a place';
    const useCurrentLabel = hasQuery
      ? (lang === 'zh' ? '在附近搜索' : 'Search near me')
      : (lang === 'zh' ? '刷新附近推荐' : 'Refresh nearby');

    const searchField = (
      <div className="flex items-center gap-2 rounded-xl border border-border/50 bg-[hsl(var(--surface-soft))] px-3 py-2.5">
        {isSearching
          ? <Loader2 size={15} className="flex-shrink-0 animate-spin text-muted-foreground/50" />
          : <Search size={15} className="flex-shrink-0 text-muted-foreground/50" />
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
              void handleAddManual();
            }
            e.stopPropagation();
          }}
          placeholder={lang === 'zh' ? '搜索附近地点…' : 'Search nearby…'}
          className="min-w-0 flex-1 bg-transparent text-[15px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none"
          autoFocus={!asSheet}
        />
      </div>
    );

    const resultsList = (
      <div className={cn('overflow-y-auto overscroll-contain', asSheet ? 'min-h-0 flex-1' : 'max-h-[min(280px,42vh)]')}>
        {results.length > 0 ? (
          <div className="divide-y divide-border/35 py-1">
            {results.map((r, i) => (
              <PlaceRow
                key={`${r.lat}-${r.lng}-${r.name}`}
                place={r}
                lang={lang}
                emphasize={i === 0 && !hasQuery}
                onPick={() => handleSelectResult(r)}
              />
            ))}
          </div>
        ) : isSearching || isGettingLocation ? (
          <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-muted-foreground/60">
            <Loader2 size={20} className="animate-spin" />
            <span className="text-[13px]">{lang === 'zh' ? '正在查找附近地点…' : 'Finding places near you…'}</span>
          </div>
        ) : search.trim().length >= 2 ? (
          <button
            type="button"
            onClick={() => { void handleAddManual(); }}
            className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-[hsl(var(--surface-soft))]"
          >
            <MapPin size={15} className="flex-shrink-0 text-primary/70" />
            <span className="text-[14px] text-primary/85">
              {lang === 'zh' ? `添加「${search.trim()}」` : `Add “${search.trim()}”`}
            </span>
          </button>
        ) : (
          <p className="px-4 py-8 text-center text-[13px] text-muted-foreground/55">
            {lang === 'zh' ? '点下方刷新，或直接搜索地点名称' : 'Refresh nearby, or search for a place'}
          </p>
        )}
      </div>
    );

    const nearMeButton = (
      <button
        type="button"
        onClick={() => { void handleUseCurrentLocation(); }}
        disabled={isGettingLocation}
        className="flex w-full items-center justify-center gap-2 rounded-full border border-border/55 bg-[hsl(var(--surface-contrast))] px-3 py-2.5 text-[13px] font-medium text-foreground/85 transition-colors hover:bg-[hsl(var(--surface-soft))] disabled:opacity-60"
      >
        {isGettingLocation ? <Loader2 size={14} className="animate-spin" /> : <Navigation size={14} className="text-primary" />}
        {useCurrentLabel}
      </button>
    );

    if (asSheet && typeof document !== 'undefined') {
      return createPortal(
        <div className="fixed inset-0 z-[300] md:hidden" style={{ zIndex: 300 }} role="dialog" aria-modal="true" aria-label={headerTitle}>
          <button
            type="button"
            className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
            aria-label={lang === 'zh' ? '关闭' : 'Close'}
            onClick={onClose}
          />
          <div
            ref={ref}
            className={cn(
              'absolute inset-x-0 bottom-0 flex max-h-[min(78dvh,640px)] flex-col rounded-t-[22px] border border-border/50 bg-[hsl(var(--background))] shadow-[0_-12px_40px_hsl(var(--foreground)/0.14)]',
              'pb-[max(0.75rem,env(safe-area-inset-bottom))]',
              className,
            )}
            style={{ zIndex: 301 }}
            data-edit-popover="true"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex flex-col items-center pt-2.5">
              <span className="h-1 w-10 rounded-full bg-border/70" />
            </div>
            <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-2">
              <h2 className="text-[16px] font-semibold tracking-[-0.02em] text-foreground">{headerTitle}</h2>
              <button
                type="button"
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-[hsl(var(--surface-soft))] hover:text-foreground"
                aria-label={lang === 'zh' ? '关闭' : 'Close'}
              >
                <X size={16} />
              </button>
            </div>
            <div className="px-4 pb-2">{searchField}</div>
            {resultsList}
            <div className="border-t border-border/40 px-4 pt-2.5">{nearMeButton}</div>
          </div>
        </div>,
        document.body,
      );
    }

    return (
      <div
        ref={ref}
        className={cn(
          'w-full min-w-[260px] max-w-[min(100vw-1.5rem,320px)] overflow-hidden rounded-[14px] border border-border/55 bg-[hsl(var(--background)/0.98)] shadow-[0_12px_28px_hsl(var(--foreground)/0.09)] backdrop-blur-xl',
          className,
        )}
        data-edit-popover="true"
      >
        <div className="px-3 pt-3">{searchField}</div>
        <div className="px-1 pt-1">{resultsList}</div>
        <div className="border-t border-border/35 p-2.5">{nearMeButton}</div>
      </div>
    );
  }
);
