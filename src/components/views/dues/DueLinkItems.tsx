import { useState, useEffect } from 'react';
import { Link, ExternalLink, Pencil, X } from 'lucide-react';
import { cn, isImeEnter } from '@/lib/utils';
import {
  getDomain as getSiteFallback,
  buildProxyImageUrl,
  getFaviconUrl,
} from '@/lib/linkUtils';
import type { DueLink } from '@/hooks/useDues';

export function hasRichPreview(link: Partial<DueLink> | undefined): boolean {
  if (!link?.url) return false;
  const siteFallback = getSiteFallback(link.url).toLowerCase();
  const title = (link.title || '').trim().toLowerCase();
  const description = (link.description || '').trim();
  return Boolean(
    description ||
    (title && title !== siteFallback && title !== link.url.toLowerCase())
  );
}

export function getLinkDisplayName(link: Partial<DueLink>): string {
  return link.label?.trim() || link.title?.trim() || link.siteName?.trim() || getSiteFallback(link.url || '');
}

export function CompactHabitLinkThumb({ link }: { link: Partial<DueLink> }) {
  const [mode, setMode] = useState<'image' | 'favicon' | 'icon'>(() => {
    return link.image ? 'image' : link.url ? 'favicon' : 'icon';
  });

  useEffect(() => {
    setMode(link.image ? 'image' : link.url ? 'favicon' : 'icon');
  }, [link.image, link.url]);

  if (mode === 'icon') {
    return (
      <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border border-border/70 bg-[hsl(var(--surface-soft))] text-muted-foreground/70">
        <Link size={12} />
      </div>
    );
  }

  const src = mode === 'image' && link.image
    ? buildProxyImageUrl(link.image)
    : link.url
      ? getFaviconUrl(link.url)
      : '';

  return (
    <img
      src={src}
      alt=""
      className={cn(
        "h-5 w-5 flex-shrink-0 rounded-md border border-border/60 bg-white/85",
        mode === 'image' ? "object-cover" : "object-contain p-0.5"
      )}
      onError={() => {
        setMode((current) => {
          if (current === 'image' && link.url) return 'favicon';
          return 'icon';
        });
      }}
    />
  );
}

/** Inline thumb for a normal link row. Favicon first, generic Link glyph
 *  fallback. Leading emojis in the label stay inline with the text — we
 *  don't extract them into the thumb slot, which produced an inconsistent
 *  look when one link had an emoji label and the next one didn't. */
function LinkRowThumb({ link }: { link: Partial<DueLink> }) {
  const [mode, setMode] = useState<'favicon' | 'icon'>(link.url ? 'favicon' : 'icon');

  useEffect(() => {
    setMode(link.url ? 'favicon' : 'icon');
  }, [link.url]);

  if (mode === 'icon' || !link.url) {
    return (
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-border/60 bg-[hsl(var(--surface-contrast))] text-muted-foreground/70">
        <Link size={14} />
      </div>
    );
  }
  return (
    <img
      src={getFaviconUrl(link.url)}
      alt=""
      className="h-8 w-8 flex-shrink-0 rounded-lg border border-border/60 bg-white/90 object-contain p-1"
      onError={() => setMode('icon')}
    />
  );
}

export function LightweightLinkItem({
  link,
  onRemove,
  onRename,
  compact = false,
}: {
  link: Partial<DueLink>;
  onRemove?: () => void;
  onRename?: (nextLabel: string) => void;
  compact?: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftLabel, setDraftLabel] = useState(getLinkDisplayName(link));
  const fullLabel = getLinkDisplayName(link);
  const siteName = link.siteName || (link.url ? getSiteFallback(link.url) : '');

  useEffect(() => {
    setDraftLabel(getLinkDisplayName(link));
  }, [link.label, link.title, link.siteName, link.url]);

  const save = () => {
    const next = draftLabel.trim();
    if (next && next !== getLinkDisplayName(link)) onRename?.(next);
    setIsEditing(false);
  };

  return (
    <div className={cn(
      "group flex items-center gap-2.5 rounded-xl border border-border/55 bg-[hsl(var(--surface-soft))] px-2.5",
      compact ? "min-h-[44px] py-1.5" : "min-h-[52px] py-2"
    )}>
      <LinkRowThumb link={link} />
      <div className="min-w-0 flex-1">
        {isEditing ? (
          <input
            value={draftLabel}
            onChange={(e) => setDraftLabel(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => {
              if ((e.key === 'Enter' && !isImeEnter(e.nativeEvent))) save();
              if (e.key === 'Escape') {
                setDraftLabel(getLinkDisplayName(link));
                setIsEditing(false);
              }
            }}
            className="w-full bg-transparent text-[13px] font-medium text-foreground focus:outline-none"
            autoFocus
          />
        ) : (
          <a
            href={link.url}
            target="_blank"
            rel="noreferrer"
            className="block truncate text-[13px] font-semibold text-foreground hover:underline"
          >
            {fullLabel}
          </a>
        )}
        <div className="mt-0.5 truncate text-[11px] text-muted-foreground/75 lowercase">
          {siteName}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        {onRename && !isEditing && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              setDraftLabel(getLinkDisplayName(link));
              setIsEditing(true);
            }}
            aria-label="Rename link"
            className="rounded-full p-1.5 text-muted-foreground/60 transition-colors hover:bg-secondary hover:text-foreground"
          >
            <Pencil size={12} />
          </button>
        )}
        {link.url && (
          <a
            href={link.url}
            target="_blank"
            rel="noreferrer"
            aria-label="Open link"
            className="rounded-full p-1.5 text-muted-foreground/60 transition-colors hover:bg-secondary hover:text-foreground"
          >
            <ExternalLink size={12} />
          </a>
        )}
        {onRemove && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              onRemove();
            }}
            aria-label="Remove link"
            className="rounded-full p-1.5 text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            <X size={12} />
          </button>
        )}
      </div>
    </div>
  );
}
