import { supabase } from '@/integrations/supabase/client';
import { Moment, MomentLinkPreview } from '@/types';

const PAGE_SIZE = 20;
const MAX_DATA_URL_BYTES = 8 * 1024 * 1024;

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** Shape of a moments row across the full + fallback/lean SELECT variants. */
interface MomentRow {
  id: string;
  date: string;
  text?: string | null;
  emoji?: string | null;
  photos?: unknown;
  links?: unknown;
  tags?: string[] | null;
  is_special?: boolean | null;
  created_at: string;
  timer_started_at?: string | null;
  timer_ended_at?: string | null;
  timer_seconds?: number | null;
  location_name?: string | null;
  location_lat?: number | null;
  location_lng?: number | null;
  location_category?: string | null;
}

export function isMissingMomentLinksColumn(error: unknown): boolean {
  const e = error as { message?: unknown; details?: unknown; hint?: unknown } | null | undefined;
  const message = String(e?.message || e?.details || e?.hint || '');
  return /column .*links.* does not exist|moments.*links/i.test(message);
}

function estimateDataUrlBytes(dataUrl: string): number {
  const base64 = dataUrl.split(',')[1] || '';
  return Math.floor((base64.length * 3) / 4);
}

async function uploadPhotoToStorage(userId: string, dataUrl: string): Promise<string | null> {
  try {
    if (!dataUrl.startsWith('data:')) return dataUrl;

    if (estimateDataUrlBytes(dataUrl) > MAX_DATA_URL_BYTES) {
      console.warn('Photo skipped: file too large for stable upload');
      return null;
    }

    const match = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!match) return null;

    const mimeType = match[1];
    const ext = mimeType.split('/')[1] || 'png';
    const base64Data = match[2];
    const bytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: mimeType });

    for (let attempt = 0; attempt < 3; attempt++) {
      const { uploadMomentPhotoObject } = await import('@/lib/momentPhotos');
      const path = await uploadMomentPhotoObject(userId, blob, mimeType, ext);
      if (path) return path;

      console.error(`Photo upload failed (attempt ${attempt + 1})`);
      if (attempt < 2) await wait(800 * (attempt + 1));
    }

    return null;
  } catch (err) {
    console.error('Photo upload error:', err);
    return null;
  }
}

export async function uploadPhotos(userId: string, photos: string[]): Promise<string[]> {
  if (!photos.length) return [];
  const results = await Promise.all(photos.map(p => uploadPhotoToStorage(userId, p)));
  return results.filter((url): url is string => url !== null);
}

async function fetchWithRetry<T>(
  fn: () => PromiseLike<{ data: T | null; error: unknown }>,
  retries = 3,
  delay = 1200
): Promise<{ data: T | null; error: unknown }> {
  for (let i = 0; i < retries; i++) {
    let result: { data: T | null; error: unknown };
    try {
      result = await fn();
    } catch (err) {
      result = { data: null, error: err };
    }

    if (!result.error && result.data !== null) return result;
    if (i < retries - 1) await wait(delay * (i + 1));
  }

  try {
    return await fn();
  } catch (err) {
    return { data: null, error: err };
  }
}

function mapMomentRow(row: MomentRow): Moment {
  const safePhotos = ((row.photos || []) as unknown[])
    .filter((p): p is string => typeof p === 'string')
    .filter(p => !p.startsWith('data:') && p.length < 2000);
  const safeLinks = ((row.links || []) as unknown[])
    .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === 'object')
    .map((entry): MomentLinkPreview | null => {
      const url = typeof entry.url === 'string' ? entry.url : '';
      if (!url) return null;
      return {
        url,
        title: typeof entry.title === 'string' ? entry.title : undefined,
        description: typeof entry.description === 'string' ? entry.description : undefined,
        image: typeof entry.image === 'string' ? entry.image : undefined,
        siteName: typeof entry.siteName === 'string' ? entry.siteName : undefined,
      };
    })
    .filter((entry): entry is MomentLinkPreview => entry !== null);

  return {
    id: row.id,
    date: row.date,
    text: row.text ?? undefined,
    emoji: row.emoji ?? undefined,
    photos: safePhotos,
    links: safeLinks,
    tags: (row.tags || []) as string[],
    location: row.location_name
      ? {
          name: row.location_name,
          lat: row.location_lat!,
          lng: row.location_lng!,
          category: (row.location_category as 'restaurant' | 'coffee' | 'grocery' | 'park' | 'museum' | 'other') || 'other',
        }
      : undefined,
    isSpecial: row.is_special,
    createdAt: row.created_at,
    timer_started_at: row.timer_started_at,
    timer_ended_at: row.timer_ended_at,
    timer_seconds: row.timer_seconds,
  };
}

async function fetchPagedMoments(userId: string, locationsOnly: boolean): Promise<{ data: Moment[]; error: unknown }> {
  const rows: MomentRow[] = [];
  let from = 0;

  while (true) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await fetchWithRetry<MomentRow[]>(() => {
        let query = supabase
          .from('moments')
          .select('id, date, text, emoji, photos, links, tags, is_special, created_at, timer_started_at, timer_ended_at, timer_seconds, location_name, location_lat, location_lng, location_category')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .range(from, to);

      if (locationsOnly) {
        query = query.not('location_name', 'is', null);
      }

      // Cast: committed types.ts is stale (missing moments.links), so a select
      // naming `links` resolves to a Supabase SelectQueryError. Runtime is
      // correct; narrow to the real row shape via unknown (not any).
      return query as unknown as PromiseLike<{ data: MomentRow[] | null; error: unknown }>;
    });

    if (error) {
      if (rows.length > 0) {
        console.warn('Partial moments loaded due to timeout:', error);
        break;
      }

      if (isMissingMomentLinksColumn(error)) {
        const fallbackResult = await fetchWithRetry<MomentRow[]>(() => {
          let fallbackQuery = supabase
            .from('moments')
            .select('id, date, text, emoji, photos, tags, is_special, created_at, timer_started_at, timer_ended_at, timer_seconds, location_name, location_lat, location_lng, location_category')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .range(0, PAGE_SIZE - 1);

          if (locationsOnly) {
            fallbackQuery = fallbackQuery.not('location_name', 'is', null);
          }

          return fallbackQuery;
        });

        if (!fallbackResult.error && fallbackResult.data) {
          const fallbackRows = fallbackResult.data.map(row => ({ ...row, links: [] }));
          return { data: fallbackRows.map(mapMomentRow), error: null };
        }
      }

      const leanResult = await fetchWithRetry<MomentRow[]>(() => {
        let leanQuery = supabase
          .from('moments')
          .select('id, date, text, emoji, links, tags, is_special, created_at, timer_started_at, timer_ended_at, timer_seconds, location_name, location_lat, location_lng, location_category')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .range(0, PAGE_SIZE - 1);

        if (locationsOnly) {
          leanQuery = leanQuery.not('location_name', 'is', null);
        }

        return leanQuery as unknown as PromiseLike<{ data: MomentRow[] | null; error: unknown }>;
      });

      if (!leanResult.error && leanResult.data) {
        const leanRows = leanResult.data.map(row => ({ ...row, photos: [] }));
        return { data: leanRows.map(mapMomentRow), error: null };
      }

      return { data: [], error };
    }

    const page = data || [];
    if (page.length === 0) break;

    rows.push(...page);

    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return { data: rows.map(mapMomentRow), error: null };
}

export async function fetchAllMoments(userId: string): Promise<{ data: Moment[]; error: unknown }> {
  return fetchPagedMoments(userId, false);
}
