/**
 * A timeline placement is something the user already did when it sits on a
 * calendar day before today, or on today and the chosen boundary has passed.
 * Future days are never treated as elapsed — their clock is pinned to the end
 * of the day only for drawing, which must not mark those tasks done.
 */
export function isElapsedSlot(args: {
  viewingDate: string;
  today: string;
  boundaryMin: number;
  nowMin: number;
  /** Drop point: strictly before now. Drawn range end: at or before now. */
  strict?: boolean;
}): boolean {
  if (args.viewingDate < args.today) return true;
  if (args.viewingDate > args.today) return false;
  return args.strict
    ? args.boundaryMin < args.nowMin
    : args.boundaryMin <= args.nowMin;
}
