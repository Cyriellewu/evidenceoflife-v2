import lightLogo from '@/assets/evidence-logo-light.png';
import darkLogo from '@/assets/evidence-logo-dark.png';
import { cn } from '@/lib/utils';

interface BrandLogoProps {
  alt?: string;
  className?: string;
  /**
   * `full` — wide PNG wordmark plate (landing / auth).
   * `mark` — square transparent SVG for chrome/drawers (no white box).
   */
  variant?: 'full' | 'mark';
}

export function BrandLogo({
  alt = 'Evidence of Life',
  className,
  variant = 'full',
}: BrandLogoProps) {
  if (variant === 'mark') {
    return (
      <img
        src="/evidence-mark.svg"
        alt={alt}
        className={cn('object-contain', className)}
        draggable={false}
      />
    );
  }

  return (
    <picture>
      <source media="(prefers-color-scheme: dark)" srcSet={darkLogo} />
      <img
        src={lightLogo}
        alt={alt}
        className={cn('object-contain', className)}
      />
    </picture>
  );
}
