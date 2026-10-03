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
 * Returns true when a keyboard event is part of an IME composition
 * (e.g. typing Chinese/Japanese), including the legacy `keyCode === 229`
 * fallback for older browsers.
 *
 * Prefer {@link isEnterSubmit} for Enter-to-save fields: on some CJK mobile
 * keyboards, the post-composition Enter still reports `keyCode === 229`, so
 * treating 229 as "always composing" blocks legitimate saves.
 */
export function isImeComposing(event: { isComposing?: boolean; keyCode?: number }): boolean {
  return Boolean(event.isComposing) || event.keyCode === 229;
}

/**
 * True when an Enter keypress should submit (not an IME confirmation, and—by
 * default—not a Shift+Enter newline).
 *
 * Uses `isComposing` only — do not gate on keyCode 229 here, or Chinese/Japanese
 * mobile keyboards may never be able to confirm a title with Enter.
 */
export function isEnterSubmit(
  event: { key: string; shiftKey?: boolean; nativeEvent: Event },
): boolean {
  if (event.key !== "Enter") return false;
  if (event.shiftKey) return false;
  const native = event.nativeEvent as KeyboardEvent;
  return !native.isComposing;
}
