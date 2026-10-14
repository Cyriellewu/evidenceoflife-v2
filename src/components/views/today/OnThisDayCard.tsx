import { useMemo } from 'react';
import { Clock3, MapPin, ArrowRight } from 'lucide-react';
import type { Moment } from '@/types';
import { useLanguage } from '@/hooks/useLanguage';
import { StorageImage } from '@/components/StorageImage';

interface OnThisDayCardProps {
  // The full moment history across all dates.
  moments: Moment[];
  // The day currently being reviewed.
  selectedDate: Date;
  // Jump back to relive the surfaced day.
  onRevisit: (dateStr: string) => void;
}

interface Memory {
  dateStr: string;
  moment: Moment;
  // 'year' | 'month' | 'days' — how we label the gap.
  kind: 'year' | 'month' | 'days';
  amount: number;
}

function parseYmd(dateStr: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

function daysBetween(aYmd: { y: number; m: number; d: number }, b: Date): number {
  const a = Date.UTC(aYmd.y, aYmd.m - 1, aYmd.d);
  const bUtc = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((bUtc - a) / 86400000);
}

// Pick the most evocative moment for a given day: prefer one with a photo,
// then a special one, then any with text.
function pickRepresentative(moments: Moment[]): Moment | null {
  const withPhoto = moments.find(m => m.photos && m.photos.length > 0);
  if (withPhoto) return withPhoto;
  const special = moments.find(m => m.isSpecial);
  if (special) return special;
  const withText = moments.find(m => m.text && m.text.trim().length > 0);
  if (withText) return withText;
  return moments[0] ?? null;
}

// Choose which past day to resurface for the selected day. Pure so it can be
// unit-tested independently of rendering.
export function pickOnThisDayMemory(moments: Moment[], selectedDate: Date): Memory | null {
  const sel = { y: selectedDate.getFullYear(), m: selectedDate.getMonth() + 1, d: selectedDate.getDate() };
  const selDayKey = `${String(sel.y).padStart(4, '0')}-${String(sel.m).padStart(2, '0')}-${String(sel.d).padStart(2, '0')}`;

  // Group past moments (strictly before the selected day) by date.
  const byDate = new Map<string, Moment[]>();
  for (const m of moments) {
    const ymd = parseYmd(m.date);
    if (!ymd) continue;
    if (m.date >= selDayKey) continue;
    const list = byDate.get(m.date);
    if (list) list.push(m);
    else byDate.set(m.date, [m]);
  }
  if (byDate.size === 0) return null;

  // Priority 1: same month & day in a previous year ("on this day").
  let yearMatch: Memory | null = null;
  // Priority 2: same day-of-month in the immediately previous month.
  let monthMatch: Memory | null = null;
  // Priority 3: most recent memorable day at least 14 days back.
  let fallback: Memory | null = null;

  for (const [dateStr, list] of byDate) {
    const ymd = parseYmd(dateStr)!;
    const rep = pickRepresentative(list);
    if (!rep) continue;

    if (ymd.m === sel.m && ymd.d === sel.d && ymd.y < sel.y) {
      const years = sel.y - ymd.y;
      if (!yearMatch || years < yearMatch.amount) {
        yearMatch = { dateStr, moment: rep, kind: 'year', amount: years };
      }
      continue;
    }

    // Previous month, same day-of-month.
    const prevMonth = sel.m === 1 ? 12 : sel.m - 1;
    const prevMonthYear = sel.m === 1 ? sel.y - 1 : sel.y;
    if (ymd.m === prevMonth && ymd.y === prevMonthYear && ymd.d === sel.d) {
      if (!monthMatch) monthMatch = { dateStr, moment: rep, kind: 'month', amount: 1 };
      continue;
    }

    const gap = daysBetween(ymd, selectedDate);
    const memorable = (rep.photos && rep.photos.length > 0) || rep.isSpecial;
    if (gap >= 14 && memorable) {
      if (!fallback || dateStr > fallback.dateStr) {
        fallback = { dateStr, moment: rep, kind: 'days', amount: gap };
      }
    }
  }

  return yearMatch ?? monthMatch ?? fallback;
}

// "On This Day / Life Replay" — proactively brings a past day back into view so
// the act of planning today is grounded in evidence of who you've already been.
export function OnThisDayCard({ moments, selectedDate, onRevisit }: OnThisDayCardProps) {
  const { t } = useLanguage();

  const memory = useMemo<Memory | null>(
    () => pickOnThisDayMemory(moments, selectedDate),
    [moments, selectedDate],
  );

  if (!memory) return null;

  const label = (() => {
    if (memory.kind === 'year') {
      return memory.amount === 1
        ? t('onThisDay.oneYearAgo')
        : t('onThisDay.yearsAgo').replace('{n}', String(memory.amount));
    }
    if (memory.kind === 'month') return t('onThisDay.lastMonth');
    return t('onThisDay.daysAgo').replace('{n}', String(memory.amount));
  })();

  const { moment } = memory;
  const thumb = moment.photos && moment.photos.length > 0 ? moment.photos[0] : null;
  const text = moment.text?.trim();
  const place = moment.location?.name;

  return (
    <button
      type="button"
      onClick={() => onRevisit(memory.dateStr)}
      className="group w-full rounded-2xl border border-[#e8ddc4]/70 bg-gradient-to-b from-[#fbf6ea] to-[#f6efdf] p-4 text-left shadow-[0_8px_24px_rgba(120,100,60,0.06)] transition-shadow hover:shadow-[0_10px_28px_rgba(120,100,60,0.12)] dark:border-foreground/[0.12] dark:from-foreground/[0.05] dark:to-foreground/[0.02]"
    >
      <div className="flex items-center gap-2">
        <Clock3 size={15} className="text-[#b59a5e] dark:text-foreground/55" />
        <h3 className="text-sm font-semibold text-[#6e5b38] dark:text-foreground/85">{t('onThisDay.title')}</h3>
        <span className="ml-auto text-[11px] font-medium text-[#9a8a66] dark:text-foreground/45">{label}</span>
      </div>

      <div className="mt-3 flex gap-3">
        {thumb && (
          <StorageImage
            src={thumb}
            alt=""
            className="h-16 w-16 flex-shrink-0 rounded-xl object-cover ring-1 ring-[#e8ddc4]/70 dark:ring-foreground/[0.1]"
          />
        )}
        <div className="min-w-0 flex-1">
          {moment.emoji && <span className="mr-1.5 text-base">{moment.emoji}</span>}
          {text ? (
            <span className="text-[13px] leading-6 text-[#544832] dark:text-foreground/85">{text}</span>
          ) : (
            <span className="text-[13px] leading-6 text-[#9a8a66] dark:text-foreground/50">{t('onThisDay.noText')}</span>
          )}
          {place && (
            <span className="mt-1 flex items-center gap-1 text-[11px] text-[#9a8a66] dark:text-foreground/50">
              <MapPin size={11} />
              {place}
            </span>
          )}
        </div>
      </div>

      <span className="mt-3 inline-flex items-center gap-1 text-[12px] font-semibold text-[#9a7c3e] group-hover:gap-1.5 dark:text-foreground/70">
        {t('onThisDay.revisit')}
        <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
      </span>
    </button>
  );
}
