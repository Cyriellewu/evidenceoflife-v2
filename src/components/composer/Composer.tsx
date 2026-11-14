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
import { ArrowUp, Check, Loader2, Mic, X } from 'lucide-react';
import { useDictation } from '@/hooks/useDictation';
import { joinSpoken } from '@/lib/dictationLang';
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
  /**
   * Inline dictation: a mic in the bottom row; while listening the text row
   * shows a waveform and live words, with ✕ (discard) and ✓ (insert).
   * Hidden when the browser has no speech recognition.
   */
  dictation?: boolean;
  /** BCP-47 language for dictation, e.g. "zh-CN" or "en-US". */
  dictationLang?: string;
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
  dictation,
  dictationLang = 'zh-CN',
}: ComposerProps) {
  const dict = useDictation(dictationLang);
  const listening = dict.state !== 'idle';
  const insertDictation = () => {
    const spoken = dict.finish();
    if (spoken) onChange(joinSpoken(value, spoken));
    requestAnimationFrame(() => innerRef.current?.focus());
  };
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
        {listening && (
          <DictationPanel finals={dict.finals} interim={dict.interim} pulse={dict.pulse} error={dict.error} />
        )}
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
          className={cn('block w-full resize-none bg-transparent px-4 pt-3 text-[16px] leading-[22px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none disabled:opacity-50 sm:text-[15px]', listening && '!hidden')}
          style={{ minHeight: LINE_HEIGHT_PX, overflowY: 'hidden' }}
        />
        <div className="flex items-center gap-1 px-2 pb-2 pt-1">
          {listening ? (
            <>
              {/* Listening language — its own choice, not the UI language. */}
              <button
                type="button"
                onClick={() => dict.setLang(dict.lang === 'zh-CN' ? 'en-US' : 'zh-CN')}
                aria-label={dict.lang === 'zh-CN' ? 'Listening for Chinese. Switch to English' : 'Listening for English. Switch to Chinese'}
                data-testid="dictation-lang"
                className="ml-1 inline-flex h-8 items-center rounded-full bg-[hsl(var(--surface-inset))] px-3 text-[13px] font-medium text-foreground/80 transition-colors hover:text-foreground"
              >
                {dict.lang === 'zh-CN' ? '中文' : 'English'}
              </button>
              <div className="flex-1" />
              <ComposerIconButton onClick={dict.cancel} ariaLabel="Discard dictation">
                <X size={18} />
              </ComposerIconButton>
              <button
                type="button"
                onClick={insertDictation}
                aria-label="Insert dictation"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-foreground text-background transition-opacity hover:opacity-90"
              >
                <Check size={18} strokeWidth={2.6} />
              </button>
            </>
          ) : (
          <>
          <div className="flex min-w-0 items-center gap-1">{leading}</div>
          <div className="flex-1" />
          <div className="flex flex-shrink-0 items-center gap-1">
            {dictation && dict.supported && (
              <ComposerIconButton onClick={dict.start} ariaLabel="Dictate" testId="composer-dictate">
                <Mic size={17} />
              </ComposerIconButton>
            )}
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
          </>
          )}
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

/** Live dictation: a waveform that moves when speech arrives, and the words so far. */
function DictationPanel({ finals, interim, pulse, error }: { finals: string; interim: string; pulse: number; error: string | null }) {
  const BARS = 32;
  const bars = Array.from({ length: BARS }, (_, i) => {
    // Deterministic "random" height per bar that changes with each result.
    const seed = Math.sin((pulse + 1) * 12.9898 + i * 78.233) * 43758.5453;
    const r = seed - Math.floor(seed);
    const center = 1 - Math.abs(i - BARS / 2) / (BARS / 2);
    return pulse === 0 ? 3 : Math.max(3, Math.round(4 + r * 18 * (0.45 + center * 0.55)));
  });
  return (
    <div className="px-4 pt-3" aria-live="polite">
      <div className="flex h-7 items-center gap-[3px]" aria-hidden>
        {bars.map((h, i) => (
          <span
            key={i}
            className="w-[3px] rounded-full bg-foreground/70 transition-[height] duration-150 ease-out"
            style={{ height: h }}
          />
        ))}
      </div>
      <p className="mt-2 min-h-[22px] text-[16px] leading-[22px] text-foreground sm:text-[15px]">
        {error ? (
          <span className="text-muted-foreground">Mic unavailable — check the browser permission.</span>
        ) : finals || interim ? (
          <>
            {finals}
            {interim && <span className="text-muted-foreground"> {interim}</span>}
          </>
        ) : (
          <span className="text-muted-foreground">Listening…</span>
        )}
      </p>
    </div>
  );
}
