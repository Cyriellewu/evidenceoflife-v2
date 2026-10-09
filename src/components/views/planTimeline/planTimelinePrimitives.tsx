import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { TAG_CATEGORY_COLORS, TAG_CATEGORY_ICONS, autoClassifyTag } from '@/lib/autoTag';

export const HOUR_HEIGHT = 68;
export const NOW_VIEWPORT_ANCHOR = 0.16;
export const PX_PER_MIN = HOUR_HEIGHT / 60;
export const DRAG_SNAP_MIN = 5;
export const MIN_BLOCK_MIN = 5;
export const REST_COLOR = 'hsl(195, 50%, 55%)';
export const SHOW_FREE_TIME_LABELS = true;
/** Left time column — matches timeline grid proportions in light mode */
export const TIME_RAIL_WIDTH_PX = 48;
/** Calm planner canvas (light only — warm paper, not a blue-gray dashboard) */
export const TIMELINE_CANVAS_LIGHT = '#fbfbfa';
/** X-offset of the spine inside the timeline content column, in px.
 *  Sits just inside the content column's left edge so blocks (which start
 *  at left: calc(0% + gap/2)) still have room to read. */
export const SPINE_X_PX = 14;
/** Rounded "card" silhouette for timed blocks */
export const BLOCK_CORNER_PX = 10;
/** Very short inflated shells: shave resize-hit strips + widen title lane */
export const ULTRA_SHORT_OUTER_PX = 30;
/** Drag a planned block beyond the timeline by this much to unschedule it. */
export const DRAG_UNSCHEDULE_MARGIN_PX = 18;
/** Timeline event titles stay ≤ PlanView task list titles (`TodoItem` uses `text-[16px]`). */
export const MAX_TIMELINE_TITLE_FONT_PX = 16;
/** Max side-by-side columns. Set high on purpose: the user wants every event
 *  that overlaps in time shown in its OWN parallel column (并排), never folded
 *  behind a "+N" badge. This value is only an absurd safety valve — a single
 *  day never has this many genuinely-concurrent blocks — so in practice nothing
 *  is ever hidden and no column-overflow stacking kicks in. */
export const MAX_VISIBLE_COLS = 24;

