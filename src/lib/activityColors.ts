import { autoClassifyTag, TAG_CATEGORY_COLORS, TAG_CATEGORY_ICONS } from '@/lib/autoTag';
import type { CSSProperties } from 'react';

const FALLBACK_TAG_COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--accent))',
  'hsl(var(--chip-foreground))',
  'hsl(var(--destructive))',
  'hsl(var(--foreground) / 0.7)',
];

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

function adjustForDarkMode(color: string | undefined): string | undefined {
  if (!color) return color;
  const hsl = hexToHSL(color);
  if (!hsl) return color;
  const newS = Math.min(42, Math.max(24, hsl.s * 0.34 + 10));
  const liftL =
    hsl.l < 48 ? Math.min(70, hsl.l + 22) : hsl.l < 62 ? Math.min(72, hsl.l + 12) : Math.min(74, hsl.l + 4);
  return hslToHex(hsl.h, newS, Math.max(56, liftL));
}

function deepenWarmLightColor(color: string | undefined): string | undefined {
  if (!color) return color;
  const hsl = hexToHSL(color);
  if (!hsl) return color;
  const isWarmYellow = hsl.h >= 32 && hsl.h <= 58;
  if (!isWarmYellow) return color;
  return hslToHex(hsl.h, Math.min(72, Math.max(hsl.s + 8, 46)), Math.max(42, hsl.l - 7));
}

export function resolveRawActivityColor(title?: string, tags?: string[], fallback?: string): string | undefined {
  // Skip bookkeeping tags so focus-session moments don't hash to a random hue.
  const meaningful = tags?.filter(
    (t) => t !== 'focus-session' && t !== 'step-session' && !t.startsWith('todo-session:'),
  );
  const tag = meaningful?.[0]?.toLowerCase() || (title ? autoClassifyTag(title) : undefined);
  if (tag && TAG_CATEGORY_COLORS[tag]) return TAG_CATEGORY_COLORS[tag];
  if (tag) {
    const hash = tag.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
    return FALLBACK_TAG_COLORS[hash % FALLBACK_TAG_COLORS.length];
  }
  return fallback;
}

export function getActivityAccentColor({
  title,
  tags,
  fallback,
  isDarkMode,
}: {
  title?: string;
  tags?: string[];
  fallback?: string;
  isDarkMode: boolean;
}): string | undefined {
  const raw = resolveRawActivityColor(title, tags, fallback);
  return isDarkMode ? adjustForDarkMode(raw) : deepenWarmLightColor(raw);
}

export function getActivityTagIcon(title?: string, tags?: string[]): string | undefined {
  const tag = tags?.[0]?.toLowerCase() || (title ? autoClassifyTag(title) : undefined);
  return tag ? TAG_CATEGORY_ICONS[tag] : undefined;
}

function colorMix(base: string, basePct: number, accent: string): string {
  return `color-mix(in srgb, ${base} ${basePct}%, ${accent} ${100 - basePct}%)`;
}

export function getCalendarBlockChrome(accent: string, isDarkMode: boolean): CSSProperties {
  const canvas = isDarkMode ? 'hsl(var(--card))' : '#f9fafc';
  const borderBase = isDarkMode ? 'hsl(var(--border))' : '#ffffff';
  const topBasePct = isDarkMode ? 83 : 72;
  const bottomBasePct = isDarkMode ? 90 : 84;
  const borderBasePct = isDarkMode ? 76 : 74;
  return {
    background: `linear-gradient(180deg, ${colorMix(canvas, topBasePct, accent)} 0%, ${colorMix(canvas, bottomBasePct, accent)} 58%, ${colorMix(canvas, bottomBasePct, accent)} 100%)`,
    border: `1px solid ${colorMix(borderBase, borderBasePct, accent)}`,
    boxShadow: isDarkMode
      ? `inset 0 1px 0 hsl(var(--foreground) / 0.04), 0 8px 18px rgba(0,0,0,0.16)`
      : `inset 0 1px 0 ${colorMix('#ffffff', 74, accent)}, 0 8px 20px rgba(24,24,27,0.03)`,
  };
}

export function getCalendarMonthBarStyle(accent: string, isDarkMode: boolean): CSSProperties {
  const canvas = isDarkMode ? 'hsl(var(--card))' : '#f9fafc';
  return {
    background: colorMix(canvas, isDarkMode ? 84 : 72, accent),
    border: `1px solid ${colorMix(isDarkMode ? 'hsl(var(--border))' : '#ffffff', isDarkMode ? 76 : 74, accent)}`,
  };
}

export function getActivityTextColor(accent: string, isDarkMode: boolean, strength: 'strong' | 'soft' = 'strong'): string {
  const foregroundPct = strength === 'strong' ? (isDarkMode ? 38 : 28) : (isDarkMode ? 54 : 45);
  return `color-mix(in srgb, ${accent} ${100 - foregroundPct}%, hsl(var(--foreground)) ${foregroundPct}%)`;
}
