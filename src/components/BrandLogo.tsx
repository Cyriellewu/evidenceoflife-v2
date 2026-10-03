import lightLogo from '@/assets/evidence-logo-light.png';
import darkLogo from '@/assets/evidence-logo-dark.png';
import { cn } from '@/lib/utils';

interface BrandLogoProps {
  alt?: string;
  className?: string;
  /**
   * `full` / `mark` — same hand-drawn path + sun logo.
   * Kept as two names so drawer call sites stay readable; both point at the
   * real PNG assets (not the footprint mark, not a generated SVG).
   */
  variant?: 'full' | 'mark';
}

export function BrandLogo({
  alt = 'Evidence of Life',
  className,
  variant: _variant = 'full',
}: BrandLogoProps) {
  return (
    <picture>
      <source media="(prefers-color-scheme: dark)" srcSet={darkLogo} />
      <img
        src={lightLogo}
        alt={alt}
        className={cn('object-contain', className)}
        draggable={false}
      />
    </picture>
  );
}
