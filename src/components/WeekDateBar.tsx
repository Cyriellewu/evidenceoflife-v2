import { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import { format, startOfWeek, addDays, addWeeks, isSameDay, isToday, parseISO } from 'date-fns';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDateLocale } from '@/hooks/useDateLocale';
import { useLanguage } from '@/hooks/useLanguage';

interface WeekDateBarProps {
  selectedDate: Date;
  onDateSelect: (date: Date) => void;
  recordedDates?: Set<string>;
  // Drag/drop support
  onTaskMove?: (taskId: string, newDate: string) => Promise<void> | void;
}

type DragTaskDetail = { taskId: string; taskDate: string };
type TaskMovedDetail = { taskId: string; oldDate: string; newDate: string };

const SWIPE_THRESHOLD = 40;

export function WeekDateBar({ selectedDate, onDateSelect, recordedDates, onTaskMove }: WeekDateBarProps) {
  const { formatDate } = useDateLocale();
  const { lang } = useLanguage();
  const [animState, setAnimState] = useState<'idle' | 'out-left' | 'out-right' | 'in-left' | 'in-right'>('idle');
  const lockRef = useRef(false);
  const accumRef = useRef(0);
  const wheelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // browseDate drives which week is shown; navigating prev/next only changes this,
  // NOT selectedDate — so PlanView below doesn't refresh while the user browses.
  const [browseDate, setBrowseDate] = useState(() => selectedDate);

  // Keep browseDate in sync only when selectedDate changes externally (e.g. "today" button)
  const prevSelectedRef = useRef(selectedDate);
  useEffect(() => {
    if (!isSameDay(selectedDate, prevSelectedRef.current)) {
      prevSelectedRef.current = selectedDate;
      setBrowseDate(selectedDate);
    }
  }, [selectedDate]);

  useEffect(() => {
    return () => {
      if (wheelTimer.current) clearTimeout(wheelTimer.current);
    };
  }, []);

  const weekDays = useMemo(() => {
    const start = startOfWeek(browseDate, { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [browseDate]);

  const [hoverDateStr, setHoverDateStr] = useState<string | null>(null);
  const [successDateStr, setSuccessDateStr] = useState<string | null>(null);
  const [dragTask, setDragTask] = useState<DragTaskDetail | null>(null);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const handleDragStart = (event: Event) => {
      const customEvent = event as CustomEvent<DragTaskDetail>;
      setDragTask(customEvent.detail || null);
    };
    const handleDragEnd = () => {
      setDragTask(null);
      setHoverDateStr(null);
    };
    window.addEventListener('plan-task-drag-start', handleDragStart as EventListener);
    window.addEventListener('plan-task-drag-end', handleDragEnd);
    return () => {
      window.removeEventListener('plan-task-drag-start', handleDragStart as EventListener);
      window.removeEventListener('plan-task-drag-end', handleDragEnd);
    };
  }, []);

  const navigate = useCallback((direction: 'next' | 'prev') => {
    if (lockRef.current) return;
    lockRef.current = true;

    setAnimState(direction === 'next' ? 'out-left' : 'out-right');

    setTimeout(() => {
      setBrowseDate(prev => addWeeks(prev, direction === 'next' ? 1 : -1));

      setAnimState(direction === 'next' ? 'in-left' : 'in-right');

      setTimeout(() => {
        setAnimState('idle');
        lockRef.current = false;
      }, 180);
    }, 160);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (lockRef.current) return;
    if (Math.abs(e.deltaX) < Math.abs(e.deltaY) * 1.2) return;
    if (Math.abs(e.deltaX) < 6) return;

    e.preventDefault();
    e.stopPropagation();

    accumRef.current += e.deltaX;

    if (wheelTimer.current) clearTimeout(wheelTimer.current);
    wheelTimer.current = setTimeout(() => {
      accumRef.current = 0;
    }, 160);

    if (Math.abs(accumRef.current) >= SWIPE_THRESHOLD) {
      if (accumRef.current > 0) {
        navigate('next');
      }
      accumRef.current = 0;
    }
  }, [navigate]);

  const animClass =
    animState === 'out-left' ? 'week-slide-out-left' :
    animState === 'out-right' ? 'week-slide-out-right' :
    animState === 'in-left' ? 'week-slide-in-left' :
    animState === 'in-right' ? 'week-slide-in-right' :
    '';

  return (
    <div className="flex items-center gap-1 px-1 sm:px-2">
      <button
        type="button"
        onClick={() => navigate('prev')}
        className="flex h-3 w-3 flex-shrink-0 items-center justify-center rounded-full text-muted-foreground/55 hover:bg-muted/25 hover:text-foreground transition-colors"
        aria-label="Previous week"
      >
        <ChevronLeft size={15} />
      </button>

      <div
        className="min-w-0 flex-1 overflow-x-auto"
        style={{
          overscrollBehaviorX: 'contain',
          WebkitOverflowScrolling: 'touch',
          touchAction: 'pan-y',
        }}
        onWheel={handleWheel}
      >
        <div
          key={format(weekDays[0], 'yyyy-MM-dd')}
          className={cn('flex items-center justify-between px-1 py-0.5', animClass)}
        >
          {weekDays.map(day => {
            const isCurrentDay = isToday(day);
            const isSelected = isSameDay(day, selectedDate);
            const dateStr = format(day, 'yyyy-MM-dd');
            const hasRecord = recordedDates?.has(dateStr);
            const isHoverValid = hoverDateStr === dateStr;
            const isSuccess = successDateStr === dateStr;

            return (
              <button
                key={dateStr}
                onClick={() => onDateSelect(day)}
                onDragEnter={(e: React.DragEvent) => {
                  try {
                    if (!dragTask?.taskId || !dragTask.taskDate) return;
                    const oldDate = parseISO(dragTask.taskDate);
                    if (!isSameDay(oldDate, parseISO(dateStr))) {
                      e.preventDefault();
                      setHoverDateStr(dateStr);
                    }
                  } catch (err) {
                    // ignore
                  }
                }}
                onDragOver={(e: React.DragEvent) => {
                  try {
                    if (!dragTask?.taskId || !dragTask.taskDate) return;
                    const oldDate = parseISO(dragTask.taskDate);
                    if (!isSameDay(oldDate, parseISO(dateStr))) {
                      e.preventDefault();
                      setHoverDateStr(dateStr);
                    }
                  } catch (err) {
                    // ignore
                  }
                }}
                onDragLeave={() => { setHoverDateStr(null); }}
                onDrop={async (e: React.DragEvent) => {
                  try {
                    const taskId = dragTask?.taskId || e.dataTransfer.getData('text/plain');
                    const taskDate = dragTask?.taskDate || e.dataTransfer.getData('text/date');
                    if (!taskId || !taskDate) return;
                    const oldDate = parseISO(taskDate);
                    const newDate = parseISO(dateStr);
                    if (!isSameDay(oldDate, newDate)) {
                      e.preventDefault();
                      e.stopPropagation();
                      setHoverDateStr(null);
                      await onTaskMove?.(taskId, dateStr);
                      window.dispatchEvent(new CustomEvent<TaskMovedDetail>('plan-task-date-moved', {
                        detail: {
                          taskId,
                          oldDate: format(oldDate, 'yyyy-MM-dd'),
                          newDate: dateStr,
                        },
                      }));
                      if (successTimerRef.current) clearTimeout(successTimerRef.current);
                      setSuccessDateStr(dateStr);
                      successTimerRef.current = setTimeout(() => {
                        setSuccessDateStr(null);
                      }, 1100);
                      setDragTask(null);
                      window.dispatchEvent(new Event('plan-task-drag-end'));
                    }
                  } catch (err) {
                    // ignore
                  }
                }}
                className={cn(
                  'group relative flex min-w-[38px] flex-col items-center rounded-xl px-1.5 py-1 transition-all',
                  isCurrentDay
                    ? 'bg-muted/35'
                    : 'hover:bg-muted/30',
                  isHoverValid ? 'ring-2 ring-primary/50 bg-primary/8' : '',
                  isSuccess ? 'bg-primary/10' : ''
                )}
              >
                {isHoverValid && (
                  <div className="absolute inset-0 rounded-xl border-2 border-dashed border-primary/65 pointer-events-none animate-pulse" />
                )}
                {isSuccess && (
                  <div className="absolute -top-1.5 left-1/2 z-10 -translate-x-1/2 rounded-full bg-primary text-primary-foreground shadow-[0_6px_18px_hsl(var(--primary)/0.35)] animate-scale-in px-1.5 py-0.5 pointer-events-none">
                    <span className="flex items-center gap-1 text-[10px] font-medium">
                      <Check size={10} />
                      {lang === 'zh' ? '已移动' : 'Moved'}
                    </span>
                  </div>
                )}
                <span
                  className={cn(
                    'text-[11px] leading-tight transition-colors',
                    isCurrentDay
                      ? 'font-medium text-foreground'
                      : 'font-medium text-muted-foreground/55 group-hover:text-muted-foreground/80'
                  )}
                >
                  {lang === 'zh' ? formatDate(day, 'EEE').replace('周', '') : formatDate(day, 'EEE')}
                </span>

                <span
                  className={cn(
                    'mt-0.5 text-[15px] leading-tight tabular-nums transition-colors',
                    isCurrentDay
                      ? 'font-semibold text-foreground'
                      : isSelected
                        ? 'font-medium text-foreground/70'
                        : 'font-normal text-muted-foreground/55 group-hover:text-foreground/70'
                  )}
                >
                  {format(day, 'd')}
                </span>

                <div className="mt-0.5 h-1.5 flex items-center">
                  {isCurrentDay ? (
                    <div className="h-1 w-1 rounded-full bg-primary/50" />
                  ) : hasRecord ? (
                    <div className="h-1 w-1 rounded-full bg-primary/35" />
                  ) : isSelected ? (
                    <div className="h-1 w-1 rounded-full bg-foreground/30" />
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <button
        type="button"
        onClick={() => navigate('next')}
        className="flex h-3 w-3 flex-shrink-0 items-center justify-center rounded-full text-muted-foreground/55 hover:bg-muted/25 hover:text-foreground transition-colors"
        aria-label="Next week"
      >
        <ChevronRight size={15} />
      </button>
    </div>
  );
}
