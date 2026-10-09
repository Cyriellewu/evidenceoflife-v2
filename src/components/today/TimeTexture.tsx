import { useMemo, useRef, useState, useId, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  PLAN_TIMELINE_WAKE_TOTAL_MIN,
  PLAN_TIMELINE_BED_TOTAL_MIN,
} from '@/lib/planTimelineDayBounds';
import type { PlanTimelineRhythmPalette } from '@/lib/planTimelineRhythmPresets';
import { TAG_CATEGORY_COLORS } from '@/lib/autoTag';
import { partitionUnionMinutesByTag, unionMinutesInWindow } from '@/lib/dayMinuteIntervals';
import { useLanguage } from '@/hooks/useLanguage';
import { cn } from '@/lib/utils';

/** Hex tag color fallback when tag is unknown */
function resolveTagStrokeFill(tag: string): string {
  const key = tag.trim().toLowerCase();
  if (key && key !== '—' && TAG_CATEGORY_COLORS[key]) return TAG_CATEGORY_COLORS[key];
  return '#8E8E93';
}

/**
 * Plan-time slots (wall-clock minutes 0–1440). `tag` groups actual time for stacked bars.
 */
export interface TextureSlot {
  startMin: number;
  endMin: number;
  tag: string;
  /** Task / moment title for hover details */
  label?: string;
  /** Stable id for tooltip dedupe (e.g. `todo:<id>:timer`) */
  slotKey?: string;
}

interface ExecutionRhythmChartProps {
  plannedSlots: TextureSlot[];
  actualSlots: TextureSlot[];
  /** Inclusive day window (defaults to plan timeline wake → bed) */
  rangeStartMin?: number;
  rangeEndMin?: number;
  nowMin?: number;
  isDarkMode?: boolean;
  height?: number;
  /** Microcopy when not hovering */
  legendHint?: string;
  /** Planned / focused bar fills — from Plan timeline rhythm preset */
  rhythmPalette?: PlanTimelineRhythmPalette;
  /** Bucket hover detail (minutes in the 30m window) */
  formatHoverDetail?: (plannedRounded: number, focusedRounded: number) => string;
}

const BUCKET_AGG_MIN = 30;
const MAX_TOOLTIP_TASKS = 6;
const TOOLTIP_W = 272;
const TOOLTIP_MAX_H = 220;

const VW = 600;

export type ExecutionBucketTaskHint = { hintKey: string; label: string; tag: string; minutes: number };

function overlapMinutesInBucket(startMin: number, endMin: number, b0: number, b1: number): number {
  const a = Math.max(startMin, b0);
  const b = Math.min(endMin, b1);
  return Math.max(0, b - a);
}

function collectBucketTaskHints(slots: TextureSlot[], b0: number, b1: number): ExecutionBucketTaskHint[] {
  const byKey = new Map<string, ExecutionBucketTaskHint>();
  for (const s of slots) {
    const minutes = overlapMinutesInBucket(s.startMin, s.endMin, b0, b1);
    if (minutes < 0.2) continue;
    const key = s.slotKey ?? `${s.startMin}-${s.endMin}-${s.tag}`;
    const raw = s.label?.trim();
    const label = raw && raw.length > 0 ? raw : s.tag;
    const tag = (s.tag || '—').trim().toLowerCase() || '—';
    const prev = byKey.get(key);
    if (prev) prev.minutes += minutes;
    else byKey.set(key, { hintKey: key, label, tag, minutes });
  }
  return [...byKey.values()].sort((a, b) => b.minutes - a.minutes || a.label.localeCompare(b.label));
}

