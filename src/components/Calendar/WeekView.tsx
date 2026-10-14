import { useMemo, useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import { format, parseISO, startOfWeek, addDays, isToday } from 'date-fns';
import { cn } from '@/lib/utils';
import { DayRecord, Moment } from '@/types';
import { Todo } from '@/hooks/useTodos';
import { ImportedEvent } from '@/hooks/useImportedEvents';
import { useLanguage } from '@/hooks/useLanguage';
import { EventDetailPopup } from '@/components/Calendar/EventDetailPopup';
import { useIsDarkMode } from '@/hooks/useIsDarkMode';
import { getActivityAccentColor, getActivityTextColor, getCalendarBlockChrome } from '@/lib/activityColors';
import { useWorkTypes } from '@/hooks/useWorkTypes';
import { WORK_TYPE_META } from '@/lib/workType';
import { StorageImage } from '@/components/StorageImage';

const WEEKDAYS_CN = ['日', '一', '二', '三', '四', '五', '六'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const HOUR_HEIGHT = 60;

interface TimeEvent {
  id: string;
  title: string;
  startHour: number;
  startMinute: number;
  durationMinutes: number;
  color: string;
  hasPhotos?: boolean;
  type: 'moment' | 'todo' | 'imported';
  emoji?: string;
  photos?: string[];
  location?: string;
  description?: string;
  tags?: string[];
}

interface WeekViewProps {
  currentDate: Date;
  dayRecords: Map<string, DayRecord>;
  todos: Todo[];
  importedEvents: ImportedEvent[];
  onDayClick?: (date: Date) => void;
  onTimeSlotClick?: (date: Date, hour: number) => void;
  onAddEvent?: (date: Date, startHour: number, startMinute: number, endHour: number, endMinute: number, title?: string) => void;
  onDeleteEvent?: (id: string, type: 'moment' | 'todo' | 'imported') => void;
  onRenameEvent?: (id: string, type: 'moment' | 'todo' | 'imported', newTitle: string) => void;
}

function getHourFromISO(iso: string): { hour: number; minute: number } {
  const d = parseISO(iso);
  return { hour: d.getHours(), minute: d.getMinutes() };
}

function getTodoDisplayTime(todo: Todo): { hour: number; minute: number; durationMinutes: number } {
  const startIso = todo.plan_started_at || todo.timer_started_at || todo.created_at;
  const start = parseISO(startIso);
  const startMin = start.getHours() * 60 + start.getMinutes();

  if (todo.plan_started_at && todo.plan_ended_at) {
    const end = parseISO(todo.plan_ended_at);
    const endMin = end.getHours() * 60 + end.getMinutes();
    return {
      hour: start.getHours(),
      minute: start.getMinutes(),
      durationMinutes: Math.max(15, endMin - startMin),
    };
  }

  if (todo.timer_started_at) {
    if (todo.timer_ended_at) {
      const end = parseISO(todo.timer_ended_at);
      const endMin = end.getHours() * 60 + end.getMinutes();
      return {
        hour: start.getHours(),
        minute: start.getMinutes(),
        durationMinutes: Math.max(15, endMin - startMin),
      };
    }

    if (todo.timer_seconds && todo.timer_seconds > 0) {
      return {
        hour: start.getHours(),
        minute: start.getMinutes(),
        durationMinutes: Math.max(15, Math.round(todo.timer_seconds / 60)),
      };
    }
  }

  return {
    hour: start.getHours(),
    minute: start.getMinutes(),
    durationMinutes: 45,
  };
}

function getMomentDisplayTime(moment: Moment): { hour: number; minute: number; durationMinutes: number } {
  const startIso = moment.timer_started_at || moment.createdAt;
  const start = parseISO(startIso);
  const startMin = start.getHours() * 60 + start.getMinutes();

  if (moment.timer_started_at && moment.timer_ended_at) {
    const end = parseISO(moment.timer_ended_at);
    const endMin = end.getHours() * 60 + end.getMinutes();
    return {
      hour: start.getHours(),
      minute: start.getMinutes(),
      durationMinutes: Math.max(15, endMin - startMin),
    };
  }

  if (moment.timer_started_at && moment.timer_seconds && moment.timer_seconds > 0) {
    return {
      hour: start.getHours(),
      minute: start.getMinutes(),
      durationMinutes: Math.max(15, Math.round(moment.timer_seconds / 60)),
    };
  }

  return {
    hour: start.getHours(),
    minute: start.getMinutes(),
    durationMinutes: 30,
  };
}

function assignColumns(events: TimeEvent[]): Array<{ event: TimeEvent; col: number; totalCols: number }> {
  if (events.length === 0) return [];
  const sorted = [...events].sort((a, b) => {
    const aStart = a.startHour * 60 + a.startMinute;
    const bStart = b.startHour * 60 + b.startMinute;
    return aStart - bStart || a.durationMinutes - b.durationMinutes;
  });

  const columns: { endMin: number }[][] = [];
  const assignments = new Map<string, { col: number }>();

  for (const ev of sorted) {
    const startMin = ev.startHour * 60 + ev.startMinute;
    const endMin = startMin + ev.durationMinutes;
    let placed = false;
    for (let c = 0; c < columns.length; c++) {
      const lastInCol = columns[c][columns[c].length - 1];
      if (lastInCol.endMin <= startMin) {
        columns[c].push({ endMin });
        assignments.set(ev.id, { col: c });
        placed = true;
        break;
      }
    }
    if (!placed) {
      columns.push([{ endMin }]);
      assignments.set(ev.id, { col: columns.length - 1 });
    }
  }

  const parent = new Map<string, string>();
  const find = (id: string): string => {
    if (!parent.has(id)) parent.set(id, id);
    if (parent.get(id) !== id) parent.set(id, find(parent.get(id)!));
    return parent.get(id)!;
  };
  const union = (a: string, b: string) => { parent.set(find(a), find(b)); };

  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const aStart = sorted[i].startHour * 60 + sorted[i].startMinute;
      const aEnd = aStart + sorted[i].durationMinutes;
      const bStart = sorted[j].startHour * 60 + sorted[j].startMinute;
      if (bStart < aEnd) union(sorted[i].id, sorted[j].id);
    }
  }

  const groups = new Map<string, string[]>();
  for (const ev of sorted) {
    const root = find(ev.id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(ev.id);
  }

  const groupMaxCols = new Map<string, number>();
  for (const [root, ids] of groups) {
    let maxCol = 0;
    for (const id of ids) maxCol = Math.max(maxCol, assignments.get(id)!.col);
    groupMaxCols.set(root, maxCol + 1);
  }

  return sorted.map(ev => ({
    event: ev,
    col: assignments.get(ev.id)!.col,
    totalCols: groupMaxCols.get(find(ev.id))!,
  }));
}

export function WeekView({ currentDate, dayRecords, todos, importedEvents, onDayClick, onTimeSlotClick, onAddEvent, onDeleteEvent, onRenameEvent }: WeekViewProps) {
  const { lang } = useLanguage();
  const isDarkMode = useIsDarkMode();
  const { getWorkType } = useWorkTypes();
  const weekStart = startOfWeek(currentDate);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const scrollRef = useRef<HTMLDivElement>(null);
  const initialScrollAnchorRef = useRef<HTMLDivElement>(null);
  const [dragCreate, setDragCreate] = useState<{ day: Date; startMin: number; endMin: number } | null>(null);
  const isCreatingRef = useRef(false);
  const [draftRange, setDraftRange] = useState<{ day: Date; startMin: number; endMin: number } | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const draftInputRef = useRef<HTMLInputElement>(null);
  const [selectedEvent, setSelectedEvent] = useState<TimeEvent | null>(null);
  const [selectedEventDate, setSelectedEventDate] = useState<string | null>(null);

  const dayEventsMap = useMemo(() => {
    const map = new Map<string, TimeEvent[]>();
    weekDays.forEach(day => {
      const dateStr = format(day, 'yyyy-MM-dd');
      const events: TimeEvent[] = [];

      importedEvents
        .filter(e => format(parseISO(e.start_time), 'yyyy-MM-dd') === dateStr)
        .forEach(e => {
          const start = getHourFromISO(e.start_time);
          let duration = 60;
          if (e.end_time) {
            const end = getHourFromISO(e.end_time);
            duration = Math.max(30, (end.hour * 60 + end.minute) - (start.hour * 60 + start.minute));
          }
          events.push({
            id: e.id, title: e.title,
            startHour: start.hour, startMinute: start.minute,
            durationMinutes: duration,
            color: getActivityAccentColor({ title: e.title, fallback: 'hsl(var(--accent))', isDarkMode }) || 'hsl(var(--accent))',
            type: 'imported',
            location: e.location || undefined,
            description: e.description || undefined,
          });
        });

      todos
        // Only place todos that have a real time anchor (planned or tracked) on the
        // grid. Unscheduled backlog tasks have no time and would otherwise stack at
        // their creation time.
        .filter(t => t.date === dateStr && !t.date.startsWith('_due_') && (t.plan_started_at || t.timer_started_at))
        .forEach(t => {
          const display = getTodoDisplayTime(t);
          const workType = getWorkType({ entity: 'todo', id: t.id, title: t.title, tags: t.tags });
          const color = getActivityAccentColor({ title: t.title, tags: t.tags, isDarkMode })
            || WORK_TYPE_META[workType]?.color
            || 'hsl(var(--primary))';
          events.push({
            id: t.id, title: t.title,
            startHour: display.hour, startMinute: display.minute,
            durationMinutes: display.durationMinutes,
            color,
            type: 'todo',
            tags: t.tags,
          });
        });

      const record = dayRecords.get(dateStr);
      if (record) {
        record.moments.forEach(m => {
          const display = getMomentDisplayTime(m);
          const title = m.text || m.emoji || '';
          const workType = getWorkType({ entity: 'moment', id: m.id, text: title, tags: m.tags });
          const color = getActivityAccentColor({ title, tags: m.tags, isDarkMode })
            || WORK_TYPE_META[workType]?.color
            || '#D5AE4C';
          events.push({
            id: m.id, title: title || '·',
            startHour: display.hour, startMinute: display.minute,
            durationMinutes: display.durationMinutes,
            color,
            hasPhotos: m.photos && m.photos.length > 0,
            type: 'moment',
            emoji: m.emoji,
            photos: m.photos?.length > 0 ? m.photos : undefined,
            location: m.location?.name,
            tags: m.tags,
          });
        });
      }

      map.set(dateStr, events);
    });

    return map;
  }, [weekDays, dayRecords, todos, importedEvents, isDarkMode, getWorkType]);

  const nowHour = new Date().getHours();
  const nowMinute = new Date().getMinutes();

  const clientYToMinute = useCallback((clientY: number) => {
    if (!scrollRef.current) return 0;
    const rect = scrollRef.current.getBoundingClientRect();
    const y = clientY - rect.top + scrollRef.current.scrollTop;
    const totalMin = Math.round((y / HOUR_HEIGHT) * 60);
    return Math.max(0, Math.min(24 * 60 - 15, Math.round(totalMin / 15) * 15));
  }, []);

  // Auto-scroll to current time on mount / week switch
  const weekKey = format(weekStart, 'yyyy-MM-dd');
  useLayoutEffect(() => {
    const applyScroll = () => {
      if (!scrollRef.current || !initialScrollAnchorRef.current) return;
      const now = new Date();
      const currentHour = now.getHours();
      const currentMin = now.getMinutes();
      const targetHour = Math.max(6, currentHour - 1) + currentMin / 60;
      const targetTop = Math.max(0, targetHour * HOUR_HEIGHT);
      initialScrollAnchorRef.current.style.top = `${targetTop}px`;
      initialScrollAnchorRef.current.scrollIntoView({ block: 'start', inline: 'nearest' });
    };

    const timers = [
      window.setTimeout(applyScroll, 0),
      window.setTimeout(applyScroll, 0),
      window.setTimeout(applyScroll, 60),
      window.setTimeout(applyScroll, 180),
      window.setTimeout(applyScroll, 360),
      window.setTimeout(applyScroll, 720),
    ];
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [weekKey]);

  const handleColumnPointerDown = (day: Date, e: React.PointerEvent) => {
    if (draftRange) return; // Don't start new drag while popover is open
    if (!onAddEvent) {
      onTimeSlotClick?.(day, 9);
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    const minute = clientYToMinute(e.clientY);
    setDragCreate({ day, startMin: minute, endMin: minute });
    isCreatingRef.current = true;
  };

  const confirmWeekDraft = () => {
    if (!draftRange || !onAddEvent) return;
    const title = draftTitle.trim() || (lang === 'zh' ? '新建日程' : 'New Event');
    onAddEvent(draftRange.day, Math.floor(draftRange.startMin / 60), draftRange.startMin % 60, Math.floor(draftRange.endMin / 60), draftRange.endMin % 60, title);
    setDraftRange(null);
    setDraftTitle('');
  };

  const cancelWeekDraft = () => {
    setDraftRange(null);
    setDraftTitle('');
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      {/* Time grid */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto">
        <div
          className="relative"
          style={{ height: `${24 * HOUR_HEIGHT}px` }}
          onPointerMove={(e) => {
            if (!isCreatingRef.current || !dragCreate) return;
            const minute = clientYToMinute(e.clientY);
            setDragCreate(prev => prev ? { ...prev, endMin: minute } : prev);
          }}
          onPointerUp={() => {
            if (!isCreatingRef.current || !dragCreate) return;
            const startMin = Math.min(dragCreate.startMin, dragCreate.endMin);
            const endMin = Math.max(dragCreate.startMin, dragCreate.endMin);
            isCreatingRef.current = false;
            if (endMin - startMin >= 15 && onAddEvent) {
              setDraftRange({ day: dragCreate.day, startMin, endMin });
              setDraftTitle('');
              setDragCreate(null);
              setTimeout(() => draftInputRef.current?.focus(), 100);
            } else {
              onTimeSlotClick?.(dragCreate.day, Math.floor(startMin / 60));
              setDragCreate(null);
            }
          }}
        >
          <div
            ref={initialScrollAnchorRef}
            className="pointer-events-none absolute left-0 right-0 h-px opacity-0"
            style={{ top: 0 }}
            aria-hidden="true"
          />
          {HOURS.map(hour => (
            <div
              key={hour}
              className="absolute left-0 right-0 flex"
              style={{ top: `${hour * HOUR_HEIGHT}px`, height: `${HOUR_HEIGHT}px` }}
            >
              <div className="w-12 flex-shrink-0 pr-1 -mt-2 text-right">
                <span className="text-[10px] text-muted-foreground font-mono">
                  {hour === 0 ? '' : format(new Date(2000, 0, 1, hour), 'h a')}
                </span>
              </div>
              <div className="flex-1 border-t border-border/20" />
            </div>
          ))}

          <div className="absolute left-12 right-0 top-0 bottom-0 flex">
            {weekDays.map(day => {
              const dateStr = format(day, 'yyyy-MM-dd');
              const events = dayEventsMap.get(dateStr) || [];
              const positioned = assignColumns(events);
              const dayIsToday = isToday(day);

              return (
                <div
                  key={dateStr}
                  className={cn(
                    'flex-1 relative border-l border-border/20',
                    dayIsToday && 'bg-primary/5'
                  )}
                  onPointerDown={(e) => handleColumnPointerDown(day, e)}
                >
                  {positioned.map(({ event: e, col, totalCols }) => {
                    const topPx = (e.startHour * 60 + e.startMinute) / 60 * HOUR_HEIGHT;
                    const heightPx = Math.max(16, e.durationMinutes / 60 * HOUR_HEIGHT);
                    const widthPct = 100 / totalCols;
                    const leftPct = col * widthPct;
                    const widthPx = `calc(${widthPct}% - 2px)`;
                    const hasPhoto = !!e.photos?.[0];
                    const showPhotoThumb = hasPhoto && heightPx >= 18;
                    const showPhotoCover = hasPhoto && heightPx >= 34;
                    const thumbSize = heightPx >= 84 ? 40 : heightPx >= 56 ? 28 : 18;

                    return (
                      <div
                        key={e.id}
                        className="absolute overflow-hidden z-10 cursor-pointer rounded-[14px] px-1.5 py-1 transition-all hover:brightness-[1.02]"
                        style={{
                          top: `${topPx}px`,
                          height: `${heightPx}px`,
                          left: `calc(${leftPct}% + 1px)`,
                          width: widthPx,
                          ...getCalendarBlockChrome(e.color, isDarkMode),
                        }}
                        onPointerDown={(ev) => ev.stopPropagation()}
                        onClick={(ev) => { ev.stopPropagation(); setSelectedEvent(e); setSelectedEventDate(dateStr); }}
                      >
                        {showPhotoCover && (
                          <>
                            <StorageImage
                              src={e.photos?.[0]}
                              alt={e.title}
                              className="absolute inset-0 h-full w-full object-cover opacity-25"
                            />
                            <div className="absolute inset-0 bg-background/55" />
                          </>
                        )}
                        <div className="relative z-10 flex items-start gap-1">
                          {showPhotoThumb && (
                            <StorageImage
                              src={e.photos?.[0]}
                              alt={e.title}
                              className="rounded-[6px] object-cover flex-shrink-0 border border-white/60"
                              style={{ width: thumbSize, height: thumbSize }}
                            />
                          )}
                          <p
                            className="min-w-0 truncate leading-tight"
                            style={{
                              fontSize: '10px',
                              fontWeight: 500,
                              color: getActivityTextColor(e.color, isDarkMode, 'strong'),
                            }}
                          >
                            {e.title}
                          </p>
                        </div>
                      </div>
                    );
                  })}

                  {dragCreate && format(dragCreate.day, 'yyyy-MM-dd') === dateStr && (() => {
                    const startMin = Math.min(dragCreate.startMin, dragCreate.endMin);
                    const endMin = Math.max(dragCreate.startMin, dragCreate.endMin);
                    const topPx = (startMin / 60) * HOUR_HEIGHT;
                    const heightPx = Math.max(15, ((endMin - startMin) / 60) * HOUR_HEIGHT);
                    return (
                      <div
                        className="absolute left-1 right-1 bg-primary/5 border border-dashed border-primary/40 rounded-lg z-20 pointer-events-none"
                        style={{ top: `${topPx}px`, height: `${heightPx}px` }}
                      >
                        <p className="text-[9px] text-primary/50 font-medium px-1 pt-0.5 truncate">
                          {lang === 'zh' ? '新建日程' : 'New event'}
                        </p>
                      </div>
                    );
                  })()}

                  {/* Draft event popover */}
                  {draftRange && format(draftRange.day, 'yyyy-MM-dd') === dateStr && (() => {
                    const topPx = (draftRange.startMin / 60) * HOUR_HEIGHT;
                    const heightPx = Math.max(15, ((draftRange.endMin - draftRange.startMin) / 60) * HOUR_HEIGHT);
                    const startTime = format(new Date(2000, 0, 1, Math.floor(draftRange.startMin / 60), draftRange.startMin % 60), 'h:mm a');
                    const endTime = format(new Date(2000, 0, 1, Math.floor(draftRange.endMin / 60), draftRange.endMin % 60), 'h:mm a');
                    return (
                      <>
                        <div
                          className="absolute left-0 right-0 bg-primary/15 border-l-3 border-primary rounded-md z-20 pointer-events-none"
                          style={{ top: `${topPx}px`, height: `${heightPx}px` }}
                        />
                        <div
                          className="absolute left-0 z-30 bg-card border border-border shadow-xl rounded-xl p-2.5 space-y-1.5"
                          style={{ top: `${topPx + heightPx + 4}px`, width: '200px' }}
                          onPointerDown={e => e.stopPropagation()}
                        >
                          <p className="text-[10px] text-muted-foreground font-mono">{startTime} – {endTime}</p>
                          <input
                            ref={draftInputRef}
                            value={draftTitle}
                            onChange={e => setDraftTitle(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter' && !e.nativeEvent.isComposing) confirmWeekDraft();
                              if (e.key === 'Escape') cancelWeekDraft();
                            }}
                            placeholder={lang === 'zh' ? '日程标题...' : 'Event title...'}
                            className="w-full bg-secondary/50 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/30 placeholder:text-muted-foreground/50"
                            autoFocus
                          />
                          <div className="flex items-center gap-1.5 justify-end">
                            <button onClick={cancelWeekDraft} className="text-[11px] px-2 py-1 rounded-md text-muted-foreground hover:bg-secondary transition-colors">
                              {lang === 'zh' ? '取消' : 'Cancel'}
                            </button>
                            <button onClick={confirmWeekDraft} className="text-[11px] px-2 py-1 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium">
                              {lang === 'zh' ? '创建' : 'Create'}
                            </button>
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>
              );
            })}
          </div>

          {/* Now indicator */}
          {weekDays.some(d => isToday(d)) && (
            <div
              className="absolute left-12 right-0 flex items-center z-20 pointer-events-none"
              style={{ top: `${(nowHour * 60 + nowMinute) / 60 * HOUR_HEIGHT}px` }}
            >
              <div className="w-2.5 h-2.5 rounded-full bg-destructive -ml-1.5" />
              <div className="flex-1 h-[2px] bg-destructive" />
            </div>
          )}
        </div>
      </div>
      {/* Click outside to cancel draft */}
      {draftRange && (
        <div className="fixed inset-0 z-20" onClick={cancelWeekDraft} onPointerDown={e => e.stopPropagation()} />
      )}

      {/* Event detail popup */}
      {selectedEvent && (
        <EventDetailPopup
          event={selectedEvent}
          eventDate={selectedEventDate ?? undefined}
          onClose={() => { setSelectedEvent(null); setSelectedEventDate(null); }}
          onDelete={onDeleteEvent}
          onRename={onRenameEvent}
        />
      )}
    </div>
  );
}
