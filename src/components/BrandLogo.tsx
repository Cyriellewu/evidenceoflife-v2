import lightLogo from '@/assets/evidence-logo-light.png';
import darkLogo from '@/assets/evidence-logo-dark.png';
import markLogo from '@/assets/evidence-logo-mark.png';
import { cn } from '@/lib/utils';

interface BrandLogoProps {
  alt?: string;
  className?: string;
  /**
   * `full` — original PNG with plate (landing / auth).
   * `mark` — same path + sun artwork, white plate punched out (drawer / chrome).
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
        draggable={false}
      />
    </picture>
  );
}
