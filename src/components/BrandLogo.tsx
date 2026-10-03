import lightLogo from '@/assets/evidence-logo-light.png';
import darkLogo from '@/assets/evidence-logo-dark.png';
import markLogo from '@/assets/footprint-mark.png';
import { cn } from '@/lib/utils';

interface BrandLogoProps {
  alt?: string;
  className?: string;
  /**
   * `full` — wide PNG illustration (landing / auth).
   * `mark` — square footprint mark for chrome/drawers (no invented SVG).
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
        src={markLogo}
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
