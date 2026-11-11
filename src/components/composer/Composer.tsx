import {
  ClipboardEvent,
  KeyboardEvent,
  ReactNode,
  Ref,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
} from 'react';
import { ArrowUp, Loader2 } from 'lucide-react';
import { cn, isEnterSubmit } from '@/lib/utils';
import { LINE_HEIGHT_PX, composerHeight, isTouchComposer } from './composerLayout';

/**
 * The one text composer used across the app (Recap, Plan, Deadlines, Habits,
 * Links, Notes). Two rows, like a chat app:
 *
 *   ┌──────────────────────────────────────────┐
 *   │ [attachments: photos · links · chips]     │
 *   │ text, growing up to maxRows, then scroll  │
 *   │ (+)  …leading            trailing (mic) (↑)│
 *   └──────────────────────────────────────────┘
 *
 * Keys: with a mouse/keyboard, Enter sends and Shift+Enter adds a line. On a
 * touch screen Enter adds a line (phone keyboards have no Shift) and the send
 * button sends. IME confirmation never sends (isEnterSubmit).
 */
export interface ComposerProps {
  value: string;
  onChange: (next: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  /** Left side of the bottom row — usually the "+" menu. */
  leading?: ReactNode;
  /** Right side of the bottom row, before send — e.g. mic, camera, timer. */
  trailing?: ReactNode;
  /** Shown inside the box above the text: photo thumbnails, link cards, chips. */
  attachments?: ReactNode;
  /** Shown outside, just above the box (e.g. suggestions). */
  above?: ReactNode;
  /** Shown inside the box below the bottom row (e.g. a date editor). */
  expand?: ReactNode;
  /** Send is enabled when this is true (defaults to "has text"). */
  canSubmit?: boolean;
  loading?: boolean;
  disabled?: boolean;
  /** Hide the send button (host provides its own submit control). */
  hideSend?: boolean;
  sendLabel?: string;
  /** Max visible lines before the text scrolls: phone / desktop. */
  maxRows?: { phone: number; desktop: number };
  autoFocus?: boolean;
  onPaste?: (e: ClipboardEvent<HTMLTextAreaElement>) => void;
  /** Extra key handling (runs first; call preventDefault to stop the default). */
  onKeyDown?: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  textareaRef?: Ref<HTMLTextAreaElement | null>;
  className?: string;
  /** data-testid for the textarea. */
  testId?: string;
  ariaLabel?: string;
}

export function Composer({
  value,
  onChange,
  onSubmit,
  placeholder,
  leading,
  trailing,
  attachments,
  above,
  expand,
  canSubmit,
  loading,
  disabled,
  hideSend,
  sendLabel = 'Send',
  maxRows = { phone: 4, desktop: 6 },
  autoFocus,
  onPaste,
  onKeyDown,
  onFocus,
  onBlur,
  textareaRef,
  className,
  testId,
  ariaLabel,
}: ComposerProps) {
  const innerRef = useRef<HTMLTextAreaElement | null>(null);
  useImperativeHandle(textareaRef, () => innerRef.current, []);
  const sendable = (canSubmit ?? value.trim().length > 0) && !loading && !disabled;

  const resize = useCallback(() => {
    const el = innerRef.current;
    if (!el) return;
    const rows = isTouchComposer() || window.innerWidth < 640 ? maxRows.phone : maxRows.desktop;
    el.style.height = 'auto';
    const { height, scrolls } = composerHeight(el.scrollHeight, rows);
    el.style.height = `${height}px`;
    el.style.overflowY = scrolls ? 'auto' : 'hidden';
  }, [maxRows.desktop, maxRows.phone]);

  useLayoutEffect(resize, [value, resize]);
  useEffect(() => {
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [resize]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    onKeyDown?.(e);
    if (e.defaultPrevented) return;
    if (!isEnterSubmit(e)) return;
    if (isTouchComposer()) return; // phone: Enter is a new line; the button sends
    e.preventDefault();
    if (sendable) onSubmit();
  };

  return (
    <div className={cn('w-full', className)}>
      {above}
      <div className="overflow-hidden rounded-[24px] border border-border/60 bg-[hsl(var(--toolbar-background))] shadow-[0_8px_28px_-14px_hsl(var(--foreground)/0.22)]">
        {attachments && <div className="px-3 pt-3">{attachments}</div>}
        <textarea
          ref={innerRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={onPaste}
          onFocus={onFocus}
          onBlur={onBlur}
          placeholder={placeholder}
          aria-label={ariaLabel ?? placeholder}
          data-testid={testId}
          disabled={disabled}
          autoFocus={autoFocus}
          rows={1}
          enterKeyHint={isTouchComposer() ? 'enter' : 'send'}
          className="block w-full resize-none bg-transparent px-4 pt-3 text-[16px] leading-[22px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none disabled:opacity-50 sm:text-[15px]"
          style={{ minHeight: LINE_HEIGHT_PX, overflowY: 'hidden' }}
        />
        <div className="flex items-center gap-1 px-2 pb-2 pt-1">
          <div className="flex min-w-0 items-center gap-1">{leading}</div>
          <div className="flex-1" />
          <div className="flex flex-shrink-0 items-center gap-1">
            {trailing}
            {!hideSend && (
              <button
                type="button"
                onClick={() => sendable && onSubmit()}
                disabled={!sendable}
                aria-label={sendLabel}
                className={cn(
                  'flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full transition-colors',
                  sendable
                    ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                    : 'bg-foreground/10 text-muted-foreground',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45',
                )}
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : <ArrowUp size={17} strokeWidth={2.4} />}
              </button>
            )}
          </div>
        </div>
        {expand && <div className="border-t border-border/45 px-3 py-2">{expand}</div>}
      </div>
    </div>
  );
}

/** Round icon button for the composer's bottom row (plus, mic, camera, timer). */
export function ComposerIconButton({
  onClick,
  children,
  ariaLabel,
  title,
  active,
  className,
  testId,
}: {
  onClick?: () => void;
  children: ReactNode;
  ariaLabel: string;
  title?: string;
  active?: boolean;
  className?: string;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      title={title ?? ariaLabel}
      data-testid={testId}
      className={cn(
        'flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full transition-colors',
        active
          ? 'bg-[hsl(var(--surface-inset))] text-foreground'
          : 'text-muted-foreground hover:bg-[hsl(var(--surface-soft-hover))] hover:text-foreground',
        className,
      )}
    >
      {children}
    </button>
  );
}
