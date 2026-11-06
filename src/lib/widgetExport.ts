/**
 * Payload the Scriptable home-screen widget reads from the clipboard
 * (widgets/scriptable/evidence-map-widget.js). Keep it small and versioned:
 * only what the map needs, rounded to ~10 m, no photos or notes.
 */
export interface WidgetPlace { lat: number; lng: number; category: string; name?: string }

export const WIDGET_PAYLOAD_KIND = 'evidence-of-life/widget-places';

export function buildWidgetPayload(places: WidgetPlace[], now = new Date()): string {
  const rows = places
    .filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng))
    .map(p => ({
      lat: Math.round(p.lat * 1e4) / 1e4,
      lng: Math.round(p.lng * 1e4) / 1e4,
      category: p.category || 'other',
      ...(p.name ? { name: p.name.slice(0, 80) } : {}),
    }));
  return JSON.stringify({ kind: WIDGET_PAYLOAD_KIND, v: 1, exportedAt: now.toISOString(), places: rows });
}
