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

export const WIDGET_KEY_KIND = 'evidence-of-life/widget-key';

/**
 * What the widget needs to call widget-api for this user: the project URL,
 * the public publishable key (the functions gateway wants it), and the
 * personal widget key. Pasted once into Scriptable, kept in the iOS Keychain.
 */
export function buildWidgetKeyPayload(token: string, supabaseUrl: string, publishableKey: string): string {
  return JSON.stringify({ kind: WIDGET_KEY_KIND, v: 1, token, url: supabaseUrl, key: publishableKey });
}

/**
 * Copy text produced by an async call. Safari drops the user gesture across an
 * await, so hand it a ClipboardItem whose content is still a promise; other
 * browsers fall back to writeText after the promise resolves.
 */
export async function copyAsync(produce: () => Promise<string>): Promise<void> {
  const text = produce();
  const Item = (globalThis as { ClipboardItem?: typeof ClipboardItem }).ClipboardItem;
  if (Item && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([new Item({ 'text/plain': text.then(t => new Blob([t], { type: 'text/plain' })) })]);
      return;
    } catch {
      /* fall through */
    }
  }
  await navigator.clipboard.writeText(await text);
}