/** e.g. 36m, 1h 50m — matches floating interval pills */
export function formatGapMinutesLabel(totalMin: number): string {
  if (totalMin < 60) return `${totalMin}m`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function opaqueMix(canvasCss: string, accentCss: string, accentFraction: number): string {
  const pct = Math.round(accentFraction * 100);
  return `color-mix(in srgb, ${canvasCss} ${100 - pct}%, ${accentCss} ${pct}%)`;
}

function solidFillGradient(
  canvasCss: string,
  accentCss: string,
  top: number,
  mid: number,
  bot: number,
  /** On dark blocks, skip heavy horizontal darkening — it reads as “muddy” on near-black. */
  variant: 'default' | 'darkTint' = 'default',
): string {
  const quietTop = Math.max(top, mid, bot);
  const quietBottom = Math.min(top, mid, bot);
  /** Dark: a vertical wash reads as "frosted glass / semi-transparent" on big
   * blocks — which looks cheap on near-black. Use a single FLAT solid tint so
   * the block reads as a clean elevated dark card (like the timer pill). */
  if (variant === 'darkTint') {
    const flat = opaqueMix(canvasCss, accentCss, quietTop);
    return `linear-gradient(180deg, ${flat} 0%, ${flat} 100%)`;
  }
  /** Calm paper wash. The previous bell gradient created muddy/fluorescent bands,
   * especially in short blocks. A single directional wash keeps category color
   * visible without making blocks look like highlighter tape. */
  return `linear-gradient(180deg, ${opaqueMix(canvasCss, accentCss, quietTop)} 0%, ${opaqueMix(canvasCss, accentCss, bot)} 58%, ${opaqueMix(canvasCss, accentCss, quietBottom)} 100%)`;
}

export function TimelineIntervalPill({
  isDarkMode,
  children,
  className,
  variant = 'default',
}: {
  isDarkMode: boolean;
  children: ReactNode;
  className?: string;
  /** `subtle` — short gaps / low remaining: lighter, no floating shadow */
  variant?: 'default' | 'subtle';
}) {
  const subtle = variant === 'subtle';
  return (
    <div
      className={cn(
        'inline-flex max-w-[min(100%,280px)] items-center justify-center truncate rounded-full tabular-nums font-medium tracking-tight',
        subtle ? 'px-2 py-px text-[11px]' : 'px-2.5 py-[3px] text-[12px] sm:text-[13px]',
        className,
      )}
      style={{
        backgroundColor: subtle
          ? isDarkMode
            ? 'hsl(var(--muted) / 0.4)'
            : 'rgba(255, 255, 255, 0.78)'
          : isDarkMode
            ? 'hsl(var(--card))'
            : '#ffffff',
        border: subtle
          ? isDarkMode
            ? '1px solid hsl(var(--border) / 0.3)'
            : '1px solid rgba(60, 60, 67, 0.07)'
          : isDarkMode
            ? '1px solid hsl(var(--border) / 0.42)'
            : '1px solid rgba(60, 60, 67, 0.11)',
        boxShadow: subtle
          ? 'none'
          : isDarkMode
            ? '0 6px 18px rgba(0, 0, 0, 0.22)'
            : '0 6px 18px rgba(15, 23, 42, 0.085)',
        color: subtle
          ? isDarkMode
            ? 'hsl(var(--muted-foreground) / 0.82)'
            : 'rgba(72, 72, 74, 0.58)'
          : isDarkMode
            ? 'hsl(var(--muted-foreground) / 0.9)'
            : 'rgba(72, 72, 74, 0.78)',
      }}
    >
      {children}
    </div>
  );
}

/**
 * "Today remaining" indicator. No container — pure typography:
 *   `7h 39m  ──  LEFT TODAY`
 * A hairline rule between the number and the micro-label breathes in width
 * (10 ↔ 20px), and the label tracking eases (0.16 ↔ 0.20em) on the same
 * 4s cycle — the whole element gently "inhales / exhales" without ever
 * moving position or overpowering the now-line. `subtle` variant (used
 * when < 45min remain) shrinks the number, tightens the rule, and softens
 * both colors — the closer to bedtime, the quieter it gets.
 */
export function TimelineTodayRemainingPill({
  isDarkMode,
  time,
  label,
  variant = 'default',
  className,
}: {
  isDarkMode: boolean;
  time: string;
  label: string;
  variant?: 'default' | 'subtle';
  className?: string;
}) {
  const subtle = variant === 'subtle';
  const numColor = isDarkMode
    ? subtle ? 'hsl(var(--foreground) / 0.72)' : 'hsl(var(--foreground) / 0.92)'
    : subtle ? 'rgba(48, 48, 52, 0.62)'        : 'rgba(28, 28, 32, 0.86)';
  const ruleColor = isDarkMode
    ? subtle ? 'hsl(var(--muted-foreground) / 0.22)' : 'hsl(var(--muted-foreground) / 0.38)'
    : subtle ? 'rgba(60, 60, 67, 0.18)'             : 'rgba(60, 60, 67, 0.32)';
  const labelColor = isDarkMode
    ? subtle ? 'hsl(var(--muted-foreground) / 0.5)' : 'hsl(var(--muted-foreground) / 0.72)'
    : subtle ? 'rgba(72, 72, 74, 0.48)'             : 'rgba(72, 72, 74, 0.68)';
  const bgColor = isDarkMode ? 'hsl(240 5% 8% / 0.72)' : 'hsl(0 0% 100% / 0.78)';
  return (
    <div
      className={cn('inline-flex items-baseline gap-2 rounded-full px-2.5 py-1 select-none backdrop-blur-[4px]', className)}
      style={{ backgroundColor: bgColor }}
      aria-label={`${time} ${label}`}
    >
      <span
        className={cn(
          'tabular-nums font-medium',
          subtle ? 'text-[12px]' : 'text-[14px] sm:text-[15px]',
        )}
        style={{ color: numColor, letterSpacing: '-0.015em', lineHeight: 1 }}
      >
        {time}
      </span>
      <span
        aria-hidden
        className={cn(
          'self-center animate-today-rule-breathe',
          subtle && 'scale-y-50',
        )}
        style={{
          display: 'inline-block',
          height: 1,
          background: ruleColor,
          borderRadius: 1,
        }}
      />
      <span
        className={cn(
          'font-medium uppercase animate-today-label-breathe',
          subtle ? 'text-[9px]' : 'text-[10px]',
        )}
        style={{ color: labelColor, lineHeight: 1 }}
      >
        {label}
      </span>
    </div>
  );
}


/**
 * Quiet vertical "spine" running the full height of the timeline canvas.
 * Acts as a visual thread the eye follows through the day. Soft-faded at
 * top and bottom so it doesn't terminate harshly.
 */
export function TimelineSpine({
  isDarkMode,
  totalHeight,
}: {
  isDarkMode: boolean;
  totalHeight: number;
}) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute top-0 z-0"
      style={{
        left: SPINE_X_PX,
        width: 1,
        height: totalHeight,
        background: isDarkMode ? 'hsl(0 0% 100% / 0.10)' : 'hsl(220 10% 70% / 0.42)',
        WebkitMaskImage: 'linear-gradient(to bottom, transparent 0, #000 24px, #000 calc(100% - 24px), transparent 100%)',
        maskImage: 'linear-gradient(to bottom, transparent 0, #000 24px, #000 calc(100% - 24px), transparent 100%)',
      }}
    />
  );
}

