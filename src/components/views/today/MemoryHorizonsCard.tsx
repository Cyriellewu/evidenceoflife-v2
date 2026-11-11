import { useMemo, useState } from 'react';
import type { Moment } from '@/types';
import { useLanguage } from '@/hooks/useLanguage';
import { buildHorizonDigest, type MemoryHorizon } from '@/lib/memoryHorizons';

interface MemoryHorizonsCardProps {
  // Full moment history across all dates.
  moments: Moment[];
  // Any day within the period to summarize.
  selectedDate: Date;
}

const HORIZONS: { id: MemoryHorizon; labelKey: string }[] = [
  { id: 'week', labelKey: 'horizon.week' },
  { id: 'month', labelKey: 'horizon.month' },
  { id: 'year', labelKey: 'horizon.year' },
];

function formatRange(startKey: string, endKey: string, horizon: MemoryHorizon, lang: string): string {
  const locale = lang === 'zh' ? 'zh-CN' : 'en-US';
  const parse = (key: string) => {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d);
  };
  if (horizon === 'year') {
    return String(parse(startKey).getFullYear());
  }
  if (horizon === 'month') {
    return parse(startKey).toLocaleDateString(locale, { month: 'long', year: 'numeric' });
  }
  const fmt = (key: string) => parse(key).toLocaleDateString(locale, { month: 'short', day: 'numeric' });
  return `${fmt(startKey)} – ${fmt(endKey)}`;
}

// "Revisit" — the zoom-out half of the daily loop. The same lived evidence,
// viewed at three layers of memory (week / month / year) behind one segmented
// control, so the deeper horizons stay progressively disclosed instead of
// crowding the day. No streaks, no scores — just accumulation made visible.
export function MemoryHorizonsCard({ moments, selectedDate }: MemoryHorizonsCardProps) {
  const { t, lang } = useLanguage();
  const [horizon, setHorizon] = useState<MemoryHorizon>('week');

  const digest = useMemo(
    () => buildHorizonDigest(moments, selectedDate, horizon),
    [moments, selectedDate, horizon],
  );

  const stats = [
    { value: digest.activeDays, labelKey: 'horizon.activeDays' },
    digest.focusMinutes > 0 && { value: digest.focusMinutes, labelKey: 'horizon.focusMin' },
    { value: digest.moments, labelKey: 'horizon.moments' },
    digest.photos > 0 && { value: digest.photos, labelKey: 'horizon.photos' },
    digest.places > 0 && { value: digest.places, labelKey: 'horizon.places' },
    digest.special > 0 && { value: digest.special, labelKey: 'horizon.special' },
  ].filter(Boolean) as { value: number; labelKey: string }[];

  return (
    <section className="rounded-2xl border border-border/40 bg-card p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-[17px] font-semibold tracking-tight text-foreground">{t('horizon.title')}</h3>
        <span className="text-[13px] text-muted-foreground">
          {formatRange(digest.startKey, digest.endKey, horizon, lang)}
        </span>
      </div>

      {/* Segmented control — progressive disclosure across the three layers. */}
      <div className="mt-3 flex rounded-lg bg-secondary/60 p-0.5">
        {HORIZONS.map(({ id, labelKey }) => (
          <button
            key={id}
            type="button"
            onClick={() => setHorizon(id)}
            className={`flex-1 rounded-md py-1 text-[13px] font-medium transition-colors ${
              horizon === id
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t(labelKey)}
          </button>
        ))}
      </div>

      {digest.moments === 0 ? (
        <p className="mt-4 text-[15px] text-muted-foreground">{t('horizon.empty')}</p>
      ) : (
        <>
          {/* Plain numbers, no tiles: the count of stats varies, so a wrapping
              row never leaves an empty cell. */}
          <dl className="mt-4 flex flex-wrap gap-x-5 gap-y-3">
            {stats.map(({ value, labelKey }) => (
              <div key={labelKey}>
                <dd className="text-[22px] font-semibold leading-none tabular-nums text-foreground">{value}</dd>
                <dt className="mt-1 text-[13px] text-muted-foreground">{t(labelKey)}</dt>
              </div>
            ))}
          </dl>

          {digest.kept.length > 0 && (
            <div className="mt-4 border-t border-border/40 pt-3">
              <p className="text-[13px] text-muted-foreground">{t('horizon.keptLabel')}</p>
              <ul className="mt-1.5 space-y-1.5">
                {digest.kept.slice(-3).map(({ dateStr, text }) => (
                  <li key={dateStr + text.slice(0, 8)} className="line-clamp-2 text-[15px] leading-snug text-foreground">
                    {text}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}
