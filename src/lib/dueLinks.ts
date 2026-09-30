import type { Json } from '@/integrations/supabase/types';

/** Link attached to a due/habit or a plan step (same JSON shape in `todos.links`). */
export interface DueLink {
  url: string;
  label?: string;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  count?: number;
}

export function parseDueLinks(value: Json | null | undefined): DueLink[] {
  if (!Array.isArray(value)) return [];
  const links: DueLink[] = [];
  value.forEach((item) => {
    if (typeof item !== 'object' || item === null) return;
    const candidate = item as {
      url?: unknown;
      label?: unknown;
      title?: unknown;
      description?: unknown;
      image?: unknown;
      siteName?: unknown;
      count?: unknown;
    };
    if (typeof candidate.url !== 'string') return;
    links.push({
      url: candidate.url,
      ...(typeof candidate.label === 'string' ? { label: candidate.label } : {}),
      ...(typeof candidate.title === 'string' ? { title: candidate.title } : {}),
      ...(typeof candidate.description === 'string' ? { description: candidate.description } : {}),
      ...(typeof candidate.image === 'string' ? { image: candidate.image } : {}),
      ...(typeof candidate.siteName === 'string' ? { siteName: candidate.siteName } : {}),
      ...(typeof candidate.count === 'number' ? { count: candidate.count } : {}),
    });
  });
  return links;
}

export function serializeDueLinks(links: DueLink[]): Json {
  return links.map((link) => ({
    url: link.url,
    ...(link.label ? { label: link.label } : {}),
    ...(link.title ? { title: link.title } : {}),
    ...(link.description ? { description: link.description } : {}),
    ...(link.image ? { image: link.image } : {}),
    ...(link.siteName ? { siteName: link.siteName } : {}),
    ...(typeof link.count === 'number' ? { count: link.count } : {}),
  }));
}

/**
 * Resolve a plan step's primary link for display.
 * Prefers structured `links[0]`; falls back to a URL stored as the step title
 * (legacy paste-as-raw-URL steps).
 */
export function resolveStepLink(
  step: { title: string; links?: DueLink[] },
  normalizeUrl: (value: string) => string | null,
  isUrlLike: (text: string) => boolean,
  getDomain: (url: string) => string,
): DueLink | null {
  const stored = step.links?.[0];
  if (stored?.url) return stored;
  if (!isUrlLike(step.title)) return null;
  const url = normalizeUrl(step.title);
  if (!url) return null;
  const site = getDomain(url);
  return { url, siteName: site, label: site, title: site };
}
