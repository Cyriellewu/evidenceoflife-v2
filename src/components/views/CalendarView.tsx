import { useState, useMemo, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useDateLocale } from '@/hooks/useDateLocale';
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  eachDayOfInterval,
  isSameMonth,
  isToday,
  addMonths,
  subMonths,
  addWeeks,
  subWeeks,
  addDays,
  subDays,
  startOfYear,
  endOfYear,
  eachMonthOfInterval,
  getYear,
  parseISO,
  isSameDay,
} from 'date-fns';
import { ChevronLeft, ChevronRight, Search, X, Upload, Trash2, CalendarDays } from 'lucide-react';
import { DayDetailSheet } from '@/components/DayDetail/DayDetailSheet';
import { DayRecord, Moment } from '@/types';
import { Todo } from '@/hooks/useTodos';
import { cn } from '@/lib/utils';
import { useImportedEvents } from '@/hooks/useImportedEvents';
import { useAuth } from '@/hooks/useAuth';
import { ICSImportManager } from '@/components/views/ICSImportManager';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ViewSwitcher } from '@/components/Calendar/ViewSwitcher';
import { useLanguage } from '@/hooks/useLanguage';
import { DayView } from '@/components/Calendar/DayView';
import { WeekView } from '@/components/Calendar/WeekView';
import { useIsDarkMode } from '@/hooks/useIsDarkMode';
import { getActivityAccentColor } from '@/lib/activityColors';
import { useWorkTypes } from '@/hooks/useWorkTypes';
import { WORK_TYPE_META } from '@/lib/workType';
import { useIsMobile } from '@/hooks/use-mobile';

type DayEventChip = {
  id: string;
  label: string;
  color: string;
  type: 'moment' | 'todo' | 'imported';
  timeLabel?: string;
};

interface CalendarViewProps {
  dayRecords: Map<string, DayRecord>;
  getMomentsForDate: (date: string) => Moment[];
  onAddMoment?: (data: {
    date: string;
    text?: string;
    emoji?: string;
    photos: string[];
    links?: import('@/types').MomentLinkPreview[];
    location?: { name: string; lat: number; lng: number; category: 'restaurant' | 'coffee' | 'grocery' | 'park' | 'museum' | 'other' };
  }) => void;
  onEditMoment?: (id: string, data: Partial<Moment>) => void;
  onDeleteMoment?: (id: string) => void;
  onUpdateTodo?: (id: string, updates: Partial<Todo>) => void;
  onDeleteTodo?: (id: string) => void;
  todos?: Todo[];
  onViewDues?: () => void;
  initialDate?: Date;
  forcedViewMode?: ViewMode;
  onSelectDate?: (date: Date) => void;
}

const weekDays = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const WEEKDAYS_CN = ['日', '一', '二', '三', '四', '五', '六'];
const MONTH_NAMES_CN = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];

type ViewMode = 'day' | 'week' | 'month' | 'year';

