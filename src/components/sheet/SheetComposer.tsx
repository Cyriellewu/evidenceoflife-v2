import { KeyboardEvent, ReactNode, forwardRef } from 'react';
import { ArrowUp } from 'lucide-react';
import { cn, isEnterSubmit } from '@/lib/utils';

interface SheetComposerProps {
  value: string;
  onChange: (next: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  /** Optional left slot — typically a plus menu button. */
  leading?: ReactNode;
  /** Optional buttons before the submit pill (e.g. voice mic). */
  trailing?: ReactNode;
  /** Optional row(s) shown below the pill (e.g. due-date editor, category chips, attachments). */
  expand?: ReactNode;
  /** Optional row shown above the pill (e.g. pending photo / link attachment chips). */
  attachments?: ReactNode;
  disabled?: boolean;
  loading?: boolean;
  onPaste?: (e: React.ClipboardEvent<HTMLInputElement>) => void;
  /** Optional className for the outer wrapper. */
  className?: string;
}

/**
 * iOS-style composer for the side-sheets (Notes / Links / Deadlines / Habits).
 *
 * The visual structure is intentionally simple: one rounded-full input pill
 * on a soft surface, a single accent submit button on the right, and optional
 * leading/trailing/expand slots so per-sheet extras (plus menu, voice mic,
 * date row, attachment chips) compose without each sheet inventing its own
 * shape.
 */
export const SheetComposer = forwardRef<HTMLInputElement, SheetComposerProps>(function SheetComposer(
  {
    value,
    onChange,
    onSubmit,
    placeholder,
    leading,
    trailing,
    expand,
    attachments,
    disabled,
    loading,
    onPaste,
    className,
  },
  inputRef,
) {
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (isEnterSubmit(e) && value.trim() && !loading && !disabled) {
      e.preventDefault();
      onSubmit();
    }
  };

  return (
    <div
      className={cn(
        'sticky bottom-2 z-40 mx-auto w-full max-w-[720px] rounded-3xl bg-background/80 p-1.5 backdrop-blur-xl shadow-[0_14px_34px_hsl(var(--foreground)/0.09)] mb-[env(safe-area-inset-bottom)]',
        className,
      )}
    >
      <div className="overflow-hidden rounded-[20px] border border-border/55 bg-card/96 shadow-[0_1px_2px_hsl(var(--foreground)/0.03)]">
        {attachments && <div className="px-3.5 pt-3">{attachments}</div>}
        <div className="flex items-center gap-2 px-2.5 py-2">
          {leading && <div className="flex-shrink-0">{leading}</div>}
          <div className="flex min-h-[36px] flex-1 items-center gap-1.5 rounded-full bg-[hsl(var(--surface-soft))] px-3.5">
            <input
              ref={inputRef}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={onPaste}
              placeholder={placeholder}
              disabled={disabled}
              className="min-w-0 flex-1 bg-transparent text-[14px] font-medium text-foreground placeholder:text-muted-foreground/55 focus:outline-none disabled:opacity-50"
            />
            {trailing && <div className="flex flex-shrink-0 items-center gap-1">{trailing}</div>}
          </div>
          <button
            type="button"
            onClick={onSubmit}
            disabled={!value.trim() || disabled || loading}
            aria-label="Submit"
            className={cn(
              'flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-all',
              'shadow-[0_2px_6px_hsl(var(--primary)/0.35)] hover:shadow-[0_3px_10px_hsl(var(--primary)/0.45)]',
              'disabled:opacity-30 disabled:shadow-none',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            )}
          >
            <ArrowUp size={16} strokeWidth={2.4} />
          </button>
        </div>
        {expand && <div className="border-t border-border/45 px-2.5 py-2">{expand}</div>}
      </div>
    </div>
  );
});

/**
 * Round ghost button used inside SheetComposer slots (leading plus, voice mic, etc.).
 * Keeps every per-slot button visually identical across the four sheets.
 */
export function SheetComposerIconButton({
  onClick,
  children,
  ariaLabel,
  className,
  asChild,
}: {
  onClick?: () => void;
  children: ReactNode;
  ariaLabel?: string;
  className?: string;
  asChild?: boolean;
}) {
  if (asChild) {
    return <>{children}</>;
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={cn(
        'flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-[hsl(var(--surface-soft-hover))] hover:text-foreground',
        className,
      )}
    >
      {children}
    </button>
  );
}
