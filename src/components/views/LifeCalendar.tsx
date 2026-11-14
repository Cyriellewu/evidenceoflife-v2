import { useState, useMemo } from 'react';
import {
  format, startOfYear, endOfYear, eachDayOfInterval, getDay, getMonth, startOfWeek,
  subYears, addYears, isToday, isBefore, parseISO, differenceInDays,
} from 'date-fns';
import { ChevronLeft, ChevronRight, CalendarDays, Sparkles, Clock, Tag, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Moment, DayRecord } from '@/types';
import { autoClassifyTag, TAG_CATEGORY_COLORS, TAG_CATEGORY_ICONS } from '@/lib/autoTag';
import { useLanguage } from '@/hooks/useLanguage';
import { cn } from '@/lib/utils';
import { momentTitle } from '@/components/views/today/todayHelpers';

interface LifeCalendarProps {
  allMoments: Moment[];
  dayRecords: Map<string, DayRecord>;
  getMomentsForDate: (date: string) => Moment[];
  onClose?: () => void;
}

const MONTH_LABELS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_LABELS_ZH = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

function getDominantTag(moments: Moment[]): string {
  const counts: Record<string, number> = {};
  moments.forEach(m => {
    const tag = m.tags?.[0] || autoClassifyTag(m.text || '') || 'life';
    counts[tag] = (counts[tag] || 0) + 1;
  });
  let maxTag = 'life';
  let maxCount = 0;
  for (const [tag, count] of Object.entries(counts)) {
    if (count > maxCount) { maxCount = count; maxTag = tag; }
  }
  return maxTag;
}

function getIntensity(count: number, max: number): number {
  if (count === 0) return 0;
  if (max <= 1) return 3;
  const ratio = count / max;
  if (ratio > 0.7) return 4;
  if (ratio > 0.4) return 3;
  if (ratio > 0.15) return 2;
  return 1;
}