export function CalendarView({ dayRecords, getMomentsForDate, onAddMoment, onEditMoment, onDeleteMoment, onUpdateTodo, onDeleteTodo, todos = [], onViewDues, initialDate, forcedViewMode, onSelectDate }: CalendarViewProps) {
  const { formatDate } = useDateLocale();
  const { lang } = useLanguage();
  const isDarkMode = useIsDarkMode();
  const isMobile = useIsMobile();
  const { getWorkType } = useWorkTypes();
  const { user, isDemo, authReady } = useAuth();
  const [currentDate, setCurrentDate] = useState(initialDate ?? new Date());
  /** Month-view focus day (Apple List): grid stays compact; agenda lists this day. */
  const [monthFocusDate, setMonthFocusDate] = useState<Date>(() => initialDate ?? new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [showDayDetail, setShowDayDetail] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (forcedViewMode) return forcedViewMode;
    const saved = localStorage.getItem('calendar-default-view');
    return (saved === 'day' || saved === 'week' || saved === 'month' || saved === 'year') ? saved : 'month';
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [showICSManager, setShowICSManager] = useState(false);
  const [rangeTodos, setRangeTodos] = useState<Todo[]>([]);
  const { events: importedEvents, batches, loading: icsLoading, importICS, addManualEvent, updateEvent, deleteBatch, deleteSelected, searchEvents } = useImportedEvents();

  useEffect(() => {
    if (initialDate) {
      setCurrentDate(initialDate);
      setMonthFocusDate(initialDate);
    }
    if (forcedViewMode) setViewMode(forcedViewMode);
  }, [initialDate, forcedViewMode]);

  // Keep month focus inside the visible month (Apple List).
  useEffect(() => {
    if (viewMode !== 'month') return;
    if (!isSameMonth(monthFocusDate, currentDate)) {
      const today = new Date();
      setMonthFocusDate(isSameMonth(today, currentDate) ? today : startOfMonth(currentDate));
    }
  }, [viewMode, currentDate, monthFocusDate]);

  const todoRange = useMemo(() => {
    if (viewMode === 'day') {
      const day = format(currentDate, 'yyyy-MM-dd');
      return { start: day, end: day };
    }

    if (viewMode === 'week') {
      return {
        start: format(startOfWeek(currentDate), 'yyyy-MM-dd'),
        end: format(endOfWeek(currentDate), 'yyyy-MM-dd'),
      };
    }

    if (viewMode === 'month') {
      return {
        start: format(startOfWeek(startOfMonth(currentDate)), 'yyyy-MM-dd'),
        end: format(endOfWeek(endOfMonth(currentDate)), 'yyyy-MM-dd'),
      };
    }

    return {
      start: format(startOfYear(currentDate), 'yyyy-MM-dd'),
      end: format(endOfYear(currentDate), 'yyyy-MM-dd'),
    };
  }, [currentDate, viewMode]);

  useEffect(() => {
    let cancelled = false;

    const fetchRangeTodos = async () => {
      if (!authReady) return;

      if (!user || isDemo) {
        setRangeTodos(todos);
        return;
      }

      const { data, error } = await supabase
        .from('todos')
        // eslint-disable-next-line no-restricted-syntax -- prod schema lags migrations (todos/imported_events columns differ from types.ts); an explicit list would 400. See schema-drift follow-up.
        .select('*')
        .gte('date', todoRange.start)
        .lte('date', todoRange.end)
        .order('date', { ascending: true })
        .order('sort_order', { ascending: true });

      if (cancelled) return;

      if (error || !data) {
        setRangeTodos(todos);
        return;
      }

      const filtered = data.filter(t => !(t.due_date && !t.parent_due_id)) as Todo[];
      setRangeTodos(filtered);
    };

    fetchRangeTodos();
    return () => { cancelled = true; };
  }, [authReady, isDemo, user, todoRange.start, todoRange.end, todos]);

  const effectiveTodos = useMemo(() => {
    const merged = new Map<string, Todo>();
    rangeTodos.forEach(todo => merged.set(todo.id, todo));
    todos.forEach(todo => merged.set(todo.id, todo));
    return Array.from(merged.values());
  }, [rangeTodos, todos]);

  // Unified event delete handler
  const handleDeleteEvent = useCallback(async (id: string, type: 'moment' | 'todo' | 'imported') => {
    if (type === 'moment') {
      onDeleteMoment?.(id);
    } else if (type === 'todo') {
      onDeleteTodo?.(id);
    } else if (type === 'imported') {
      await deleteSelected([id]);
    }
  }, [onDeleteMoment, onDeleteTodo, deleteSelected]);

  // Unified event rename handler
  const handleRenameEvent = useCallback(async (id: string, type: 'moment' | 'todo' | 'imported', newTitle: string) => {
    if (type === 'moment') {
      onEditMoment?.(id, { text: newTitle });
    } else if (type === 'todo') {
      onUpdateTodo?.(id, { title: newTitle });
    } else if (type === 'imported') {
      await updateEvent(id, { title: newTitle });
    }
  }, [onEditMoment, onUpdateTodo, updateEvent]);

  // Month grid days
  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentDate));
    const end = endOfWeek(endOfMonth(currentDate));
    return eachDayOfInterval({ start, end });
  }, [currentDate]);

  // Year grid months
  const months = useMemo(() => {
    const year = getYear(currentDate);
    const start = startOfYear(new Date(year, 0, 1));
    const end = endOfYear(new Date(year, 0, 1));
    return eachMonthOfInterval({ start, end });
  }, [currentDate]);

  const recordedDates = useMemo(() => {
    const set = new Set<string>();
    dayRecords.forEach((_, dateStr) => set.add(dateStr));
    return set;
  }, [dayRecords]);

  // Per-day events for month view (chips + agenda)
  const dayEvents = useMemo(() => {
    const map = new Map<string, DayEventChip[]>();
    const timeOf = (iso?: string | null) => {
      if (!iso) return undefined;
      try { return format(parseISO(iso), 'HH:mm'); } catch { return undefined; }
    };

    effectiveTodos.forEach((t) => {
      if (t.date.startsWith('_due_')) return;
      // Only surface scheduled or tracked tasks on the calendar; unscheduled
      // backlog items have no time anchor and belong to the task list, not here.
      if (!t.plan_started_at && !t.timer_started_at) return;
      const existing = map.get(t.date) || [];
      const workType = getWorkType({ entity: 'todo', id: t.id, title: t.title, tags: t.tags });
      const color = getActivityAccentColor({ title: t.title, tags: t.tags, isDarkMode })
        || WORK_TYPE_META[workType]?.color
        || 'hsl(var(--primary))';
      existing.push({
        id: t.id,
        label: t.title,
        color,
        type: 'todo',
        timeLabel: timeOf(t.plan_started_at) || timeOf(t.timer_started_at),
      });
      map.set(t.date, existing);
    });

    dayRecords.forEach((record, dateStr) => {
      const existing = map.get(dateStr) || [];
      record.moments.forEach((m) => {
        const label = m.emoji || (m.text ? m.text.slice(0, 48) : '');
        if (!label) return;
        const title = m.text || m.emoji || '';
        const workType = getWorkType({ entity: 'moment', id: m.id, text: title, tags: m.tags });
        const color = getActivityAccentColor({ title, tags: m.tags, isDarkMode })
          || WORK_TYPE_META[workType]?.color
          || '#D5AE4C';
        existing.push({
          id: m.id,
          label: m.text || m.emoji || label,
          color,
          type: 'moment',
          timeLabel: timeOf(m.timer_started_at) || timeOf(m.createdAt),
        });
      });
      if (existing.length > 0) map.set(dateStr, existing);
    });

    importedEvents.forEach((ev) => {
      const dateStr = format(parseISO(ev.start_time), 'yyyy-MM-dd');
      const existing = map.get(dateStr) || [];
      existing.push({
        id: ev.id,
        label: ev.title,
        color: getActivityAccentColor({ title: ev.title, fallback: 'hsl(var(--accent))', isDarkMode }) || 'hsl(var(--accent))',
        type: 'imported',
        timeLabel: timeOf(ev.start_time),
      });
      map.set(dateStr, existing);
    });

    return map;
  }, [effectiveTodos, dayRecords, importedEvents, isDarkMode, getWorkType]);

  const monthFocusKey = format(monthFocusDate, 'yyyy-MM-dd');
  const monthFocusEvents = dayEvents.get(monthFocusKey) || [];

  // Search — smart, multi-term, fuzzy-ish ranking across text, tags, location, type
  const searchResults = useMemo(() => {
    const raw = searchQuery.trim();
    if (!raw) return [];
    const terms = raw.toLowerCase().split(/\s+/).filter(Boolean);

    type Hit = { id: string; date: string; type: 'moment' | 'todo' | 'imported'; text: string; score: number };
    const hits: Hit[] = [];

    // Score a record against all terms; require every term to match somewhere (AND).
    const scoreOf = (haystacks: (string | undefined | null)[]): number => {
      const fields = haystacks.map(h => (h || '').toLowerCase());
      let total = 0;
      for (const term of terms) {
        let best = 0;
        for (const f of fields) {
          if (!f) continue;
          const idx = f.indexOf(term);
          if (idx === -1) continue;
          // whole-word / prefix matches rank higher than mid-string
          const wordBoundary = idx === 0 || /\s/.test(f[idx - 1]);
          const s = wordBoundary ? (idx === 0 ? 3 : 2) : 1;
          if (s > best) best = s;
        }
        if (best === 0) return -1; // this term matched nothing → reject
        total += best;
      }
      return total;
    };

    dayRecords.forEach((record, dateStr) => {
      record.moments.forEach(m => {
        const score = scoreOf([m.text, m.emoji, m.location?.name, ...(m.tags || [])]);
        if (score >= 0) hits.push({ id: m.id, date: dateStr, type: 'moment', text: m.text || m.emoji || '', score });
      });
    });

    effectiveTodos.forEach(t => {
      if (t.date.startsWith('_due_')) return;
      const score = scoreOf([t.title, ...(t.tags || [])]);
      if (score >= 0) hits.push({ id: t.id, date: t.date, type: 'todo', text: t.title, score });
    });

    importedEvents.forEach(ev => {
      const score = scoreOf([ev.title, ev.description, ev.location]);
      if (score >= 0) {
        const dateStr = format(parseISO(ev.start_time), 'yyyy-MM-dd');
        hits.push({ id: ev.id, date: dateStr, type: 'imported', text: ev.title, score });
      }
    });

    // Higher score first, then most recent date.
    hits.sort((a, b) => b.score - a.score || b.date.localeCompare(a.date));
    return hits.slice(0, 30);
  }, [searchQuery, dayRecords, effectiveTodos, importedEvents]);

  const handleDateSelect = (date: Date) => {
    setSelectedDate(date);
    setShowDayDetail(true);
    onSelectDate?.(date);
  };

  const handleMonthSelect = (month: Date) => {
    setCurrentDate(month);
    setViewMode('month');
    onSelectDate?.(month);
  };

  const momentsForSelectedDate = selectedDate 
    ? getMomentsForDate(format(selectedDate, 'yyyy-MM-dd'))
    : [];

  const importedEventsForSelectedDate = selectedDate
    ? importedEvents.filter(e => format(parseISO(e.start_time), 'yyyy-MM-dd') === format(selectedDate, 'yyyy-MM-dd'))
    : [];

  const currentYear = getYear(currentDate);

  const dayEventCount = useMemo(() => {
    if (viewMode !== 'day') return 0;
    const dateStr = format(currentDate, 'yyyy-MM-dd');
    const todosCount = effectiveTodos.filter(t => t.date === dateStr && !t.date.startsWith('_due_')).length;
    const importedCount = importedEvents.filter(e => format(parseISO(e.start_time), 'yyyy-MM-dd') === dateStr).length;
    const record = dayRecords.get(dateStr);
    const momentsCount = record ? record.moments.length : 0;
    return todosCount + importedCount + momentsCount;
  }, [viewMode, currentDate, effectiveTodos, importedEvents, dayRecords]);

  // Navigation helpers
  const navigateBack = () => {
    if (viewMode === 'day') setCurrentDate(prev => subDays(prev, 1));
    else if (viewMode === 'week') setCurrentDate(prev => subWeeks(prev, 1));
    else if (viewMode === 'month') setCurrentDate(prev => subMonths(prev, 1));
    else setCurrentDate(new Date(currentYear - 1, 0, 1));
  };

  const navigateForward = () => {
    if (viewMode === 'day') setCurrentDate(prev => addDays(prev, 1));
    else if (viewMode === 'week') setCurrentDate(prev => addWeeks(prev, 1));
    else if (viewMode === 'month') setCurrentDate(prev => addMonths(prev, 1));
    else setCurrentDate(new Date(currentYear + 1, 0, 1));
  };

  const getHeaderTitle = () => {
    if (viewMode === 'day') return format(currentDate, 'MMMM d, yyyy');
    if (viewMode === 'week') {
      const weekStart = startOfWeek(currentDate);
      const weekEnd = endOfWeek(currentDate);
      return `${format(weekStart, 'MMM d')} – ${format(weekEnd, 'MMM d, yyyy')}`;
    }
    if (viewMode === 'month') return formatDate(currentDate, 'MMMM yyyy');
    return `${currentYear}`;
  };

  return (
    <div className="relative flex-1 min-h-full flex flex-col pb-0">
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        {/* Header with view switcher */}
        <div className="flex items-center justify-between px-4 py-2.5 gap-2">
          <div className="flex items-center gap-1">
            <button onClick={navigateBack} aria-label="Previous" className="p-2 hover:bg-secondary rounded-full transition-colors">
              <ChevronLeft size={20} />
            </button>
            <h1 className="text-[22px] sm:text-[24px] font-semibold font-display tracking-tight min-w-0 text-center whitespace-nowrap leading-none">
              {getHeaderTitle()}
            </h1>
            <button onClick={navigateForward} aria-label="Next" className="p-2 hover:bg-secondary rounded-full transition-colors">
              <ChevronRight size={20} />
            </button>
          </div>
          
          <div className="flex items-center gap-1.5">
            {/* Import is occasional; it lives in the header rather than as a
                primary-colored FAB that covered the event list. */}
            <button
              onClick={() => setShowICSManager(prev => !prev)}
              className={cn(
                'p-2 hover:bg-secondary rounded-full transition-colors text-muted-foreground hover:text-foreground',
                showICSManager && 'bg-secondary text-foreground',
              )}
              title="Import calendar"
              aria-label="Import calendar"
            >
              <Upload size={17} />
            </button>
            <button
              onClick={() => setShowSearch(prev => !prev)}
              className="p-2 hover:bg-secondary rounded-full transition-colors text-muted-foreground hover:text-foreground"
            >
              <Search size={17} />
            </button>
          </div>
        </div>

        {/* View switcher */}
        <div className="flex justify-center px-4 pb-2">
          <ViewSwitcher viewMode={viewMode} onViewModeChange={setViewMode} onSetDefault={(mode) => localStorage.setItem('calendar-default-view', mode)} />
        </div>

        {/* Week view day-column header — sticky so it stays visible while time grid scrolls */}
        {viewMode === 'week' && (() => {
          const wStart = startOfWeek(currentDate);
          const wDays = Array.from({ length: 7 }, (_, i) => addDays(wStart, i));
          return (
            <div className="flex border-b border-border/30">
              <div className="w-12 flex-shrink-0" />
              {wDays.map(day => {
                const dayIsToday = isToday(day);
                return (
                  <button
                    key={format(day, 'yyyy-MM-dd')}
                    onClick={() => { setCurrentDate(day); setViewMode('day'); }}
                    className="flex-1 flex flex-col items-center py-2 hover:bg-secondary/30 transition-colors"
                  >
                    <span className="text-[10px] font-medium text-muted-foreground uppercase">
                      {lang === 'zh' ? WEEKDAYS_CN[day.getDay()] : format(day, 'EEE')}
                    </span>
                    <span className={cn(
                      'w-7 h-7 rounded-full flex items-center justify-center text-sm font-semibold mt-0.5',
                      dayIsToday && 'bg-primary text-primary-foreground',
                    )}>
                      {format(day, 'd')}
                    </span>
                  </button>
                );
              })}
            </div>
          );
        })()}

        {/* Day view sub-header — sticky so it stays visible while time grid scrolls */}
        {viewMode === 'day' && (
          <div className="px-5 py-2.5 border-b border-border/30 flex items-center gap-3">
            <div className={cn(
              'w-10 h-10 rounded-full flex flex-col items-center justify-center flex-shrink-0',
              isToday(currentDate) ? 'bg-primary text-primary-foreground' : 'bg-secondary'
            )}>
              <span className="text-[9px] font-medium uppercase leading-none">{format(currentDate, 'EEE')}</span>
              <span className="text-[16px] font-bold leading-none">{format(currentDate, 'd')}</span>
            </div>
            <div>
              <h2 className="text-[14px] font-semibold">{format(currentDate, 'MMMM d, yyyy')}</h2>
              <p className="text-xs text-muted-foreground">{dayEventCount} events</p>
            </div>
          </div>
        )}

        {/* Search bar */}
        {showSearch && (
          <div className="px-4 pb-2">
            <div className="flex items-center gap-2 bg-card border border-border rounded-xl px-3 py-2">
              <Search size={14} className="text-muted-foreground flex-shrink-0" />
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search moments & tasks..."
                className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-muted-foreground"
                autoFocus
              />
              <button onClick={() => { setShowSearch(false); setSearchQuery(''); }} className="text-muted-foreground hover:text-foreground">
                <X size={14} />
              </button>
            </div>
            {searchQuery.trim() && (
              <div className="mt-2 max-h-60 overflow-y-auto space-y-1">
                {searchResults.length === 0 ? (
                  <p className="text-xs text-muted-foreground/50 text-center py-3">No results</p>
                ) : (
                  searchResults.map((r, i) => (
                    <div
                      key={i}
                      className="w-full text-left px-3 py-2 rounded-lg hover:bg-secondary transition-colors flex items-center gap-2 group"
                    >
                      <button
                        className="flex items-center gap-2 flex-1 min-w-0"
                        onClick={() => {
                          const d = new Date(r.date + 'T00:00:00');
                          setCurrentDate(d);
                          handleDateSelect(d);
                          setViewMode('month');
                        }}
                      >
                        <span className="text-[10px] font-mono text-muted-foreground w-20 flex-shrink-0">{r.date}</span>
                        <span className={cn("text-xs", r.type === 'todo' ? 'text-primary' : 'text-foreground')}>
                          {r.type === 'todo' ? '☑️' : r.type === 'imported' ? '📅' : '📝'}
                        </span>
                        <span className="text-sm truncate">{r.text}</span>
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteEvent(r.id, r.type); }}
                        className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-destructive transition-all flex-shrink-0"
                        title="Delete"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ICS Import Manager */}
      <Dialog open={showICSManager} onOpenChange={setShowICSManager}>
        <DialogContent className="max-w-md gap-0 rounded-2xl border-primary/30 bg-card p-4 shadow-[0_24px_60px_hsl(var(--primary)/0.22)] [&>button]:hidden">
          <ICSImportManager
            events={importedEvents}
            batches={batches}
            loading={icsLoading}
            onImport={async (file) => {
              const ok = await importICS(file);
              if (ok) setShowICSManager(false);
              return ok;
            }}
            onDeleteBatch={deleteBatch}
            onDeleteSelected={deleteSelected}
            onSearchEvents={searchEvents}
            onClose={() => setShowICSManager(false)}
            onAddManualEvent={addManualEvent}
          />
        </DialogContent>
      </Dialog>

      {/* View content */}
      {viewMode === 'day' && (
        <DayView
          date={currentDate}
          dayRecords={dayRecords}
          todos={effectiveTodos}
          importedEvents={importedEvents}
          onDeleteEvent={handleDeleteEvent}
          onRenameEvent={handleRenameEvent}
          onAddEvent={async (date, startHour, startMinute, endHour, endMinute, title) => {
            const day = format(date, 'yyyy-MM-dd');
            const startISO = new Date(`${day}T${String(startHour).padStart(2, '0')}:${String(startMinute).padStart(2, '0')}:00`).toISOString();
            const endISO = new Date(`${day}T${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}:00`).toISOString();
            await addManualEvent({ title: title || (lang === 'zh' ? '新建日程' : 'New Event'), startISO, endISO });
          }}
        />
      )}

      {viewMode === 'week' && (
        <WeekView
          currentDate={currentDate}
          dayRecords={dayRecords}
          todos={effectiveTodos}
          importedEvents={importedEvents}
          onDeleteEvent={handleDeleteEvent}
          onRenameEvent={handleRenameEvent}
          onDayClick={(day) => {
            setCurrentDate(day);
            setViewMode('day');
          }}
          onTimeSlotClick={(date) => handleDateSelect(date)}
          onAddEvent={async (date, startHour, startMinute, endHour, endMinute, title) => {
            const day = format(date, 'yyyy-MM-dd');
            const startISO = new Date(`${day}T${String(startHour).padStart(2, '0')}:${String(startMinute).padStart(2, '0')}:00`).toISOString();
            const endISO = new Date(`${day}T${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}:00`).toISOString();
            await addManualEvent({ title: title || (lang === 'zh' ? '新建日程' : 'New Event'), startISO, endISO });
          }}
        />
      )}

      {viewMode === 'month' && (
        <div className="flex min-h-0 flex-1 flex-col pb-[max(5.5rem,calc(4.25rem+env(safe-area-inset-bottom)))]">
          {/* Compact month grid — Apple-style: dates + dots always fit on screen */}
          <div className="shrink-0 px-2 sm:px-3">
            <div className="grid grid-cols-7 mb-0.5">
              {(lang === 'zh' ? WEEKDAYS_CN : weekDays).map((day, i) => (
                <div key={i} className="py-1.5 text-center text-[11px] font-medium text-muted-foreground/55">
                  {day}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7">
              {days.map(day => {
                const dateStr = format(day, 'yyyy-MM-dd');
                const isCurrentMonth = isSameMonth(day, currentDate);
                const dayIsToday = isToday(day);
                const isFocused = isSameDay(day, monthFocusDate);
                const events = dayEvents.get(dateStr) || [];
                const dots = events.slice(0, 3);

                return (
                  <button
                    key={dateStr}
                    type="button"
                    onClick={() => {
                      if (!isCurrentMonth) return;
                      setMonthFocusDate(day);
                      onSelectDate?.(day);
                    }}
                    onDoubleClick={() => {
                      if (!isCurrentMonth) return;
                      setCurrentDate(day);
                      setViewMode('day');
                    }}
                    disabled={!isCurrentMonth}
                    className={cn(
                      'flex min-h-[3.15rem] flex-col items-center gap-1 py-1 transition-colors sm:min-h-[3.5rem]',
                      !isCurrentMonth && 'pointer-events-none opacity-0',
                      isFocused && !dayIsToday && 'bg-secondary/45',
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-8 w-8 items-center justify-center rounded-full text-[15px] transition-colors',
                        dayIsToday && 'bg-primary font-semibold text-primary-foreground',
                        !dayIsToday && isFocused && 'ring-2 ring-primary/55 ring-offset-1 ring-offset-background',
                        !dayIsToday && !isFocused && 'text-foreground/90',
                        !dayIsToday && day.getDay() === 0 && isCurrentMonth && 'text-destructive/80',
                      )}
                    >
                      {format(day, 'd')}
                    </span>
                    <span className="flex h-1.5 items-center justify-center gap-[3px]">
                      {dots.map((ev, i) => (
                        <span
                          key={`${ev.id}-${i}`}
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: ev.color }}
                        />
                      ))}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selected-day agenda (Apple List) — full titles, no cell truncation */}
          <div className="mt-2 min-h-0 flex-1 overflow-y-auto border-t border-border/35 px-3 pt-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[13px] font-semibold tracking-tight text-foreground">
                  {lang === 'zh'
                    ? format(monthFocusDate, 'M月d日')
                    : format(monthFocusDate, 'EEEE, MMM d')}
                </p>
                <p className="text-[11px] text-muted-foreground/70">
                  {monthFocusEvents.length === 0
                    ? (lang === 'zh' ? '这一天还没有记录' : 'No events')
                    : lang === 'zh'
                      ? `${monthFocusEvents.length} 条`
                      : `${monthFocusEvents.length} event${monthFocusEvents.length === 1 ? '' : 's'}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCurrentDate(monthFocusDate);
                  setViewMode('day');
                }}
                className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-border/40 px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-secondary/50 hover:text-foreground"
              >
                {lang === 'zh' ? '日视图' : 'Day'}
                <ChevronRight size={12} />
              </button>
            </div>

            {monthFocusEvents.length === 0 ? (
              <button
                type="button"
                onClick={() => handleDateSelect(monthFocusDate)}
                className="flex w-full flex-col items-center gap-2 rounded-2xl border border-dashed border-border/45 bg-secondary/20 px-4 py-8 text-center text-muted-foreground/70 transition-colors hover:bg-secondary/35"
              >
                <CalendarDays size={18} className="opacity-60" />
                <span className="text-[12px]">
                  {lang === 'zh' ? '点这里添加一条记录' : 'Tap to add something'}
                </span>
              </button>
            ) : (
              <ul className="space-y-1.5 pb-4">
                {monthFocusEvents.map((ev) => (
                  <li key={`${ev.type}-${ev.id}`}>
                    <button
                      type="button"
                      onClick={() => {
                        setCurrentDate(monthFocusDate);
                        setViewMode('day');
                      }}
                      className="flex w-full items-start gap-2.5 rounded-xl border border-border/30 bg-card/60 px-3 py-2.5 text-left transition-colors hover:bg-secondary/40"
                    >
                      <span
                        className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: ev.color }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-medium leading-snug text-foreground">
                          {ev.label}
                        </span>
                        <span className="mt-0.5 block text-[11px] text-muted-foreground/65">
                          {[
                            ev.timeLabel,
                            ev.type === 'todo'
                              ? (lang === 'zh' ? '任务' : 'Task')
                              : ev.type === 'imported'
                                ? (lang === 'zh' ? '日程' : 'Event')
                                : (lang === 'zh' ? '瞬间' : 'Moment'),
                          ].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                      <ChevronRight size={14} className="mt-1 shrink-0 text-muted-foreground/45" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {/* Desktop-only denser chip preview for multi-day skim */}
            {!isMobile && (
              <p className="pb-2 pt-1 text-center text-[10px] text-muted-foreground/45">
                {lang === 'zh' ? '双击日期打开日视图' : 'Double-click a date to open Day view'}
              </p>
            )}
          </div>
        </div>
      )}

      {viewMode === 'year' && (
        <>
          {/* Year grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-7 px-5 overflow-y-auto flex-1 pb-24 pt-2">            {months.map(month => (
              <YearMiniMonth
                key={format(month, 'yyyy-MM')}
                month={month}
                recordedDates={recordedDates}
                dayEvents={dayEvents}
                lang={lang}
                onMonthClick={() => handleMonthSelect(month)}
                onDayClick={(day) => {
                  setCurrentDate(day);
                  setViewMode('day');
                }}
              />
            ))}
          </div>
        </>
      )}

      <DayDetailSheet
        open={showDayDetail}
        onOpenChange={setShowDayDetail}
        date={selectedDate}
        moments={momentsForSelectedDate}
        importedEvents={importedEventsForSelectedDate}
        onAddMoment={onAddMoment}
      />

    </div>
  );
}

// Year mini month
interface YearMiniMonthProps {
  month: Date;
  recordedDates: Set<string>;
  dayEvents: Map<string, DayEventChip[]>;
  lang: string;
  onMonthClick: () => void;
  onDayClick: (date: Date) => void;
}

function YearMiniMonth({ month, recordedDates, dayEvents, lang, onMonthClick, onDayClick }: YearMiniMonthProps) {
  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(month));
    const end = endOfWeek(endOfMonth(month));
    return eachDayOfInterval({ start, end });
  }, [month]);

  const isCurrentMonthCard = isSameMonth(month, new Date());

  return (
    <div className="flex flex-col">
      <button
        onClick={onMonthClick}
        className={cn(
          'self-start text-[15px] font-semibold tracking-tight mb-2 transition-colors hover:opacity-60',
          isCurrentMonthCard ? 'text-primary' : 'text-foreground',
        )}
      >
        {format(month, 'MMMM')}
      </button>

      <div className="grid grid-cols-7 mb-1">
        {(lang === 'zh' ? WEEKDAYS_CN : ['S','M','T','W','T','F','S']).map((day, i) => (
          <div key={`${day}-${i}`} className="text-center text-[9px] font-medium text-muted-foreground/40">
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-y-1">
        {days.map((day, i) => {
          const isCurrentMonth = isSameMonth(day, month);
          const dateStr = format(day, 'yyyy-MM-dd');
          const dayEventItems = dayEvents.get(dateStr) || [];
          const hasEvents = dayEventItems.length > 0;
          const dotColor = dayEventItems[0]?.color || 'hsl(var(--primary))';
          const isTodayDate = isToday(day);

          return (
            <button
              key={i}
              onClick={() => isCurrentMonth && onDayClick(day)}
              disabled={!isCurrentMonth}
              className={cn(
                'relative h-5 flex items-center justify-center text-[10px] transition-colors',
                !isCurrentMonth && 'opacity-0 pointer-events-none',
                isCurrentMonth && !hasEvents && day.getDay() === 0 && 'text-destructive/70',
                isCurrentMonth && !hasEvents && 'text-foreground/80',
                isCurrentMonth && hasEvents && !isTodayDate && 'font-semibold text-foreground',
              )}
            >
              <span className={cn(
                'flex items-center justify-center',
                isTodayDate && 'w-[18px] h-[18px] rounded-full bg-primary text-primary-foreground font-semibold',
              )}>
                {format(day, 'd')}
              </span>
              {hasEvents && isCurrentMonth && !isTodayDate && (
                <span
                  className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full"
                  style={{ backgroundColor: dotColor }}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
