import { useMemo, useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import { format, parseISO, isToday } from 'date-fns';
import { cn } from '@/lib/utils';
import { DayRecord, Moment } from '@/types';
import { Todo } from '@/hooks/useTodos';
import { ImportedEvent } from '@/hooks/useImportedEvents';
import { useLanguage } from '@/hooks/useLanguage';
import { Image as ImageIcon } from 'lucide-react';
import { EventDetailPopup } from '@/components/Calendar/EventDetailPopup';
import { useIsDarkMode } from '@/hooks/useIsDarkMode';
import { getActivityAccentColor, getActivityTextColor, getCalendarBlockChrome } from '@/lib/activityColors';
import { useWorkTypes } from '@/hooks/useWorkTypes';
import { WORK_TYPE_META } from '@/lib/workType';
import { StorageImage } from "@/components/StorageImage";

const DETAIL_SEPARATOR = '\n---DETAIL---\n';
function getSubtitle(text?: string | null): string {
  if (!text) return '';
  const idx = text.indexOf(DETAIL_SEPARATOR);
  return idx === -1 ? text : text.substring(0, idx);
}

const WEEKDAYS_CN = ['日', '一', '二', '三', '四', '五', '六'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const HOUR_HEIGHT = 60; // px per hour

interface TimeEvent {
  id: string;
  title: string;
  startHour: number;
  startMinute: number;
  durationMinutes: number;
  color: string;
  type: 'moment' | 'todo' | 'imported';
  tags?: string[];
  emoji?: string;
  photos?: string[];
  location?: string;
  description?: string;
}

interface DayViewProps {
  date: Date;
  dayRecords: Map<string, DayRecord>;
  todos: Todo[];
  importedEvents: ImportedEvent[];
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

function assignColumns(events: TimeEvent[]) {
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


export function DayView({ date, dayRecords, todos, importedEvents, onTimeSlotClick, onAddEvent, onDeleteEvent, onRenameEvent }: DayViewProps) {
  const { lang } = useLanguage();
  const isDarkMode = useIsDarkMode();
  const { getWorkType } = useWorkTypes();
  const dateStr = format(date, 'yyyy-MM-dd');
  const scrollRef = useRef<HTMLDivElement>(null);
  const initialScrollAnchorRef = useRef<HTMLDivElement>(null);
  const [selectedEvent, setSelectedEvent] = useState<TimeEvent | null>(null);

  // Drag-to-create state
  const [dragStart, setDragStart] = useState<number | null>(null);
  const [dragEnd, setDragEnd] = useState<number | null>(null);
  const isDragging = useRef(false);

  // Draft event popover state
  const [draftRange, setDraftRange] = useState<{ startMin: number; endMin: number } | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const draftInputRef = useRef<HTMLInputElement>(null);

  const timeEvents = useMemo(() => {
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
      .filter(t => t.date === dateStr && !t.date.startsWith('_due_'))
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
        const mSubtitle = getSubtitle(m.text) || m.emoji || 'Moment';
        const workType = getWorkType({ entity: 'moment', id: m.id, text: mSubtitle, tags: m.tags });
        const color = getActivityAccentColor({ title: mSubtitle, tags: m.tags, isDarkMode })
          || WORK_TYPE_META[workType]?.color
          || '#D5AE4C';
        events.push({
          id: m.id, title: mSubtitle,
          startHour: display.hour, startMinute: display.minute,
          durationMinutes: display.durationMinutes,
          color,
          type: 'moment',
          tags: m.tags,
          emoji: m.emoji,
          photos: m.photos?.length > 0 ? m.photos : undefined,
          location: m.location?.name,
        });
      });
    }

    return events;
  }, [dateStr, dayRecords, todos, importedEvents, isDarkMode, getWorkType]);

  const positioned = useMemo(() => assignColumns(timeEvents), [timeEvents]);

  const nowHour = new Date().getHours();
  const nowMinute = new Date().getMinutes();
  const showNowLine = isToday(date);

  // Auto-scroll to current time on mount / date switch
  useLayoutEffect(() => {
    const applyScroll = () => {
      if (!scrollRef.current || !initialScrollAnchorRef.current) return;
      const now = new Date();
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();
      const viewportHeight = scrollRef.current.clientHeight || 400;

      let targetPx: number;
      if (showNowLine) {
        const nowPx = (currentHour + currentMinute / 60) * HOUR_HEIGHT;
        targetPx = nowPx - viewportHeight * 0.35;
      } else {
        const firstEvent = timeEvents.length > 0
          ? timeEvents.reduce((a, b) => (a.startHour * 60 + a.startMinute) < (b.startHour * 60 + b.startMinute) ? a : b)
          : null;
        targetPx = firstEvent ? Math.max(0, firstEvent.startHour * HOUR_HEIGHT - viewportHeight * 0.2) : 8 * HOUR_HEIGHT;
      }

      initialScrollAnchorRef.current.style.top = `${Math.max(0, targetPx)}px`;
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
  }, [dateStr, showNowLine, timeEvents.length]);

  // Drag-to-create handlers
  const getMinuteFromY = useCallback((clientY: number) => {
    if (!scrollRef.current) return 0;
    const rect = scrollRef.current.getBoundingClientRect();
    const scrollTop = scrollRef.current.scrollTop;
    const y = clientY - rect.top + scrollTop;
    const totalMin = Math.round(y / HOUR_HEIGHT * 60);
    return Math.max(0, Math.min(24 * 60 - 15, Math.round(totalMin / 15) * 15));
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (draftRange) return; // Don't start new drag while popover is open
    const min = getMinuteFromY(e.clientY);
    setDragStart(min);
    setDragEnd(min + 30);
    isDragging.current = true;
  }, [getMinuteFromY, draftRange]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current || dragStart === null) return;
    const min = getMinuteFromY(e.clientY);
    setDragEnd(min);
  }, [dragStart, getMinuteFromY]);

  const handlePointerUp = useCallback(() => {
    if (!isDragging.current || dragStart === null || dragEnd === null) {
      isDragging.current = false;
      setDragStart(null);
      setDragEnd(null);
      return;
    }
    isDragging.current = false;
    const startMin = Math.min(dragStart, dragEnd);
    const endMin = Math.max(dragStart, dragEnd);
    if (endMin - startMin >= 15 && onAddEvent) {
      // Show draft popover instead of creating immediately
      setDraftRange({ startMin, endMin });
      setDraftTitle('');
      setTimeout(() => draftInputRef.current?.focus(), 100);
    }
    setDragStart(null);
    setDragEnd(null);
  }, [dragStart, dragEnd, onAddEvent]);

  const confirmDraft = useCallback(() => {
    if (!draftRange || !onAddEvent) return;
    const title = draftTitle.trim() || (lang === 'zh' ? '新建日程' : 'New Event');
    onAddEvent(date, Math.floor(draftRange.startMin / 60), draftRange.startMin % 60, Math.floor(draftRange.endMin / 60), draftRange.endMin % 60, title);
    setDraftRange(null);
    setDraftTitle('');
  }, [draftRange, draftTitle, date, onAddEvent, lang]);

  const cancelDraft = useCallback(() => {
    setDraftRange(null);
    setDraftTitle('');
  }, []);

  const dragTopPx = dragStart !== null && dragEnd !== null
    ? (Math.min(dragStart, dragEnd) / 60) * HOUR_HEIGHT
    : 0;
  const dragHeightPx = dragStart !== null && dragEnd !== null
    ? (Math.abs(dragEnd - dragStart) / 60) * HOUR_HEIGHT
    : 0;

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      {/* Time grid */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto">
        <div
          className="relative select-none"
          style={{ height: `${24 * HOUR_HEIGHT}px` }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          <div
            ref={initialScrollAnchorRef}
            className="pointer-events-none absolute left-0 right-0 h-px opacity-0"
            style={{ top: 0 }}
            aria-hidden="true"
          />
          {/* Hour lines */}
          {HOURS.map(hour => (
            <div
              key={hour}
              className="absolute left-0 right-0 flex"
              style={{ top: `${hour * HOUR_HEIGHT}px`, height: `${HOUR_HEIGHT}px` }}
            >
              <div className="w-14 flex-shrink-0 pr-2 -mt-2 text-right">
                <span className="text-[10px] text-muted-foreground font-mono">
                  {hour === 0 ? '' : format(new Date(2000, 0, 1, hour), 'h a')}
                </span>
              </div>
              <div className="flex-1 border-t border-border/20" />
            </div>
          ))}

          {/* Event blocks */}
          <div className="absolute left-14 right-2 top-0 bottom-0">
            {positioned.map(({ event: e, col, totalCols }) => {
              const topPx = (e.startHour * 60 + e.startMinute) / 60 * HOUR_HEIGHT;
              const heightPx = Math.max(28, (e.durationMinutes / 60) * HOUR_HEIGHT);
              const widthPct = 100 / totalCols;
              const leftPct = col * widthPct;
              const hasPhotos = e.photos && e.photos.length > 0;
              const compactCard = heightPx < 48;
              const titleClamp = heightPx >= 54;
              const canShowPhotoThumb = Boolean(hasPhotos && heightPx >= 44);
              const photoThumbSize = heightPx >= 64 ? 'h-12 w-12' : 'h-8 w-8';

              const showPhotoCover = Boolean(hasPhotos && heightPx >= 34);
              const showPhotoThumb = Boolean(hasPhotos && !showPhotoCover && heightPx >= 18);
              const thumbSizePx = heightPx >= 84 ? 48 : heightPx >= 56 ? 32 : 20;

              return (
                <div
                  key={e.id}
                  className="absolute rounded-[10px] px-2 py-1 overflow-hidden z-10 cursor-pointer hover:brightness-[1.02] transition-all"
                  style={{
                    top: `${topPx}px`,
                    height: `${heightPx}px`,
                    left: `calc(${leftPct}% + 1px)`,
                    width: `calc(${widthPct}% - 2px)`,
                    ...getCalendarBlockChrome(e.color, isDarkMode),
                  }}
                  onClick={(ev) => { ev.stopPropagation(); setSelectedEvent(e); }}
                  onPointerDown={(ev) => ev.stopPropagation()}
                >
                  {showPhotoCover && (
                    <>
                      {e.photos?.[0] ? <StorageImage src={e.photos[0]} alt="" className="absolute inset-0 h-full w-full object-cover opacity-25" /> : null}
                      <div className="absolute inset-0 bg-background/55" />
                    </>
                  )}
                  <div className="relative z-10 flex items-start gap-1.5">
                    {showPhotoThumb && e.photos?.[0] ? (
                      <StorageImage
                        src={e.photos[0]}
                        alt=""
                        className="flex-shrink-0 rounded-md object-cover border border-white/60"
                        style={{ width: thumbSizePx, height: thumbSizePx }}
                      />
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <p
                        className="min-w-0 leading-[1.15] overflow-hidden"
                        style={{
                          fontSize: compactCard ? '11px' : '12px',
                          fontWeight: 500,
                          color: getActivityTextColor(e.color, isDarkMode, 'strong'),
                          display: titleClamp ? '-webkit-box' : 'block',
                          WebkitLineClamp: titleClamp ? 2 : 'unset',
                          WebkitBoxOrient: titleClamp ? 'vertical' : 'unset',
                          whiteSpace: titleClamp ? 'normal' : 'nowrap',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {e.title}
                      </p>
                      <p style={{ fontSize: compactCard ? '9px' : '10px', color: getActivityTextColor(e.color, isDarkMode, 'soft'), opacity: 0.7 }}>
                        {format(new Date(2000, 0, 1, e.startHour, e.startMinute), 'h:mm a')}
                        {e.durationMinutes > 0 && ` – ${format(new Date(2000, 0, 1, e.startHour, e.startMinute + e.durationMinutes), 'h:mm a')}`}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Drag preview */}
            {dragStart !== null && dragEnd !== null && Math.abs(dragEnd - dragStart) >= 15 && (
              <div
                className="absolute left-0 right-0 bg-primary/20 border-2 border-primary/40 border-dashed rounded-lg z-20 pointer-events-none flex items-center justify-center"
                style={{ top: `${dragTopPx}px`, height: `${Math.max(dragHeightPx, 15)}px` }}
              >
                <span className="text-xs text-primary font-medium">
                  {format(new Date(2000, 0, 1, Math.floor(Math.min(dragStart, dragEnd) / 60), Math.min(dragStart, dragEnd) % 60), 'h:mm a')}
                  {' – '}
                  {format(new Date(2000, 0, 1, Math.floor(Math.max(dragStart, dragEnd) / 60), Math.max(dragStart, dragEnd) % 60), 'h:mm a')}
                </span>
              </div>
            )}

            {/* Draft event popover */}
            {draftRange && (() => {
              const topPx = (draftRange.startMin / 60) * HOUR_HEIGHT;
              const heightPx = Math.max(28, ((draftRange.endMin - draftRange.startMin) / 60) * HOUR_HEIGHT);
              const startTime = format(new Date(2000, 0, 1, Math.floor(draftRange.startMin / 60), draftRange.startMin % 60), 'h:mm a');
              const endTime = format(new Date(2000, 0, 1, Math.floor(draftRange.endMin / 60), draftRange.endMin % 60), 'h:mm a');
              return (
                <>
                  {/* Highlight block */}
                  <div
                    className="absolute left-0 right-0 bg-primary/15 border-l-3 border-primary rounded-md z-20 pointer-events-none"
                    style={{ top: `${topPx}px`, height: `${heightPx}px` }}
                  />
                  {/* Editor popover */}
                  <div
                    className="absolute left-2 right-2 z-30 bg-card border border-border shadow-xl rounded-xl p-3 space-y-2"
                    style={{ top: `${topPx + heightPx + 4}px` }}
                    onPointerDown={e => e.stopPropagation()}
                  >
                    <p className="text-[11px] text-muted-foreground font-mono">{startTime} – {endTime}</p>
                    <input
                      ref={draftInputRef}
                      value={draftTitle}
                      onChange={e => setDraftTitle(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && !e.nativeEvent.isComposing) confirmDraft();
                        if (e.key === 'Escape') cancelDraft();
                      }}
                      placeholder={lang === 'zh' ? '输入日程标题...' : 'Event title...'}
                      className="w-full bg-secondary/50 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/30 placeholder:text-muted-foreground/50"
                      autoFocus
                    />
                    <div className="flex items-center gap-2 justify-end">
                      <button onClick={cancelDraft} className="text-xs px-3 py-1.5 rounded-lg text-muted-foreground hover:bg-secondary transition-colors">
                        {lang === 'zh' ? '取消' : 'Cancel'}
                      </button>
                      <button onClick={confirmDraft} className="text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium">
                        {lang === 'zh' ? '创建' : 'Create'}
                      </button>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>

          {/* Now indicator */}
          {showNowLine && (
            <div
              className="absolute left-14 right-0 flex items-center z-20 pointer-events-none"
              style={{ top: `${(nowHour * 60 + nowMinute) / (24 * 60) * 24 * HOUR_HEIGHT}px` }}
            >
              <div className="w-2.5 h-2.5 rounded-full bg-destructive -ml-1.5" />
              <div className="flex-1 h-[2px] bg-destructive" />
            </div>
          )}
        </div>
      </div>

      {/* Click outside to cancel draft */}
      {draftRange && (
        <div className="fixed inset-0 z-20" onClick={cancelDraft} onPointerDown={e => e.stopPropagation()} />
      )}

      {/* Event detail popup */}
      {selectedEvent && (
        <EventDetailPopup
          event={selectedEvent}
          eventDate={format(date, 'yyyy-MM-dd')}
          onClose={() => setSelectedEvent(null)}
          onDelete={onDeleteEvent}
          onRename={onRenameEvent}
        />
      )}
    </div>
  );
}