export function LifeCalendar({ allMoments, dayRecords, getMomentsForDate, onClose }: LifeCalendarProps) {
  const { lang } = useLanguage();
  const [year, setYear] = useState(new Date().getFullYear());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const monthLabels = lang === 'zh' ? MONTH_LABELS_ZH : MONTH_LABELS_EN;

  // Build day data for the year
  const { grid, stats } = useMemo(() => {
    const yearStart = startOfYear(new Date(year, 0, 1));
    const yearEnd = endOfYear(yearStart);
    const allDays = eachDayOfInterval({ start: yearStart, end: yearEnd });

    // Count moments per day
    const dayData = new Map<string, { count: number; tag: string; moments: Moment[] }>();
    let maxCount = 0;

    allDays.forEach(day => {
      const dateStr = format(day, 'yyyy-MM-dd');
      const moments = getMomentsForDate(dateStr);
      const count = moments.length;
      const tag = moments.length > 0 ? getDominantTag(moments) : '';
      dayData.set(dateStr, { count, tag, moments });
      if (count > maxCount) maxCount = count;
    });

    // Build weeks grid (columns = weeks, rows = days of week)
    const firstDay = yearStart;
    const startDow = getDay(firstDay); // 0=Sun
    const weeks: { dateStr: string; count: number; tag: string; isCurrentMonth: boolean; isToday: boolean; isInYear: boolean }[][] = [];
    let currentWeek: typeof weeks[0] = [];

    // Pad first week
    for (let i = 0; i < startDow; i++) {
      currentWeek.push({ dateStr: '', count: 0, tag: '', isCurrentMonth: false, isToday: false, isInYear: false });
    }

    allDays.forEach(day => {
      const dateStr = format(day, 'yyyy-MM-dd');
      const data = dayData.get(dateStr)!;
      currentWeek.push({
        dateStr,
        count: data.count,
        tag: data.tag,
        isCurrentMonth: true,
        isToday: isToday(day),
        isInYear: true,
      });
      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
    });
    if (currentWeek.length > 0) {
      while (currentWeek.length < 7) {
        currentWeek.push({ dateStr: '', count: 0, tag: '', isCurrentMonth: false, isToday: false, isInYear: false });
      }
      weeks.push(currentWeek);
    }

    // Stats
    let totalDays = 0;
    let totalMoments = 0;
    let bestDay = '';
    let bestDayCount = 0;
    const tagTotals: Record<string, number> = {};
    const monthCounts: number[] = new Array(12).fill(0);

    for (const [dateStr, data] of dayData) {
      if (data.count > 0) {
        totalDays++;
        totalMoments += data.count;
        if (data.count > bestDayCount) { bestDayCount = data.count; bestDay = dateStr; }
        tagTotals[data.tag] = (tagTotals[data.tag] || 0) + data.count;
        const month = parseInt(dateStr.slice(5, 7)) - 1;
        monthCounts[month] += data.count;
      }
    }

    const topTag = Object.entries(tagTotals).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
    const busiestMonth = monthCounts.indexOf(Math.max(...monthCounts));

    return {
      grid: weeks,
      stats: { totalDays, totalMoments, bestDay, bestDayCount, topTag, busiestMonth, maxCount },
    };
  }, [year, allMoments, getMomentsForDate]);

  // Selected day details
  const selectedDayMoments = useMemo(() => {
    if (!selectedDay) return [];
    return getMomentsForDate(selectedDay);
  }, [selectedDay, getMomentsForDate]);

  // Month label positions
  const monthPositions = useMemo(() => {
    const positions: { label: string; weekIdx: number }[] = [];
    let lastMonth = -1;
    grid.forEach((week, weekIdx) => {
      for (const day of week) {
        if (day.isInYear && day.dateStr) {
          const month = parseInt(day.dateStr.slice(5, 7)) - 1;
          if (month !== lastMonth) {
            positions.push({ label: monthLabels[month], weekIdx });
            lastMonth = month;
          }
          break;
        }
      }
    });
    return positions;
  }, [grid, monthLabels]);

  const getCellColor = (count: number, tag: string): string => {
    if (count === 0) return 'hsl(var(--muted))';
    const baseColor = TAG_CATEGORY_COLORS[tag] || '#F59E0B';
    const intensity = getIntensity(count, stats.maxCount);
    // Use opacity for intensity
    const opacityMap: Record<number, number> = { 1: 0.25, 2: 0.45, 3: 0.7, 4: 1 };
    return baseColor;
  };

  const getCellOpacity = (count: number): number => {
    if (count === 0) return 0.15;
    const intensity = getIntensity(count, stats.maxCount);
    return [0, 0.3, 0.5, 0.75, 1][intensity];
  };

  return (
    <div className="flex-1 pb-24 px-4 sm:px-5 lg:px-6 max-w-5xl mx-auto w-full animate-fade-in">
      {/* Header */}
      <header className="flex items-center justify-between py-5">
        <div>
          <h1 className="text-2xl font-bold">{year}</h1>
          <p className="text-sm text-muted-foreground/60">
            {lang === 'zh' ? '生活年历' : 'Life Calendar'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => setYear(y => y - 1)} className="h-8 w-8 rounded-full">
            <ChevronLeft size={18} />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setYear(new Date().getFullYear())} className="h-8 px-3 rounded-full text-xs">
            {lang === 'zh' ? '今年' : 'This Year'}
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setYear(y => y + 1)} className="h-8 w-8 rounded-full">
            <ChevronRight size={18} />
          </Button>
          {onClose && (
            <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 rounded-full ml-2">
              <X size={18} />
            </Button>
          )}
        </div>
      </header>

      {/* Year Stats */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <div className="p-3 rounded-xl bg-card border border-border text-center">
          <CalendarDays size={16} className="mx-auto mb-1 text-primary" />
          <p className="text-xl font-bold">{stats.totalDays}</p>
          <p className="text-[11px] text-muted-foreground">{lang === 'zh' ? '记录天数' : 'Days Recorded'}</p>
        </div>
        <div className="p-3 rounded-xl bg-card border border-border text-center">
          <Clock size={16} className="mx-auto mb-1 text-primary" />
          <p className="text-xl font-bold">{stats.totalMoments}</p>
          <p className="text-[11px] text-muted-foreground">{lang === 'zh' ? '总记录' : 'Total Moments'}</p>
        </div>
        <div className="p-3 rounded-xl bg-card border border-border text-center">
          <Sparkles size={16} className="mx-auto mb-1 text-primary" />
          <p className="text-xl font-bold">{stats.totalDays > 0 ? Math.round(stats.totalMoments / stats.totalDays) : 0}</p>
          <p className="text-[11px] text-muted-foreground">{lang === 'zh' ? '日均记录' : 'Per Day'}</p>
        </div>
        <div className="p-3 rounded-xl bg-card border border-border text-center">
          <Tag size={16} className="mx-auto mb-1 text-primary" />
          <p className="text-xl font-bold capitalize">{stats.topTag || '—'}</p>
          <p className="text-[11px] text-muted-foreground">{lang === 'zh' ? '主要活动' : 'Top Activity'}</p>
        </div>
      </div>

      {/* Heatmap grid */}
      <div className="p-4 rounded-2xl bg-card border border-border overflow-x-auto">
        {/* Month labels */}
        <div className="flex mb-1 ml-8" style={{ gap: 0 }}>
          {monthPositions.map((mp, i) => {
            const nextPos = monthPositions[i + 1]?.weekIdx || grid.length;
            const width = (nextPos - mp.weekIdx) * 14; // ~14px per week cell
            return (
              <div
                key={mp.label}
                className="text-[10px] text-muted-foreground/60 flex-shrink-0"
                style={{ width: `${width}px` }}
              >
                {mp.label}
              </div>
            );
          })}
        </div>

        {/* Grid */}
        <div className="flex gap-0">
          {/* Day labels */}
          <div className="flex flex-col gap-[2px] mr-1.5 pt-0">
            {['', 'M', '', 'W', '', 'F', ''].map((label, i) => (
              <div key={i} className="h-[12px] w-6 text-[9px] text-muted-foreground/40 flex items-center justify-end pr-1">
                {label}
              </div>
            ))}
          </div>

          {/* Weeks */}
          <div className="flex gap-[2px]">
            {grid.map((week, weekIdx) => (
              <div key={weekIdx} className="flex flex-col gap-[2px]">
                {week.map((day, dayIdx) => {
                  if (!day.isInYear) {
                    return <div key={dayIdx} className="w-[12px] h-[12px]" />;
                  }
                  const color = day.count > 0 ? (TAG_CATEGORY_COLORS[day.tag] || '#F59E0B') : undefined;
                  return (
                    <button
                      key={dayIdx}
                      onClick={() => day.dateStr && setSelectedDay(day.dateStr === selectedDay ? null : day.dateStr)}
                      className={cn(
                        "w-[12px] h-[12px] rounded-[2px] transition-all hover:scale-125",
                        day.isToday && "ring-1 ring-primary ring-offset-1 ring-offset-background",
                        selectedDay === day.dateStr && "ring-1 ring-foreground",
                      )}
                      style={{
                        backgroundColor: color || 'hsl(var(--muted))',
                        opacity: getCellOpacity(day.count),
                      }}
                      title={`${day.dateStr}: ${day.count} ${lang === 'zh' ? '条记录' : 'moments'}`}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/30">
          <div className="flex items-center gap-3">
            {Object.entries(TAG_CATEGORY_COLORS).map(([tag, color]) => (
              <span key={tag} className="flex items-center gap-1 text-[10px] text-muted-foreground/60">
                <span className="w-[10px] h-[10px] rounded-[2px]" style={{ backgroundColor: color }} />
                <span className="capitalize">{tag}</span>
              </span>
            ))}
          </div>
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground/40">
            <span>{lang === 'zh' ? '少' : 'Less'}</span>
            {[0.15, 0.3, 0.5, 0.75, 1].map((op, i) => (
              <span key={i} className="w-[10px] h-[10px] rounded-[2px] bg-primary" style={{ opacity: op }} />
            ))}
            <span>{lang === 'zh' ? '多' : 'More'}</span>
          </div>
        </div>
      </div>

      {/* Busiest month + best day */}
      <div className="grid grid-cols-2 gap-3 mt-4">
        <div className="p-3 rounded-xl bg-card border border-border">
          <p className="text-[11px] text-muted-foreground/60 mb-1">{lang === 'zh' ? '最忙月份' : 'Busiest Month'}</p>
          <p className="text-lg font-semibold">{monthLabels[stats.busiestMonth]}</p>
        </div>
        <div className="p-3 rounded-xl bg-card border border-border">
          <p className="text-[11px] text-muted-foreground/60 mb-1">{lang === 'zh' ? '最活跃一天' : 'Best Day'}</p>
          <p className="text-lg font-semibold">{stats.bestDay ? format(parseISO(stats.bestDay), 'MMM d') : '—'}</p>
          <p className="text-xs text-muted-foreground">{stats.bestDayCount} {lang === 'zh' ? '条记录' : 'moments'}</p>
        </div>
      </div>

      {/* Selected day detail */}
      {selectedDay && (
        <div className="mt-4 p-4 rounded-2xl bg-card border border-border animate-fade-in">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">{format(parseISO(selectedDay), 'MMMM d, yyyy')}</h3>
            <button onClick={() => setSelectedDay(null)} className="text-muted-foreground hover:text-foreground">
              <X size={14} />
            </button>
          </div>
          {selectedDayMoments.length === 0 ? (
            <p className="text-sm text-muted-foreground/50">{lang === 'zh' ? '这天没有记录' : 'No records this day'}</p>
          ) : (
            <div className="space-y-2">
              {selectedDayMoments.map(m => {
                const time = m.timer_started_at ? format(parseISO(m.timer_started_at), 'HH:mm') : format(parseISO(m.createdAt), 'HH:mm');
                const tag = m.tags?.[0] || autoClassifyTag(m.text || '') || 'life';
                const color = TAG_CATEGORY_COLORS[tag] || '#F59E0B';
                const icon = TAG_CATEGORY_ICONS[tag] || '📌';
                const title = momentTitle(m.text) || m.emoji || '';
                let duration = '';
                if (m.timer_seconds && m.timer_seconds > 0) {
                  const min = Math.round(m.timer_seconds / 60);
                  duration = min >= 60 ? `${Math.floor(min / 60)}h${min % 60 > 0 ? ` ${min % 60}m` : ''}` : `${min}m`;
                }
                return (
                  <div key={m.id} className="flex items-start gap-2.5">
                    <span className="text-[11px] font-mono text-muted-foreground/50 mt-0.5 w-10 flex-shrink-0">{time}</span>
                    <div className="w-[7px] h-[7px] rounded-full mt-1.5 flex-shrink-0" style={{ backgroundColor: color }} />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm">{icon} {title}</span>
                      {duration && <span className="text-xs text-muted-foreground/50 ml-1.5">({duration})</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Year summary quote */}
      {stats.totalDays > 0 && (
        <div className="mt-6 p-5 rounded-2xl bg-gradient-to-br from-primary/[0.04] to-primary/[0.08] border border-primary/10 text-center">
          <p className="text-[15px] text-foreground/70 leading-relaxed font-light">
            {lang === 'zh'
              ? `${year} 年，你记录了 ${stats.totalDays} 天的生活证据。`
              : `In ${year}, you captured ${stats.totalDays} days of evidence of life.`}
          </p>
          <p className="text-[13px] text-muted-foreground/50 mt-1">
            {lang === 'zh'
              ? `共 ${stats.totalMoments} 条记录 · 主要活动：${stats.topTag}`
              : `${stats.totalMoments} moments · Top activity: ${stats.topTag}`}
          </p>
        </div>
      )}
    </div>
  );
}
