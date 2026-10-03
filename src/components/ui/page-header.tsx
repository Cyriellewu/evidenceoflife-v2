import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  title: ReactNode;
  eyebrow?: ReactNode;
  subtitle?: ReactNode;
  leading?: ReactNode;
  right?: ReactNode;
  secondaryRow?: ReactNode;
  variant?: 'sheet' | 'page';
  titleAs?: 'h1' | 'h2';
  className?: string;
}

export function PageHeader({
  title,
  eyebrow,
  subtitle,
  leading,
  right,
  secondaryRow,
  variant = 'page',
  titleAs,
  className,
}: PageHeaderProps) {
  const isSheet = variant === 'sheet';
  const TitleTag = titleAs ?? (isSheet ? 'h2' : 'h1');

  return (
    <div
      className={cn(
        'flex-shrink-0',
        isSheet
          ? // Reserve right padding so radix Sheet's absolute close/expand buttons
            // (top-right, ~88px) never overlap the title or `right` slot content.
            // Safe-area so iPhone notch / Dynamic Island doesn't clip the header.
            'border-b border-border/55 bg-background/95 px-5 pb-3 pr-[7.5rem] pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-xl'
          : 'px-5 pt-5 pb-4',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {leading && <div className="flex-shrink-0">{leading}</div>}
          <div className="min-w-0">
            {eyebrow && (
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground/45">
                {eyebrow}
              </p>
            )}
            <TitleTag
              className={cn(
                'truncate font-semibold tracking-tight text-foreground',
                isSheet
                  ? 'text-[19px] tracking-[-0.03em]'
                  : 'mt-0.5 text-[26px] font-bold font-display leading-none',
              )}
            >
              {title}
            </TitleTag>
            {subtitle && (
              <p
                className={cn(
                  'font-medium text-muted-foreground/60',
                  isSheet ? 'mt-1 text-[12px]' : 'mt-1.5 text-[13px]',
                )}
              >
                {subtitle}
              </p>
            )}
          </div>
        </div>
        {right && <div className="flex flex-shrink-0 items-center gap-2">{right}</div>}
      </div>
      {secondaryRow && <div className={cn(isSheet ? 'mt-3' : 'mt-4')}>{secondaryRow}</div>}
    </div>
  );
}
