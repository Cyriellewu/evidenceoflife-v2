import L from 'leaflet';

/** Warm accent used for Life Map marks and the day route. */
export const LIFE_MAP_COLOR = '#e8825a';

interface TileSource {
  url: string;
  subdomains?: string;
  maxZoom: number;
  className: string;
  attribution: string;
}

// Free, no-key basemaps. Carto's public CDN now returns "API KEY REQUIRED"
// watermark tiles (HTTP 200), so it is not usable without a paid key. Esri
// ArcGIS Online canvas tiles still work anonymously with attribution.
const TILE_SOURCES: TileSource[] = [
  {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    maxZoom: 16,
    className: 'map-tiles-dark',
    attribution:
      'Tiles &copy; <a href="https://www.esri.com/">Esri</a> &mdash; Esri, HERE, Garmin, FAO, NOAA, USGS',
  },
  {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    maxZoom: 16,
    className: 'map-tiles-light',
    attribution:
      'Tiles &copy; <a href="https://www.esri.com/">Esri</a> &mdash; Esri, HERE, Garmin, FAO, NOAA, USGS',
  },
  {
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    subdomains: 'abc',
    maxZoom: 17,
    className: 'map-tiles-light',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, <a href="https://opentopomap.org">OpenTopoMap</a>',
  },
  {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    subdomains: 'abc',
    maxZoom: 19,
    className: 'map-tiles-light',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
];

function preferredTileSources(): TileSource[] {
  const prefersDark =
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
  if (prefersDark) return TILE_SOURCES;
  // Light UI: put light gray canvas first, keep dark as later fallback.
  const [dark, light, ...rest] = TILE_SOURCES;
  return [light, dark, ...rest];
}

// Free vector basemap (OpenFreeMap: no key, no account, commercial use OK),
// drawn by MapLibre inside Leaflet so every existing marker, neighbourhood
// polygon and interaction keeps working. Colourful "liberty" in light mode,
// "dark" in dark mode. Falls back to the raster tiles above when WebGL or the
// style is unavailable.
const VECTOR_STYLE_URLS = {
  light: 'https://tiles.openfreemap.org/styles/liberty',
  dark: 'https://tiles.openfreemap.org/styles/dark',
} as const;
const VECTOR_ATTRIBUTION =
  '<a href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a> &copy; <a href="https://www.openmaptiles.org/" target="_blank" rel="noreferrer">OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>';

function webglAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

/** Vector basemap first; raster fallback if it cannot load. */
export function addBasemap(map: L.Map) {
  if (typeof document === 'undefined' || !webglAvailable()) {
    addResilientTiles(map);
    return;
  }
  const dark = document.documentElement.classList.contains('dark');
  let fellBack = false;
  const fallBack = () => {
    if (fellBack) return;
    fellBack = true;
    try { addResilientTiles(map); } catch { /* map already removed */ }
  };
  Promise.all([
    import('@maplibre/maplibre-gl-leaflet'),
    import('maplibre-gl/dist/maplibre-gl.css'),
  ])
    .then(([{ maplibreGL }]) => {
      // The map may have been torn down while the chunk loaded.
      if (!map.getContainer()?.isConnected) return;
      const layer = maplibreGL({
        style: dark ? VECTOR_STYLE_URLS.dark : VECTOR_STYLE_URLS.light,
        attribution: VECTOR_ATTRIBUTION,
      } as Parameters<typeof maplibreGL>[0]);
      layer.addTo(map);
      const gl = layer.getMaplibreMap();
      // Keep the basemap quiet under the photo pins: hide the style's own
      // shop / transit icons and one-way arrows (streets and place names stay).
      const quiet = () => {
        for (const styleLayer of gl.getStyle()?.layers ?? []) {
          if (/^(poi_|road_one_way_arrow|airport)/.test(styleLayer.id)) {
            gl.setLayoutProperty(styleLayer.id, 'visibility', 'none');
          }
        }
      };
      gl.on('style.load', quiet);
      // Only a failed *style* means no basemap at all; a single tile error is fine.
      gl.on('error', (event: { error?: { message?: string }; sourceId?: string }) => {
        if (gl.isStyleLoaded()) return;
        console.warn('Vector basemap unavailable, using raster tiles', event?.error?.message);
        try { map.removeLayer(layer); } catch { /* ignore */ }
        fallBack();
      });
    })
    .catch(fallBack);
}

function addResilientTiles(map: L.Map) {
  // Attach one basemap; on repeated tile failures, swap to the next free host.
  // Do not tear down mid-animation without a replacement — that previously
  // blacked out the map after world↔city jumps.
  const sources = preferredTileSources();
  let index = 0;
  let failCount = 0;
  let layer: L.TileLayer | null = null;

  const attach = (src: TileSource) => {
    failCount = 0;
    const options: L.TileLayerOptions = {
      attribution: src.attribution,
      maxZoom: src.maxZoom,
      className: src.className,
      // Esri JPEG + OSM PNG — helps some WebViews paint reliably.
      crossOrigin: true,
    };
    // Leaflet's default subdomains is 'abc'. Passing `undefined` overrides that
    // and crashes in `_getSubdomain` (reads `.length` of undefined).
    if (src.subdomains) options.subdomains = src.subdomains;
    const next = L.tileLayer(src.url, options);
    next.on('tileerror', () => {
      failCount += 1;
      // A burst of errors usually means the host is blocked — fall through.
      if (failCount < 4 || index >= sources.length - 1) return;
      index += 1;
      try {
        map.removeLayer(next);
      } catch {
        /* layer may already be gone */
      }
      if (layer === next) layer = null;
      layer = attach(sources[index]);
    });
    next.addTo(map);
    return next;
  };

  layer = attach(sources[0]);
}
