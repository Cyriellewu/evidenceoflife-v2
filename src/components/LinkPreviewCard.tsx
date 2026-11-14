import { Globe, Link2, X } from 'lucide-react';
import { MomentLinkPreview } from '@/types';
import { cn } from '@/lib/utils';
import { buildProxyImageUrl, getDomain as hostnameLabel } from '@/lib/linkUtils';

interface LinkPreviewCardProps {
  preview: MomentLinkPreview;
  onRemove?: () => void;
  onCardClick?: () => void;
  compact?: boolean;
  className?: string;
}

export function LinkPreviewCard({ preview, onRemove, onCardClick, compact = false, className }: LinkPreviewCardProps) {
  const siteName = preview.siteName || hostnameLabel(preview.url);
  const title = preview.title || siteName;
  const description = preview.description?.trim();
  const thumbnail = preview.image
    ? buildProxyImageUrl(preview.image)
    : `https://www.google.com/s2/favicons?sz=128&domain_url=${encodeURIComponent(preview.url)}`;
  const hasCoverImage = Boolean(preview.image);

  return (
    <div
      onClick={() => onCardClick?.()}
      className={cn(
        "group relative overflow-hidden rounded-[20px] border border-border/80 bg-[hsl(var(--surface-soft))] shadow-[0_8px_22px_hsl(var(--foreground)/0.05)]",
        compact ? "max-w-[320px]" : "",
        className
      )}
    >
      {onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="absolute right-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-background/90 text-muted-foreground transition-colors hover:text-foreground"
        >
          <X size={12} />
        </button>
      )}
      <a
        href={preview.url}
        target="_blank"
        rel="noreferrer"
        className={cn("flex min-w-0 items-stretch", compact ? "min-h-[88px]" : "min-h-[104px]")}
      >
        <div className="flex min-w-0 flex-1 flex-col justify-center px-4 py-3">
          <div className={cn("line-clamp-2 text-foreground", compact ? "text-[13px] font-medium" : "text-[14px] font-medium")}>
            {title}
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground/65">
            <Globe size={10} />
            <span className="truncate">{siteName}</span>
          </div>
          {description && (
            <div className={cn("mt-1 line-clamp-2 text-muted-foreground/80", compact ? "text-[11px]" : "text-[12px]")}>
              {description}
            </div>
          )}
        </div>
        <div className={cn(
          "flex flex-shrink-0 items-center justify-center border-l border-border/60",
          hasCoverImage ? "bg-transparent px-3" : "bg-[hsl(var(--surface-inset))]",
          compact ? "w-24" : "w-28"
        )}>
          <div
            className={cn(
              "overflow-hidden rounded-2xl border border-border/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]",
              hasCoverImage ? "bg-transparent" : "bg-white/85",
              compact ? (hasCoverImage ? "h-16 w-16" : "h-14 w-14") : (hasCoverImage ? "h-20 w-20" : "h-16 w-16")
            )}
          >
            <img
              src={thumbnail}
              alt=""
              className={cn(
                "h-full w-full",
                hasCoverImage ? "object-cover" : "object-contain p-3 opacity-90"
              )}
              onError={(e) => {
                const img = e.currentTarget;
                if (img.dataset.fallbackApplied === 'true') return;
                img.dataset.fallbackApplied = 'true';
                img.src = `https://www.google.com/s2/favicons?sz=128&domain=${encodeURIComponent(siteName)}`;
                img.className = cn(
                  "h-full w-full",
                  "object-contain p-3 opacity-90"
                );
              }}
            />
          </div>
        </div>
      </a>
    </div>
  );
}