/**
 * Tiny horizontal branch from the spine to a block's left edge, with a colored
 * node dot anchored on the spine at the block's start time. Renders once per
 * block (caller filters to col === 0 to avoid tangled crossings).
 */
export function TimelineSpineBranch({
  top,
  blockLeftPx,
  accentColor,
  isDarkMode,
}: {
  top: number;
  /** Distance from the content column's left edge to the block's left edge, in px. */
  blockLeftPx: number;
  /** Accent color (already mixed). Used for the node dot only — the line stays neutral. */
  accentColor: string;
  isDarkMode: boolean;
}) {
  const lineColor = isDarkMode ? 'hsl(0 0% 100% / 0.10)' : 'hsl(220 10% 70% / 0.42)';
  // Center the dot on the spine; nudge the branch line down to align with the
  // block's first line of text (≈10px below the block's top in compact layout).
  const branchY = top + 10;
  const branchStart = SPINE_X_PX + 1; // start just to the right of the spine
  const branchWidth = Math.max(0, blockLeftPx - branchStart - 4); // stop 4px before the block
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute z-[1]"
        style={{
          left: branchStart,
          top: branchY,
          width: branchWidth,
          height: 1,
          background: lineColor,
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute z-[2] rounded-full"
        style={{
          left: SPINE_X_PX - 3,
          top: branchY - 3,
          width: 7,
          height: 7,
          backgroundColor: accentColor,
          opacity: 0.78,
          boxShadow: isDarkMode
            ? '0 0 0 1.5px hsl(240 5% 6%)'
            : '0 0 0 1.5px #f9fafc',
        }}
      />
    </>
  );
}

export function hourLabel(h: number): string {
  const normalizedHour = ((h % 24) + 24) % 24;
  return `${String(normalizedHour).padStart(2, '0')}:00`;
}

export function fmtTime(totalMin: number): string {
  const normalized = ((totalMin % 1440) + 1440) % 1440;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function localMinuteToISOString(dayStr: string, totalMin: number): string {
  const base = new Date(`${dayStr}T00:00:00`);
  base.setMinutes(totalMin, 0, 0);
  return base.toISOString();
}

export function snapMinute(totalMin: number, step = DRAG_SNAP_MIN): number {
  return Math.round(totalMin / step) * step;
}

export function getSmartDuration(title: string, tags?: string[]): number {
  const tag = tags?.[0] || autoClassifyTag(title) || '';
  if (['admin', 'finance', 'shopping', 'travel'].includes(tag)) return 15;
  if (['life'].includes(tag)) return 20;
  if (['social'].includes(tag)) return 30;
  if (['event'].includes(tag)) return 60;
  if (['health'].includes(tag)) return 45;
  if (['study', 'work'].includes(tag)) return 60;
  return 30;
}

export interface TimeBlock {
  id: string;
  title: string;
  startMin: number;
  endMin: number;
  type: 'plan';
  emoji?: string;
  source: 'todo' | 'moment' | 'imported';
  isCompleted?: boolean;
  tags?: string[];
  photos?: string[];
  progress?: number;
  timerActiveStartMin?: number; // minute when timer was actually started (for fill calculation)
  // Plan vs Actual tracking
  planStartMin?: number;
  planEndMin?: number;
  actualStartMin?: number; // set when pomodoro was actually started
  actualEndMin?: number; // set when pomodoro ended
  hasActual?: boolean; // whether actual execution has started
  sessionGroupKey?: string;
  /** Step work-sessions rendered as side-by-side sub-segments inside this block. */
  stepSegments?: import('@/lib/stepTimelineSegments').PositionedStepSegment[];
  /** This block's session crosses midnight and continues on the next day. */
  continuesNextDay?: boolean;
  /** This block is the early-morning tail of a session that started yesterday. */
  continuedFromPrevDay?: boolean;
  /** Read-only (e.g. a previous-day tail) — no drag / resize / edit. */
  readOnly?: boolean;
}

/** Resolve the owning todo id from a timeline block id (`tail-…`, `plan-…`, or raw). */
export function todoIdFromBlockId(blockId: string): string {
  let id = blockId;
  if (id.startsWith('tail-')) id = id.slice(5);
  if (id.startsWith('plan-')) id = id.slice(5);
  return id;
}

/* Tag color palette — fixed category colors for clear differentiation */
const FALLBACK_TAG_COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--accent))',
  'hsl(var(--chip-foreground))',
  'hsl(var(--destructive))',
  'hsl(var(--foreground) / 0.7)',
];

