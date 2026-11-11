import { ClipboardEvent, ReactNode, forwardRef } from 'react';
import { cn } from '@/lib/utils';
import { Composer } from '@/components/composer/Composer';

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
  onPaste?: (e: ClipboardEvent<HTMLTextAreaElement>) => void;
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
export const SheetComposer = forwardRef<HTMLTextAreaElement, SheetComposerProps>(function SheetComposer(
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
  // Same composer as everywhere else (src/components/composer/Composer.tsx).
  return (
    <Composer
      value={value}
      onChange={onChange}
      onSubmit={onSubmit}
      placeholder={placeholder}
      leading={leading}
      trailing={trailing}
      attachments={attachments}
      expand={expand}
      disabled={disabled}
      loading={loading}
      onPaste={onPaste}
      textareaRef={inputRef}
      sendLabel="Submit"
      className={cn(
        'sticky bottom-2 z-40 mx-auto max-w-[720px] mb-[env(safe-area-inset-bottom)]',
        className,
      )}
    />
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