function clampTooltipPosition(cx: number, cy: number): { left: number; top: number } {
  if (typeof window === 'undefined') return { left: cx + 12, top: cy + 12 };
  const pad = 10;
  let left = cx + 14;
  let top = cy + 14;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (left + TOOLTIP_W > vw - pad) left = Math.max(pad, vw - pad - TOOLTIP_W);
  if (top + TOOLTIP_MAX_H > vh - pad) top = Math.max(pad, cy - TOOLTIP_MAX_H - 8);
  left = Math.max(pad, left);
  top = Math.max(pad, top);
  return { left, top };
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/** Discrete Gaussian smoothing — mellows EXECUTION silhouette toward a softer bell-ish envelope without inventing phantom activity */
function smoothBucketSeries(values: number[], sigmaBuckets = 1.35): number[] {
  const n = values.length;
  if (n === 0) return [];
  const radius = Math.min(8, Math.max(1, Math.ceil(sigmaBuckets * 2.8)));
  const kern: number[] = [];
  let ks = 0;
  for (let k = -radius; k <= radius; k++) {
    const w = Math.exp(-(k * k) / (2 * sigmaBuckets * sigmaBuckets));
    kern.push(w);
    ks += w;
  }
  for (let i = 0; i < kern.length; i++) kern[i] /= ks;
  return values.map((_, i) => {
    let acc = 0;
    for (let k = -radius; k <= radius; k++) {
      const j = Math.max(0, Math.min(n - 1, i + k));
      acc += values[j] * kern[k + radius];
    }
    return acc;
  });
}

function bucketFractions(
  planned: TextureSlot[],
  actual: TextureSlot[],
  rangeStart: number,
  rangeEnd: number,
): {
  n: number;
  planned: number[];
  actual: number[];
  start: number;
  actualSegments: { tag: string; minutes: number }[][];
  plannedBucketHints: ExecutionBucketTaskHint[][];
  actualBucketHints: ExecutionBucketTaskHint[][];
} {
  const span = rangeEnd - rangeStart;
  const n = Math.max(1, Math.ceil(span / BUCKET_AGG_MIN));
  const pf: number[] = new Array(n).fill(0);
  const af: number[] = new Array(n).fill(0);
  const actualSegments: { tag: string; minutes: number }[][] = [];
  const plannedBucketHints: ExecutionBucketTaskHint[][] = [];
  const actualBucketHints: ExecutionBucketTaskHint[][] = [];
  for (let i = 0; i < n; i++) {
    const b0 = rangeStart + i * BUCKET_AGG_MIN;
    const b1 = Math.min(rangeEnd, b0 + BUCKET_AGG_MIN);
    const ps = unionMinutesInWindow(planned, b0, b1);
    const as = unionMinutesInWindow(actual, b0, b1);
    pf[i] = Math.min(1, ps / BUCKET_AGG_MIN);
    af[i] = Math.min(1, as / BUCKET_AGG_MIN);
    actualSegments.push(partitionUnionMinutesByTag(actual, b0, b1));
    plannedBucketHints.push(collectBucketTaskHints(planned, b0, b1));
    actualBucketHints.push(collectBucketTaskHints(actual, b0, b1));
  }
  return {
    n,
    planned: pf,
    actual: af,
    start: rangeStart,
    actualSegments,
    plannedBucketHints,
    actualBucketHints,
  };
}

function fmtTime(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = Math.max(0, Math.min(59, mins % 60));
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Dual-layer execution chart: muted planned vs focused time.
 * Focused bars stack by category tag when multiple spans fall in the same bucket (like the older EnergyCurve).
 */
export function TimeTexture({
  plannedSlots,
  actualSlots,
  rangeStartMin = PLAN_TIMELINE_WAKE_TOTAL_MIN,
  rangeEndMin = PLAN_TIMELINE_BED_TOTAL_MIN,
  nowMin,
  isDarkMode = false,
  height = 86,
  legendHint = 'planned · focused',
  formatHoverDetail = (p, a) => `${Math.round(p)}m planned · ${Math.round(a)}m focused`,
  rhythmPalette,
}: ExecutionRhythmChartProps) {
  const { t, lang } = useLanguage();
  const data = useMemo(() => {
    const all = [...plannedSlots, ...actualSlots];
    if (!all.length) return null;
    return bucketFractions(plannedSlots, actualSlots, rangeStartMin, rangeEndMin);
  }, [plannedSlots, actualSlots, rangeStartMin, rangeEndMin]);

  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const clipUid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const filterUid = `${clipUid}-now`;

  const plannedFill = rhythmPalette
    ? isDarkMode
      ? rhythmPalette.plannedDark
      : rhythmPalette.plannedLight
    : isDarkMode
      ? 'hsl(0 0% 96% / 0.11)'
      : 'rgba(60, 60, 67, 0.10)';
  const focusedFill = rhythmPalette
    ? isDarkMode
      ? rhythmPalette.focusedDark
      : rhythmPalette.focusedLight
    : isDarkMode
      ? 'hsl(var(--primary) / 0.52)'
      : 'hsl(var(--primary) / 0.50)';

  /** Two quiet reference ticks (not full hour rail) */
  const tickA = Math.min(
    rangeEndMin - 15,
    Math.max(rangeStartMin + 30, PLAN_TIMELINE_WAKE_TOTAL_MIN + 90),
  );
  const tickB = Math.min(rangeEndMin - 30, Math.max(tickA + 120, 19 * 60));

  if (!data) return null;

  const { n, planned: planFr, actual: actFr, start, actualSegments, plannedBucketHints, actualBucketHints } = data;
  const padTop = 8;
  const padBot = 4;
  const curveH = height - padTop - padBot;
  const baseY = padTop + curveH;
  const slotW = VW / n;
  const barW = Math.max(6, slotW * 0.62);
  const rx = Math.min(6, barW / 2 - 0.5);

  const planSm = smoothBucketSeries(planFr);
  const actSm = smoothBucketSeries(actFr);
  const planVis = planFr.map((v, i) => clamp01(v * 0.48 + planSm[i] * 0.52));
  const actVis = actFr.map((v, i) => clamp01(v * 0.48 + actSm[i] * 0.52));

  const peak = Math.max(0.06, ...planVis.map((p, i) => Math.max(p, actVis[i])));
  const nowIdx =
    nowMin != null && nowMin >= start && nowMin <= rangeEndMin
      ? Math.min(n - 1, Math.floor((nowMin - start) / BUCKET_AGG_MIN))
      : -1;
  const nowAnchorX =
    nowMin != null && nowMin >= start && nowMin <= rangeEndMin
      ? ((nowMin - start) / (rangeEndMin - start)) * VW
      : null;

  const barRects: { i: number; x: number; ph: number; ah: number; isFuture: boolean; isNow: boolean }[] = [];
  for (let i = 0; i < n; i++) {
    const isFuture = nowIdx >= 0 && i > nowIdx;
    const isNow = nowIdx >= 0 && i === nowIdx;
    const x = i * slotW + (slotW - barW) / 2;
    const ph = (planVis[i] / peak) * curveH;
    const ah = isFuture ? 0 : (actVis[i] / peak) * curveH;
    barRects.push({ i, x, ph, ah, isFuture, isNow });
  }

  const clipPathsHtml = barRects.map((b) => {
    if (b.ph < 1 && b.ah < 1) return null;
    const showAct = !b.isFuture && b.ah >= 1;
    if (!showAct) return null;
    const segs = actualSegments[b.i];
    const totalMin = segs.reduce((s, q) => s + q.minutes, 0);
    if (!segs.length || totalMin < 1e-6) return null;
    const hCol = Math.max(b.ah, 1);
    const clipId = `${clipUid}-act-${b.i}`;
    return (
      <clipPath key={clipId} id={clipId}>
        <rect x={b.x} y={baseY - hCol} width={barW} height={hCol} rx={rx} ry={rx} />
      </clipPath>
    );
  });

  const handleMove = (e: MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    setPointer({ x: e.clientX, y: e.clientY });
    const rect = svg.getBoundingClientRect();
    const xPx = e.clientX - rect.left;
    const xUv = (xPx / Math.max(1, rect.width)) * VW;
    const idx = Math.max(0, Math.min(n - 1, Math.floor(xUv / slotW)));
    setHoverIdx(idx);
  };

  const hover = hoverIdx != null ? barRects[hoverIdx] : null;
  const hTime = hoverIdx != null ? start + hoverIdx * BUCKET_AGG_MIN : null;
  const hoverFutureBucket = nowIdx >= 0 && hoverIdx !== null && hoverIdx > nowIdx;
  const plannedMinHover = hoverIdx != null ? planFr[hoverIdx] * BUCKET_AGG_MIN : 0;
  const actualMinHover = hoverIdx != null ? (hoverFutureBucket ? 0 : actFr[hoverIdx] * BUCKET_AGG_MIN) : 0;
  const plannedRows = hoverIdx != null ? plannedBucketHints[hoverIdx] : [];
  const actualRows = hoverIdx != null ? actualBucketHints[hoverIdx] : [];
  const plannedUnionMin = plannedMinHover;
  const actualUnionMin = actualMinHover;
  const plannedSumParts = plannedRows.reduce((s, r) => s + r.minutes, 0);
  const actualSumParts = actualRows.reduce((s, r) => s + r.minutes, 0);
  const showPlannedParallel =
    plannedRows.length > 1 && plannedSumParts > plannedUnionMin + 0.75;
  const showActualParallel =
    !hoverFutureBucket && actualRows.length > 1 && actualSumParts > actualUnionMin + 0.75;

  const fmtTaskMin = (m: number) => {
    const r = Math.max(0, Math.round(m));
    return lang === 'zh' ? `${r}分钟` : `${r}m`;
  };

  const tickX = (m: number) => ((m - start) / (rangeEndMin - start)) * VW;

  const actualRowsForTip =
    !hoverFutureBucket && actualRows.length > 0 && actualUnionMin >= 0.25 ? actualRows : [];

  const tooltipPos = pointer ? clampTooltipPosition(pointer.x, pointer.y) : null;
  const showTooltipEmpty =
    hoverIdx != null &&
    plannedRows.length === 0 &&
    actualRowsForTip.length === 0;
  const tooltipNode =
    hoverIdx != null &&
    pointer &&
    tooltipPos &&
    hTime != null &&
    typeof document !== 'undefined' &&
    createPortal(
      <div
        role="tooltip"
        className={cn(
          'fixed z-[240] pointer-events-none w-[272px] max-w-[min(272px,calc(100vw-20px))]',
          'rounded-xl border border-border/55 bg-popover/95 px-3 py-2.5 shadow-lg backdrop-blur-md',
          'text-[11px] leading-snug text-foreground',
        )}
        style={{ left: tooltipPos.left, top: tooltipPos.top }}
      >
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 border-b border-border/30 pb-1.5">
          <span className="tabular-nums text-[10px] text-muted-foreground">
            {fmtTime(hTime)}–{fmtTime(Math.min(hTime + BUCKET_AGG_MIN, rangeEndMin))}
          </span>
          <span className="text-[10px] text-muted-foreground tabular-nums">{formatHoverDetail(plannedUnionMin, actualUnionMin)}</span>
        </div>
        {plannedRows.length > 0 && (
          <div className="mb-2">
            <p className="mb-1 text-[9px] font-medium uppercase tracking-[0.12em] text-muted-foreground/70">{t('drift.execPlanned')}</p>
            {showPlannedParallel && (
              <p className="mb-1 text-[9px] text-muted-foreground/75">{t('drift.execParallel')}</p>
            )}
            <ul className="space-y-0.5">
              {plannedRows.slice(0, MAX_TOOLTIP_TASKS).map((row) => (
                <li key={`p-${row.hintKey}`} className="flex gap-2">
                  <span
                    className="mt-[5px] h-1.5 w-1.5 flex-shrink-0 rounded-full"
                    style={{ backgroundColor: resolveTagStrokeFill(row.tag) }}
                  />
                  <span className="min-w-0 flex-1 break-words text-foreground/90">
                    <span className="line-clamp-2">{row.label}</span>{' '}
                    <span className="tabular-nums text-muted-foreground">· {fmtTaskMin(row.minutes)}</span>
                  </span>
                </li>
              ))}
            </ul>
            {plannedRows.length > MAX_TOOLTIP_TASKS && (
              <p className="mt-1 text-[9px] text-muted-foreground/65">
                {lang === 'zh' ? `还有 ${plannedRows.length - MAX_TOOLTIP_TASKS} 项…` : `${plannedRows.length - MAX_TOOLTIP_TASKS} more…`}
              </p>
            )}
          </div>
        )}
        {!hoverFutureBucket && actualRowsForTip.length > 0 && (
          <div>
            <p className="mb-1 text-[9px] font-medium uppercase tracking-[0.12em] text-muted-foreground/70">{t('drift.execFocused')}</p>
            {showActualParallel && (
              <p className="mb-1 text-[9px] text-muted-foreground/75">{t('drift.execParallel')}</p>
            )}
            <ul className="space-y-0.5">
              {actualRowsForTip.slice(0, MAX_TOOLTIP_TASKS).map((row) => (
                <li key={`a-${row.hintKey}`} className="flex gap-2">
                  <span
                    className="mt-[5px] h-1.5 w-1.5 flex-shrink-0 rounded-full"
                    style={{ backgroundColor: resolveTagStrokeFill(row.tag) }}
                  />
                  <span className="min-w-0 flex-1 break-words text-foreground/90">
                    <span className="line-clamp-2">{row.label}</span>{' '}
                    <span className="tabular-nums text-muted-foreground">· {fmtTaskMin(row.minutes)}</span>
                  </span>
                </li>
              ))}
            </ul>
            {actualRowsForTip.length > MAX_TOOLTIP_TASKS && (
              <p className="mt-1 text-[9px] text-muted-foreground/65">
                {lang === 'zh' ? `还有 ${actualRowsForTip.length - MAX_TOOLTIP_TASKS} 项…` : `${actualRowsForTip.length - MAX_TOOLTIP_TASKS} more…`}
              </p>
            )}
          </div>
        )}
        {showTooltipEmpty && (
          <p className="text-[9px] text-muted-foreground/65">{t('drift.execSliceEmpty')}</p>
        )}
      </div>,
      document.body,
    );

  return (
    <div className="w-full select-none text-muted-foreground">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VW} ${height}`}
        width="100%"
        preserveAspectRatio="none"
        className="block overflow-visible text-muted-foreground/40"
        style={{ height, display: 'block' }}
        onMouseMove={handleMove}
        onMouseLeave={() => {
          setHoverIdx(null);
          setPointer(null);
        }}
      >
        <defs>
          <filter id={filterUid} x="-200%" y="-200%" width="500%" height="500%">
            <feDropShadow dx="0" dy="0" stdDeviation="1.8" floodColor="hsl(var(--primary))" floodOpacity="0.28" />
          </filter>
          {clipPathsHtml}
        </defs>

        {barRects.map((b) => {
          const planH = b.ph;
          const actH = b.ah;
          if (planH < 1 && actH < 1) return null;

          const showPlan = planH >= 1;
          const showAct = !b.isFuture && actH >= 1;
          const planOp = b.isFuture ? 0.34 : b.isNow ? 0.48 : 0.88;
          const actOp = b.isNow ? 0.9 : 0.86;

          return (
            <g key={b.i}>
              {showPlan && (
                <rect
                  x={b.x}
                  y={baseY - planH}
                  width={barW}
                  height={Math.max(planH, 1)}
                  rx={rx}
                  fill={plannedFill}
                  opacity={planOp}
                />
              )}
              {showAct && (() => {
                const segs = actualSegments[b.i];
                const totalMin = segs.reduce((s, q) => s + q.minutes, 0);
                if (!segs.length || totalMin < 1e-6) {
                  return (
                    <rect
                      x={b.x}
                      y={baseY - actH}
                      width={barW}
                      height={Math.max(actH, 1)}
                      rx={rx}
                      fill={focusedFill}
                      opacity={actOp}
                      filter={b.isNow ? `url(#${filterUid})` : undefined}
                    />
                  );
                }
                const ordered = [...segs].reverse();
                const clipId = `${clipUid}-act-${b.i}`;
                const heights: number[] = [];
                let acc = 0;
                ordered.forEach((seg, idx) => {
                  if (idx === ordered.length - 1) heights.push(Math.max(actH - acc, 0));
                  else {
                    const h = actH * (seg.minutes / totalMin);
                    heights.push(h);
                    acc += h;
                  }
                });
                let sumAbove = 0;
                return (
                  <g filter={b.isNow ? `url(#${filterUid})` : undefined}>
                    <g clipPath={`url(#${clipId})`}>
                      {ordered.map((seg, idx) => {
                        const h = heights[idx] ?? 0;
                        const y = baseY - sumAbove - h;
                        sumAbove += h;
                        if (h < 0.001) return null;
                        return (
                          <rect
                            key={`${b.i}-${seg.tag}-${seg.minutes}-${idx}`}
                            x={b.x}
                            y={y}
                            width={barW}
                            height={h}
                            fill={resolveTagStrokeFill(seg.tag)}
                            opacity={Math.min(1, actOp + 0.04)}
                          />
                        );
                      })}
                    </g>
                  </g>
                );
              })()}
            </g>
          );
        })}

        {tickA > start && tickA < rangeEndMin && (
          <text
            x={tickX(tickA)}
            y={height - 1}
            textAnchor="middle"
            fill="currentColor"
            opacity={0.32}
            style={{ fontSize: 9, fontVariantNumeric: 'tabular-nums' }}
          >
            {fmtTime(tickA)}
          </text>
        )}
        {tickB > start && tickB < rangeEndMin && Math.abs(tickB - tickA) >= 45 && (
          <text
            x={tickX(tickB)}
            y={height - 1}
            textAnchor="middle"
            fill="currentColor"
            opacity={0.32}
            style={{ fontSize: 9, fontVariantNumeric: 'tabular-nums' }}
          >
            {fmtTime(tickB)}
          </text>
        )}

        {nowAnchorX != null && (
          <>
            <line
              x1={nowAnchorX}
              x2={nowAnchorX}
              y1={baseY - 2}
              y2={baseY + 3}
              stroke="hsl(var(--primary))"
              strokeOpacity={0.45}
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
            <circle cx={nowAnchorX} cy={baseY} r={1.5} fill="hsl(var(--primary))" fillOpacity={0.75} />
          </>
        )}

        {hoverIdx != null && barRects[hoverIdx] && (
          <line
            x1={barRects[hoverIdx].x + barW / 2}
            x2={barRects[hoverIdx].x + barW / 2}
            y1={padTop - 1}
            y2={baseY}
            stroke="hsl(var(--foreground))"
            strokeOpacity={0.12}
            strokeWidth={0.5}
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>

      {tooltipNode}

      <div className="mt-0.5 flex min-h-[14px] items-center justify-center text-[9.5px] tabular-nums text-muted-foreground/45">
        {hover && hTime != null ? (
          <span className="tabular-nums text-[9px] text-muted-foreground/55">
            {fmtTime(hTime)}–{fmtTime(Math.min(hTime + BUCKET_AGG_MIN, rangeEndMin))}
            <span className="ml-1.5 text-[8.5px] font-sans font-normal text-muted-foreground/40">
              {lang === 'zh' ? '悬停查看任务' : 'Hover for tasks'}
            </span>
          </span>
        ) : (
          <span className="w-full text-center text-[9px] font-medium tracking-[0.04em] text-muted-foreground/35">
            {legendHint}
          </span>
        )}
      </div>
    </div>
  );
}