export function getTagColor(tags?: string[], title?: string): string | undefined {
  // Try stored tag first
  if (tags && tags.length > 0) {
    const tag = tags[0].toLowerCase();
    if (TAG_CATEGORY_COLORS[tag]) return TAG_CATEGORY_COLORS[tag];
    const hash = tag.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    return FALLBACK_TAG_COLORS[hash % FALLBACK_TAG_COLORS.length];
  }
  // Auto-classify by title
  if (title) {
    const autoTag = autoClassifyTag(title);
    if (autoTag && TAG_CATEGORY_COLORS[autoTag]) return TAG_CATEGORY_COLORS[autoTag];
  }
  return undefined;
}

/* ── Theme-aware tag color adjustment ──
   Tag hexes were tuned for a light canvas. In dark mode we color-mix them into
   near-black / card surfaces for task bodies; mid-saturation mid-L hexes read as
   muddy. Lift lightness and cap saturation so every category reads as a soft
   tint (same hue, calmer), and keep strokes/borders from screaming. */

function hexToHSL(hex: string): { h: number; s: number; l: number } | null {
  if (!hex.startsWith('#') || hex.length !== 7) return null;
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}

function hslToHex(h: number, s: number, l: number): string {
  const sN = s / 100;
  const lN = l / 100;
  const c = (1 - Math.abs(2 * lN - 1)) * sN;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lN - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }
  const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function softenTagForTimeline(color: string | undefined, isDarkMode: boolean): string | undefined {
  if (!color) return color;
  const hsl = hexToHSL(color);
  if (!hsl) return color;
  if (isDarkMode) {
    const newS = Math.min(34, Math.max(20, hsl.s * 0.28 + 8));
    const newL = Math.min(70, Math.max(56, hsl.l + 12));
    return hslToHex(hsl.h, newS, newL);
  }
  // Light timeline wants colored paper, not fluorescent highlighter ink.
  const newS = Math.min(28, Math.max(14, hsl.s * 0.22 + 6));
  const newL = Math.min(76, Math.max(66, hsl.l + 16));
  return hslToHex(hsl.h, newS, newL);
}

export function deepenWarmTimelineColor(color: string | undefined): string | undefined {
  if (!color) return color;
  const hsl = hexToHSL(color);
  if (!hsl) return color;
  const isWarmYellow = hsl.h >= 32 && hsl.h <= 58;
  if (!isWarmYellow) return color;
  return hslToHex(
    hsl.h,
    Math.min(72, Math.max(hsl.s + 8, 46)),
    Math.max(42, hsl.l - 7)
  );
}

