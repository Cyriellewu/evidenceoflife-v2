import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Extract a human-readable message from an unknown thrown value. */
export function getErrorMessage(error: unknown, fallback = "Something went wrong"): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return fallback;
}

/**
 * Safari (macOS and iOS) fires `compositionend` *before* the keydown of the
 * Enter that confirms a Chinese/Japanese candidate, so that keydown arrives
 * with `isComposing === false` and would be taken as "submit". We remember
 * when the last composition ended and treat an Enter that lands right after
 * it as part of the IME confirmation.
 */
const IME_ENTER_GRACE_MS = 60;
let lastCompositionEndAt = -Infinity;
if (typeof document !== "undefined") {
  document.addEventListener(
    "compositionend",
    () => { lastCompositionEndAt = typeof performance !== "undefined" ? performance.now() : Date.now(); },
    true,
  );
}
/** Test hook: pretend a composition just ended (or reset with -Infinity). */
export function __setLastCompositionEndForTest(at: number) {
  lastCompositionEndAt = at;
}
function justEndedComposition(): boolean {
  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  return now - lastCompositionEndAt < IME_ENTER_GRACE_MS;
}

/**
 * Returns true when a keyboard event is part of an IME composition
 * (e.g. typing Chinese/Japanese), including the legacy `keyCode === 229`
 * fallback for older browsers and Safari's compositionend-first ordering.
 *
 * Prefer {@link isEnterSubmit} for Enter-to-save fields: on some CJK mobile
 * keyboards, the post-composition Enter still reports `keyCode === 229`, so
 * treating 229 as "always composing" blocks legitimate saves.
 */
export function isImeComposing(event: { isComposing?: boolean; keyCode?: number }): boolean {
  return Boolean(event.isComposing) || event.keyCode === 229 || justEndedComposition();
}

/** True when this Enter keydown belongs to an IME (confirming a candidate). */
export function isImeEnter(event: { isComposing?: boolean }): boolean {
  return Boolean(event.isComposing) || justEndedComposition();
}

/**
 * True when an Enter keypress should submit (not an IME confirmation, and—by
 * default—not a Shift+Enter newline).
 *
 * Uses `isComposing` plus the Safari compositionend window — not keyCode 229,
 * or Chinese/Japanese mobile keyboards may never be able to confirm a title
 * with Enter.
 */
export function isEnterSubmit(
  event: { key: string; shiftKey?: boolean; nativeEvent: Event },
): boolean {
  if (event.key !== "Enter") return false;
  if (event.shiftKey) return false;
  return !isImeEnter(event.nativeEvent as KeyboardEvent);
}
