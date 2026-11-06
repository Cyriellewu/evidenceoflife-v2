import { useEffect, useMemo, useRef } from 'react';
import { format, subDays, startOfWeek, addDays, getDay } from 'date-fns';
import { Moment } from '@/types';
import { Todo } from '@/hooks/useTodos';

interface LifeHeatmapProps {
  allMoments: Moment[];
  allTodos?: Todo[];
  mode?: 'activity' | 'focus';
  /** Hide the built-in title row when the parent already titles the card. */
  showHeader?: boolean;
}

export function LifeHeatmap({ allMoments, allTodos, mode = 'activity', showHeader = true }: LifeHeatmapProps) {
  const { weeks, maxVal, totalDays } = useMemo(() => {
    const today = new Date();
    // Go back ~26 weeks (half year)
    const numWeeks = 26;
    const endDate = today;
    const startDate = subDays(startOfWeek(endDate, { weekStartsOn: 0 }), (numWeeks - 1) * 7);

    // Build day → value map
    const dayMap = new Map<string, number>();

    if (mode === 'activity') {
      allMoments.forEach(m => {
        const d = m.date;
        dayMap.set(d, (dayMap.get(d) || 0) + 1);
      });
      // Add todos
      (allTodos || []).forEach(t => {
        if (t.is_completed) {
          dayMap.set(t.date, (dayMap.get(t.date) || 0) + 1);
        }
      });
    } else {
      // Focus mode: sum timer_seconds per day
      allMoments.forEach(m => {
        if (m.timer_seconds && m.timer_seconds > 0) {
          const d = m.date;
          dayMap.set(d, (dayMap.get(d) || 0) + m.timer_seconds / 3600);
        }
      });
      (allTodos || []).forEach(t => {
        if (t.is_completed && t.timer_seconds && t.timer_seconds > 0) {
          dayMap.set(t.date, (dayMap.get(t.date) || 0) + t.timer_seconds / 3600);
        }
      });
    }

    // Build weeks grid
    const weeks: { date: Date; dateStr: string; value: number }[][] = [];
    let currentWeekStart = startOfWeek(startDate, { weekStartsOn: 0 });
    let maxVal = 0;
    let totalDays = 0;

    for (let w = 0; w < numWeeks; w++) {
      const week: { date: Date; dateStr: string; value: number }[] = [];
      for (let d = 0; d < 7; d++) {
        const date = addDays(currentWeekStart, d);
        const dateStr = format(date, 'yyyy-MM-dd');
        const value = dayMap.get(dateStr) || 0;
        if (value > maxVal) maxVal = value;
        if (value > 0) totalDays++;
        week.push({ date, dateStr, value });
      }
      weeks.push(week);
      currentWeekStart = addDays(currentWeekStart, 7);
    }

    return { weeks, maxVal, totalDays };
  }, [allMoments, allTodos, mode]);

  const getColor = (value: number): string => {
    if (value === 0) return 'hsl(var(--muted))';
    const intensity = maxVal > 0 ? value / maxVal : 0;
    if (intensity < 0.25) return '#C7E8CA';
    if (intensity < 0.5) return '#7BC67E';
    if (intensity < 0.75) return '#3DA142';
    return '#1A7D22';
  };

  const getTooltip = (day: { dateStr: string; value: number }): string => {
    const label = mode === 'activity'
      ? `${Math.round(day.value)} activities`
      : `${day.value.toFixed(1)}h focus`;
    return `${day.dateStr}\n${label}`;
  };

  // Month labels
  const monthLabels = useMemo(() => {
    const labels: { label: string; weekIdx: number }[] = [];
    let lastMonth = -1;
    weeks.forEach((week, wi) => {
      const firstDay = week.find(d => d.date.getDate() <= 7);
      const month = week[0].date.getMonth();
      if (month !== lastMonth) {
        lastMonth = month;
        labels.push({ label: format(week[0].date, 'MMM'), weekIdx: wi });
      }
    });
    return labels;
  }, [weeks]);

  const CELL = 10;
  const GAP = 2;
  const LABEL_W = 18;

  // On a phone the half-year grid is wider than the card: let it scroll
  // sideways and start at the most recent week.
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [weeks]);

  return (
    <div className="min-w-0">
      {showHeader && <div className="flex items-baseline justify-between gap-3 mb-2">
        <p className="text-[12px] font-medium text-muted-foreground/70">
          Life heatmap
        </p>
        <p className="text-[11px] tabular-nums text-muted-foreground/60">
          {totalDays} active days
        </p>
      </div>}

      <div ref={scrollRef} className="overflow-x-auto no-scrollbar">
        <div className="w-max">
          {/* Month labels */}
          <div className="relative h-3" style={{ marginLeft: LABEL_W }}>
            {monthLabels.map((ml, i) => (
              <span
                key={i}
                className="text-[9px] tabular-nums absolute top-0"
                style={{
                  color: 'hsl(var(--muted-foreground) / 0.5)',
                  left: ml.weekIdx * (CELL + GAP),
                }}
              >
                {ml.label}
              </span>
            ))}
          </div>

          <div className="flex mt-1.5">
            {/* Day labels */}
            <div className="flex flex-col flex-shrink-0" style={{ gap: GAP, width: LABEL_W }}>
              {['', 'M', '', 'W', '', 'F', ''].map((label, i) => (
                <div key={i} className="flex items-center" style={{ height: CELL }}>
                  <span className="text-[8px] tabular-nums text-muted-foreground/50">{label}</span>
                </div>
              ))}
            </div>

            {/* Grid */}
            <div className="flex" style={{ gap: GAP }}>
              {weeks.map((week, wi) => (
                <div key={wi} className="flex flex-col" style={{ gap: GAP }}>
                  {week.map((day, di) => (
                    <div
                      key={di}
                      className="rounded-[2px] cursor-default"
                      style={{
                        width: CELL,
                        height: CELL,
                        backgroundColor: getColor(day.value),
                      }}
                      title={getTooltip(day)}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-1 mt-2" style={{ paddingLeft: LABEL_W }}>
        <span className="text-[9px] text-muted-foreground/50">Less</span>
        {[0, 0.25, 0.5, 0.75, 1].map((v, i) => (
          <div
            key={i}
            className="rounded-[2px]"
            style={{ width: CELL, height: CELL, backgroundColor: getColor(v * (maxVal || 1)) }}
          />
        ))}
        <span className="text-[9px] text-muted-foreground/50">More</span>
      </div>
    </div>
  );
}