export function adjustTagForDarkMode(color: string | undefined): string | undefined {
  if (!color) return color;
  // Only adjust hex strings; CSS-var hsl() colors already adapt via the theme.
  const hsl = hexToHSL(color);
  if (!hsl) return color;
  /** Dark timeline blocks need hue identity, but not saturated glowing stickers. */
  const newS = Math.min(42, Math.max(24, hsl.s * 0.34 + 10));
  const liftL =
    hsl.l < 48 ? Math.min(70, hsl.l + 22) : hsl.l < 62 ? Math.min(72, hsl.l + 12) : Math.min(74, hsl.l + 4);
  const newL = Math.max(56, liftL);
  return hslToHex(hsl.h, newS, newL);
}

// Dark blocks read "muddy" because the accent reaching the fill has already been
// desaturated to a pale pastel (adjustTagForDarkMode caps S≈42, L≥56). Mixing
// that into near-black at 10–27% yields grey-brown sludge. For the FILL/BORDER
// we re-introduce clean chroma and drop lightness to a mid tone, so the colour
// mix lands as a legible coloured card with real hue identity — not flat black.
export function vividDarkAccent(color: string | undefined): string {
  if (!color) return color ?? '#888888';
  const hsl = hexToHSL(color);
  if (!hsl) return color; // CSS-var hsl() colours adapt via the theme already
  const newS = Math.min(82, Math.max(hsl.s, 54));
  const newL = Math.min(62, Math.max(46, hsl.l - 2));
  return hslToHex(hsl.h, newS, newL);
}

// Google-Calendar-style solid event color: a saturated mid-dark tone the white
// title can sit on. Used as a FLAT fill (no canvas mixing) so dark blocks read
// as real coloured cards instead of frosted near-black panels.
export function solidEventColor(color: string | undefined): string | null {
  if (!color) return null;
  const hsl = hexToHSL(color);
  if (!hsl) return null; // CSS-var colours handled by caller fallback
  // Restrained, editorial fills: user asked repeatedly for lower saturation.
  const newS = Math.min(30, Math.max(hsl.s, 12));
  const newL = Math.min(42, Math.max(36, hsl.l > 60 ? hsl.l - 20 : hsl.l));
  return hslToHex(hsl.h, newS, newL);
}

