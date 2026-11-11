/** Line height of the composer text, in px (matches leading-[22px]). */
export const LINE_HEIGHT_PX = 22;

/** Touch-first device: Enter should add a line, not send. */
export function isTouchComposer(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(pointer: coarse)').matches;
}

/** Height the textarea should take for its content, capped at maxRows. */
export function composerHeight(scrollHeight: number, maxRows: number, lineHeight = LINE_HEIGHT_PX): {
  height: number;
  scrolls: boolean;
} {
  const cap = maxRows * lineHeight;
  return { height: Math.max(lineHeight, Math.min(scrollHeight, cap)), scrolls: scrollHeight > cap };
}