// Resolve a CSS-var accent (hsl(var(--primary)) / hsl(var(--accent))) to the
// concrete dark-theme hex so it can take the solid-event-colour path too.
function resolveAccentToHex(accent: string): string {
  if (/^#[0-9A-Fa-f]{6}$/.test(accent)) return accent;
  // Dark-theme CSS-var accents used as activity fallbacks → concrete hex so they
  // can take the solid-event-colour path instead of falling to the grey mix.
  if (accent.includes('--primary')) return hslToHex(18, 45, 57);
  if (accent.includes('--accent')) return hslToHex(120, 22, 50);
  if (accent.includes('--chip-foreground')) return hslToHex(216, 38, 72);
  if (accent.includes('--destructive')) return hslToHex(10, 52, 53);
  if (accent.includes('--foreground')) return hslToHex(0, 0, 70);
  // hsl(h s% l%) / hsl(h, s%, l%) literal → hex so it can take the solid path.
  const m = accent.match(/hsl\(\s*([\d.]+)[\s,]+([\d.]+)%[\s,]+([\d.]+)%/i);
  if (m) return hslToHex(Number(m[1]), Number(m[2]), Number(m[3]));
  return accent;
}

export function timelineFillGradient(
  isDarkMode: boolean,
  canvasCss: string,
  accentCss: string,
  top: number,
  mid: number,
  bot: number,
  variant: 'default' | 'darkTint',
): string {
  const scale = isDarkMode ? 1 : 1.08;
  const topMix = Math.max(0, Math.min(isDarkMode ? 0.11 : 0.28, top * scale));
  const midMix = Math.max(0, Math.min(isDarkMode ? 0.1 : 0.21, mid * scale));
  const botMix = Math.max(0, Math.min(isDarkMode ? 0.09 : 0.16, bot * scale));

  // Keep a visible colored body. The accent is already mixed into the canvas,
  // so this should read as a filled time block, not just a faint outline.
  // On dark, re-chroma the (pre-desaturated) accent so the fill reads as a clean
  // coloured card instead of muddy near-black.
  const fillAccent = isDarkMode ? vividDarkAccent(accentCss) : accentCss;
  return solidFillGradient(canvasCss, fillAccent, topMix, midMix, botMix, variant);
}

export function timelineBlockShell(
  isDarkMode: boolean,
  canvasCss: string,
  accentCss: string,
  intensity: 'plan' | 'actual' | 'active' | 'done' | 'ghost',
): { background: string; border: string; shadow: string } {
  const mixes = {
    plan: isDarkMode ? [0.09, 0.09, 0.09] : [0.27, 0.205, 0.16],
    actual: isDarkMode ? [0.1, 0.1, 0.1] : [0.3, 0.225, 0.17],
    active: isDarkMode ? [0.12, 0.12, 0.12] : [0.34, 0.255, 0.19],
    done: isDarkMode ? [0.07, 0.07, 0.07] : [0.19, 0.145, 0.11],
    ghost: isDarkMode ? [0.05, 0.05, 0.05] : [0.12, 0.09, 0.07],
  }[intensity];
  const borderMix = isDarkMode
    ? intensity === 'active' ? 0.55 : intensity === 'plan' ? 0.45 : intensity === 'actual' ? 0.5 : 0.38
    : intensity === 'active' ? 0.3 : intensity === 'plan' ? 0.24 : 0.26;
  // Google-Calendar style in dark: a FLAT saturated solid colour the white title
  // sits on — not a frosted accent-into-black wash.
  const solidSource = resolveAccentToHex(accentCss);
  const solid = isDarkMode ? solidEventColor(solidSource) : null;
  if (solid) {
    // Slightly dim 'plan'/'done'/'ghost' so future/finished blocks read quieter.
    const dim = { plan: 0.96, actual: 1, active: 1.06, done: 0.92, ghost: 0.8 }[intensity];
    const solidHsl = hexToHSL(solid)!;
    const fillL = Math.max(20, Math.min(52, solidHsl.l * dim));
    const fill = hslToHex(solidHsl.h, solidHsl.s, fillL);
    // Quiet edge: a bright ring around every block added visual noise.
    const borderCol = hslToHex(solidHsl.h, solidHsl.s, Math.min(56, fillL + 6));
    return {
      background: `linear-gradient(180deg, ${fill} 0%, ${fill} 100%)`,
      border: borderCol,
      shadow: `inset 0 0 0 1px ${borderCol}, 0 8px 18px rgba(0,0,0,0.18)`,
    };
  }
  const background = timelineFillGradient(isDarkMode, canvasCss, accentCss, mixes[0], mixes[1], mixes[2], isDarkMode ? 'darkTint' : 'default');
  const borderAccent = isDarkMode ? vividDarkAccent(accentCss) : accentCss;
  // Match the timer-pill look the user likes: a clear coloured ring (≈45% accent)
  // rather than a muddy near-invisible edge. The hue does the talking.
  const border = `color-mix(in srgb, ${canvasCss} ${100 - Math.round(borderMix * 100)}%, ${borderAccent} ${Math.round(borderMix * 100)}%)`;
  const shadow = isDarkMode
    ? `inset 0 0 0 1px ${border}, 0 8px 18px rgba(0,0,0,0.12)`
    : `inset 0 0 0 1px ${border}, 0 8px 20px rgba(24, 24, 27, 0.03)`;
  return { background, border, shadow };
}

export function getTagIcon(tags?: string[], title?: string): string | undefined {
  const tag = tags?.[0] || (title ? autoClassifyTag(title) : undefined);
  if (tag && TAG_CATEGORY_ICONS[tag]) return TAG_CATEGORY_ICONS[tag];
  return undefined;
}

/* Column assignment for overlapping blocks */
export function assignColumns(blocks: TimeBlock[]) {
  const COLLISION_BUFFER_MIN = 2;
  // Blocks shorter than roughly one visual row are still rendered with a
  // readable minimum height. Reserve the same footprint in the column packer
  // so back-to-back 1–10 minute entries sit side-by-side instead of painting
  // their labels on top of each other.
  const MIN_READABLE_SPAN_MIN = 20;
  type Segment = { start: number; end: number };
  const getSegments = (block: TimeBlock): Segment[] => {
    const segments: Segment[] = [];

    if (block.planStartMin != null && block.planEndMin != null) {
      segments.push({ start: block.planStartMin, end: Math.max(block.planEndMin, block.planStartMin + MIN_READABLE_SPAN_MIN) });
    }

    if (block.actualStartMin != null && block.actualEndMin != null) {
      segments.push({ start: block.actualStartMin, end: Math.max(block.actualEndMin, block.actualStartMin + MIN_READABLE_SPAN_MIN) });
    }

    if (segments.length === 0) {
      segments.push({ start: block.startMin, end: Math.max(block.endMin, block.startMin + MIN_READABLE_SPAN_MIN) });
    }

    segments.sort((a, b) => a.start - b.start || a.end - b.end);

    const merged: Segment[] = [];
    segments.forEach(segment => {
      const prev = merged[merged.length - 1];
      if (!prev || segment.start > prev.end + COLLISION_BUFFER_MIN) {
        merged.push({ ...segment });
        return;
      }
      prev.end = Math.max(prev.end, segment.end);
    });

    return merged;
  };

  const overlaps = (a: Segment[], b: Segment[]) => {
    for (const segA of a) {
      for (const segB of b) {
        if (
          segA.start < segB.end + COLLISION_BUFFER_MIN &&
          segA.end > segB.start - COLLISION_BUFFER_MIN
        ) {
          return true;
        }
      }
    }
    return false;
  };

  // Every block — including prev-day carryover tails — flows through the same
  // column packer so that events overlapping in TIME render side-by-side (并排),
  // never stacked one-right-under-another. Overlapping tails therefore split
  // into parallel columns exactly like live tasks do, with a "+N" badge folding
  // any beyond MAX_VISIBLE_COLS.
  const sorted = [...blocks].sort((a, b) => {
    const aFirst = getSegments(a)[0];
    const bFirst = getSegments(b)[0];
    return aFirst.start - bFirst.start
      || (bFirst.end - bFirst.start) - (aFirst.end - aFirst.start)
      || a.id.localeCompare(b.id);
  });
  const n = sorted.length;
  if (n === 0) return [];

  const segmentsByIndex = sorted.map(getSegments);
  const colAssign = new Array(n).fill(-1);
  for (let i = 0; i < n; i++) {
    const usedCols = new Set<number>();
    for (let j = 0; j < i; j++) {
      if (overlaps(segmentsByIndex[i], segmentsByIndex[j])) {
        usedCols.add(colAssign[j]);
      }
    }

    let bestCol = 0;
    while (usedCols.has(bestCol)) bestCol += 1;
    colAssign[i] = bestCol;
  }

  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x: number): number => parent[x] === x ? x : (parent[x] = find(parent[x]));
  const union = (a: number, b: number) => { parent[find(a)] = find(b); };
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (overlaps(segmentsByIndex[i], segmentsByIndex[j])) union(i, j);
    }
  }

  const groupCols = new Map<number, Set<number>>();
  for (let i = 0; i < n; i++) {
    const g = find(i);
    if (!groupCols.has(g)) groupCols.set(g, new Set());
    groupCols.get(g)!.add(colAssign[i]);
  }
  const groupColMap = new Map<number, Map<number, number>>();
  for (const [g, colSet] of groupCols) {
    const sc = [...colSet].sort((a, b) => a - b);
    const mapping = new Map<number, number>();
    sc.forEach((c, idx) => mapping.set(c, idx));
    groupColMap.set(g, mapping);
  }

  return sorted.map((block, i) => {
    const g = find(i);
    const mapping = groupColMap.get(g)!;
    const remappedCol = mapping.get(colAssign[i])!;
    const totalCols = mapping.size;
    const visibleCols = Math.min(totalCols, MAX_VISIBLE_COLS);
    let hiddenSiblingIds: string[] = [];
    if (totalCols > MAX_VISIBLE_COLS && remappedCol === MAX_VISIBLE_COLS - 1) {
      hiddenSiblingIds = sorted
        .map((b, j) => ({ id: b.id, col: mapping.get(colAssign[j])!, group: find(j) }))
        .filter(x => x.group === g && x.col >= MAX_VISIBLE_COLS)
        .map(x => x.id);
    }
    return { block, col: remappedCol, totalCols, visibleCols, hiddenSiblingIds, tailRowIndex: 0 };
  });
}

export type SlotKey = string;
export function slotKey(h: number, half: 0 | 30): SlotKey { return `${h}:${half}`; }
export function slotToMin(key: SlotKey): { start: number; end: number } {
  const [h, m] = key.split(':').map(Number);
  return { start: h * 60 + m, end: h * 60 + m + 30 };
}
