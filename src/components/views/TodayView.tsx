import { useMemo, useState, useRef, useCallback, useEffect, ChangeEvent } from 'react';
import { autoClassifyTag, TAG_CATEGORY_ICONS } from '@/lib/autoTag';
import { addDays, format, parseISO, startOfWeek, subDays } from 'date-fns';
import { useDateLocale } from '@/hooks/useDateLocale';
import { classifyMood } from '@/lib/moodClassifier';
import { MapPin, Image, Send, X, Smile, Pencil, Trash2, Sparkles, CheckCircle2, Check, Timer, Pause, Play, Square, Mic, Clock, ArrowUp, ChevronDown, ChevronUp, ChevronRight, Eye, EyeOff, Loader2 } from 'lucide-react';
import { InputPlusMenu, detectAutoTags } from '@/components/InputPlusMenu';
import { useReminders } from '@/hooks/useReminders';
import { Button } from '@/components/ui/button';
import { Moment, MomentLinkPreview, TodayMode } from '@/types';
import { Todo } from '@/hooks/useTodos';
import { ImportedEvent } from '@/hooks/useImportedEvents';
import { cn, isImeComposing } from '@/lib/utils';
import { normalizeUrl, extractFirstUrl } from '@/lib/linkUtils';
import { validatePhotoFile, canAddMorePhotos } from '@/lib/photoValidation';
import { LocationPopover } from '@/components/LocationPopover';
import { EmojiGrid } from '@/components/today/EmojiGrid';
import { LinkPreviewCard } from '@/components/LinkPreviewCard';

import { supabase } from '@/integrations/supabase/client';
// MiniTimeline removed from recap sidebar
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import monetPainting from '@/assets/monet-impression-sunrise.jpg';
import dailyPainting from '@/assets/daily-painting.jpg';
import { WeekDateBar } from '@/components/WeekDateBar';
import { useLanguage } from '@/hooks/useLanguage';
import { mergedWallClockFocusMinutes } from '@/lib/mergedWallClockMinutes';
import { getMomentDisplayTags } from '@/lib/momentTags';
import { useCustomOptions } from '@/hooks/useCustomOptions';
import { DueLink, DueWithStats, useDues } from '@/hooks/useDues';
import { useIsDarkMode } from '@/hooks/useIsDarkMode';
import { getActivityAccentColor, getActivityTagIcon } from '@/lib/activityColors';
import { useWorkTypes } from '@/hooks/useWorkTypes';
import { WORK_TYPE_META } from '@/lib/workType';
import { buildTodayWorkTypeBreakdown } from '@/lib/todayTimeBreakdown';
import { toast } from 'sonner';

import {
  DETAIL_SEPARATOR,
  uniquePhotoList,
  moveIsoToDateKeepingLocalTime,
  buildTimerSpanISO,
  getImportedEventEffectiveStart,
  getImportedEventEffectiveEnd,
  parseSubtitleDetail,
  shouldSummarize,
  lightlyPolishRecapText,
  buildLocalSummary,
  isStandaloneUrl,
  buildLocalLifeReplay,
} from './today/todayHelpers';
import {
  DailyHabitTracker,
  MomentTimerSummary,
  MomentTimeEditor,
  ImportedEventTimeEditor,
  LifeReplay,
} from './today/TodayRecapParts';
import { EvidenceReviewCard } from './today/EvidenceReviewCard';
import { OnThisDayCard } from './today/OnThisDayCard';
import { MemoryHorizonsCard } from './today/MemoryHorizonsCard';
import { PlanDrift } from '@/components/today/PlanDrift';
import { StorageImage } from "@/components/StorageImage";

type TimeBreakdownRange = 'today' | 'week' | 'month';

type MomentEditUpdates = Partial<Omit<Moment, 'location'>> & {
  location?: Moment['location'] | null;
};

interface TodayViewProps {
  selectedDate: Date;
  onSelectedDateChange: (date: Date) => void;
  recordedDates?: Set<string>;
  getMomentsForDate: (date: string) => Moment[];
  onAddMoment: (data: {
    text?: string;
    emoji?: string;
    photos: string[];
    links?: MomentLinkPreview[];
    tags?: string[];
    location?: { name: string; lat: number; lng: number; category: 'restaurant' | 'coffee' | 'grocery' | 'park' | 'museum' | 'other' };
    isSpecial?: boolean;
  }) => Promise<Moment | undefined> | void;
  onEditMoment?: (id: string, data: MomentEditUpdates) => void;
  onDeleteMoment?: (id: string) => void;
  onFocusLocationOnMap?: (location: { name: string; lat: number; lng: number }) => void;
  todayMode?: TodayMode;
  onTodayModeChange?: (mode: TodayMode) => void;
  todosDone?: number;
  todosTotal?: number;
  completedTodos?: Todo[];
  allTodos?: Todo[];
  allMoments?: Moment[];
  // Full moment history across all dates (for On This Day / Life Replay).
  historyMoments?: Moment[];
  importedEvents?: ImportedEvent[];
  onUpdateTodo?: (id: string, updates: Partial<Todo>) => void;
  onUpdateImportedEvent?: (id: string, updates: Partial<ImportedEvent>) => void;
  wakeHour?: number;
  wakeMinute?: number;
  bedtimeHour?: number;
  bedtimeMinute?: number;
  homepageImageUrl?: string;
  onOpenVoiceSheet?: () => void;
  voiceSheetOpen?: boolean;
}

// Default emojis - will be overridden by useCustomOptions

// Default values - will be overridden by props
const DEFAULT_BEDTIME_HOUR = 23;
const DEFAULT_BEDTIME_MINUTE = 30;
const DEFAULT_WAKE_HOUR = 8;
const DEFAULT_WAKE_MINUTE = 0;

export function TodayView({ selectedDate, onSelectedDateChange, recordedDates, getMomentsForDate, onAddMoment, onEditMoment, onDeleteMoment, onFocusLocationOnMap, todayMode, onTodayModeChange, todosDone, todosTotal, completedTodos, allTodos, allMoments, historyMoments, importedEvents = [], onUpdateTodo, onUpdateImportedEvent, wakeHour: propWakeHour, wakeMinute: propWakeMinute, bedtimeHour: propBedtimeHour, bedtimeMinute: propBedtimeMinute, homepageImageUrl, onOpenVoiceSheet, voiceSheetOpen }: TodayViewProps) {
  const { formatDate } = useDateLocale();
  const { t, lang } = useLanguage();
  const isDarkMode = useIsDarkMode();
  const { getWorkType } = useWorkTypes();
  const { dues, addDue, updateDue, incrementHabitCount, setHabitCount } = useDues();
  const { defaultRecapTags, customRecapTags, allEmojis, orderedRecapTags } = useCustomOptions();
  const emojis = allEmojis;
  const quickTags = orderedRecapTags.map(key => {
    const def = defaultRecapTags.find(d => d.key === key);
    return { key, label: def ? t(key) : key };
  });
  const WAKE_HOUR = propWakeHour ?? DEFAULT_WAKE_HOUR;
  const WAKE_MINUTE = propWakeMinute ?? DEFAULT_WAKE_MINUTE;
  const BEDTIME_HOUR = propBedtimeHour ?? DEFAULT_BEDTIME_HOUR;
  const BEDTIME_MINUTE = propBedtimeMinute ?? DEFAULT_BEDTIME_MINUTE;
  const [text, setText] = useState('');
  const [selectedEmoji, setSelectedEmoji] = useState<string | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<{ name: string; lat: number; lng: number; category: 'restaurant' | 'coffee' | 'grocery' | 'park' | 'museum' | 'other' } | null>(null);
  const [selectedPhotos, setSelectedPhotos] = useState<string[]>([]);
  const [selectedLinks, setSelectedLinks] = useState<MomentLinkPreview[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [showTimeInput, setShowTimeInput] = useState(false);
  const [inputStartTime, setInputStartTime] = useState(() => format(new Date(), 'HH:mm'));
  const [inputEndTime, setInputEndTime] = useState(() => format(new Date(), 'HH:mm'));
  const [locationOpen, setLocationOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResolvingLink, setIsResolvingLink] = useState(false);
  // Inline timeline insertion state
  const [inlineInsertTime, setInlineInsertTime] = useState<string | null>(null);
  const [inlineInsertText, setInlineInsertText] = useState('');
  const [inlineInsertSubmitting, setInlineInsertSubmitting] = useState(false);
  const inlineInsertRef = useRef<HTMLInputElement>(null);
  const [reminderConfig, setReminderConfig] = useState<{ enabled: boolean; intervalDays: number }>({ enabled: false, intervalDays: 30 });
  const { addReminder } = useReminders();

  // Auto-detect tags from text
  const autoDetectedTags = useMemo(() => detectAutoTags(text), [text]);
  const allFinalTags = useMemo(() => [...new Set([...selectedTags, ...autoDetectedTags])], [selectedTags, autoDetectedTags]);




  // Photo lightbox state
  const [lightboxPhotos, setLightboxPhotos] = useState<{ photos: string[]; index: number } | null>(null);

  // Moment timer state
  const [timerMomentId, setTimerMomentId] = useState<string | null>(null);
  const [timerTargetType, setTimerTargetType] = useState<'moment' | 'imported'>('moment');
  const [timerMomentTitle, setTimerMomentTitle] = useState('');
  const [momentTimerElapsed, setMomentTimerElapsed] = useState(0);
  const [momentTimerStartedAt, setMomentTimerStartedAt] = useState<string | null>(null);
  const [momentTimerPaused, setMomentTimerPaused] = useState(false);
  const [momentPauseElapsed, setMomentPauseElapsed] = useState(0);
  const [showMomentTimerOverlay, setShowMomentTimerOverlay] = useState(false);
  const [showMomentTimerSummary, setShowMomentTimerSummary] = useState(false);
  const [originalTimerSnapshot, setOriginalTimerSnapshot] = useState<{ startedAt: string | null; endedAt: string | null; seconds: number | null } | null>(null);

  // Moment timer tick
  useEffect(() => {
    if (!timerMomentId || momentTimerPaused) return;
    const interval = setInterval(() => setMomentTimerElapsed(prev => prev + 1), 1000);
    return () => clearInterval(interval);
  }, [timerMomentId, momentTimerPaused]);

  // Pause duration tick
  useEffect(() => {
    if (!timerMomentId || !momentTimerPaused) return;
    const interval = setInterval(() => setMomentPauseElapsed(prev => prev + 1), 1000);
    return () => clearInterval(interval);
  }, [timerMomentId, momentTimerPaused]);

  const startMomentTimer = (moment: Moment) => {
    const startISO = new Date().toISOString();
    setTimerMomentId(moment.id);
    setTimerTargetType('moment');
    setTimerMomentTitle(moment.text || moment.emoji || 'Moment');
    setMomentTimerElapsed(0);
    setMomentPauseElapsed(0);
    setMomentTimerStartedAt(startISO);
    setMomentTimerPaused(false);
    setShowMomentTimerOverlay(true);
    // Save original timer values so we can restore on cancel
    setOriginalTimerSnapshot({
      startedAt: moment.timer_started_at || null,
      endedAt: moment.timer_ended_at || null,
      seconds: moment.timer_seconds ?? null,
    });
    // Persist timer start immediately
    if (onEditMoment) {
      onEditMoment(moment.id, { timer_started_at: startISO } as Partial<Moment>);
    }
  };

  const startImportedEventTimer = (event: ImportedEvent) => {
    const startISO = new Date().toISOString();
    setTimerMomentId(event.id);
    setTimerTargetType('imported');
    setTimerMomentTitle(event.title || 'Calendar event');
    setMomentTimerElapsed(0);
    setMomentPauseElapsed(0);
    setMomentTimerStartedAt(startISO);
    setMomentTimerPaused(false);
    setShowMomentTimerOverlay(true);
    setOriginalTimerSnapshot({
      startedAt: event.timer_started_at || null,
      endedAt: event.timer_ended_at || null,
      seconds: event.timer_seconds ?? null,
    });
    onUpdateImportedEvent?.(event.id, { timer_started_at: startISO, timer_ended_at: null, timer_seconds: 0 });
  };

  const handleMomentTimerStop = () => {
    setShowMomentTimerOverlay(false);
    setShowMomentTimerSummary(true);
  };

  const handleMomentTimerCancel = () => {
    // Restore original timer values
    if (timerMomentId) {
      const restore = {
        timer_started_at: originalTimerSnapshot?.startedAt ?? null,
        timer_ended_at: originalTimerSnapshot?.endedAt ?? null,
        timer_seconds: originalTimerSnapshot?.seconds ?? null,
      };
      if (timerTargetType === 'moment') onEditMoment?.(timerMomentId, restore as Partial<Moment>);
      else onUpdateImportedEvent?.(timerMomentId, restore as Partial<ImportedEvent>);
    }
    setTimerMomentId(null);
    setShowMomentTimerOverlay(false);
    setShowMomentTimerSummary(false);
    setOriginalTimerSnapshot(null);
  };

  const handleMomentTimerConfirm = (data: { startTime: string; endTime: string }) => {
    if (timerMomentId) {
      const span = buildTimerSpanISO(data.startTime, data.endTime, {
        anchorISO: momentTimerStartedAt ?? originalTimerSnapshot?.startedAt,
        fallbackDateStr: format(selectedDate, 'yyyy-MM-dd'),
      });
      if (!span) return;
      const updates = { timer_started_at: span.startISO, timer_ended_at: span.endISO, timer_seconds: span.seconds };
      if (timerTargetType === 'moment') onEditMoment?.(timerMomentId, updates as Partial<Moment>);
      else onUpdateImportedEvent?.(timerMomentId, updates as Partial<ImportedEvent>);
    }
    setTimerMomentId(null);
    setShowMomentTimerSummary(false);
    setOriginalTimerSnapshot(null);
  };
  
  // Edit state
  const [editingMoment, setEditingMoment] = useState<string | null>(null);
  const [editingTodoId, setEditingTodoId] = useState<string | null>(null);
  const [editingTodoTitle, setEditingTodoTitle] = useState('');
  const [editingImportedEventId, setEditingImportedEventId] = useState<string | null>(null);
  const [editingImportedEventTitle, setEditingImportedEventTitle] = useState('');
  const [expandedStreamIds, setExpandedStreamIds] = useState<Set<string>>(new Set());
  const toggleStreamExpand = (id: string) => setExpandedStreamIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const [editText, setEditText] = useState('');
  const [editDetailText, setEditDetailText] = useState<string | null>(null);
  const [editEmoji, setEditEmoji] = useState<string | null>(null);
  const [editLocation, setEditLocation] = useState<{ name: string; lat: number; lng: number; category: 'restaurant' | 'coffee' | 'grocery' | 'park' | 'museum' | 'other' } | null>(null);
  const [editPhotos, setEditPhotos] = useState<string[]>([]);
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editLocationOpen, setEditLocationOpen] = useState(false);
  const [editEmojiOpen, setEditEmojiOpen] = useState(false);
  const editFileInputRef = useRef<HTMLInputElement>(null);
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recapContentRef = useRef<HTMLDivElement>(null);
  const recapRightColRef = useRef<HTMLDivElement>(null);
  const [recapInputDock, setRecapInputDock] = useState<{ left: number; width: number } | null>(null);
  const [headerImageSrc, setHeaderImageSrc] = useState(homepageImageUrl || monetPainting);
  const [timeBreakdownRange, setTimeBreakdownRange] = useState<TimeBreakdownRange>('today');
  
  
  const today = selectedDate;
  const selectedDateStr = format(today, 'yyyy-MM-dd');
  const todayMoments = getMomentsForDate(format(today, 'yyyy-MM-dd'));
  const recapHabits = useMemo(
    () => dues.filter(due => due.habit_category !== null && due.show_in_recap_daily && !due.is_completed),
    [dues]
  );

  useEffect(() => {
    setHeaderImageSrc(homepageImageUrl || monetPainting);
  }, [homepageImageUrl]);

  // Sort moments by effective start time (timer_started_at or createdAt), chronologically
  const sortedMoments = useMemo(() => {
    return [...todayMoments].sort((a, b) => {
      const aTime = a.timer_started_at ? new Date(a.timer_started_at).getTime() : new Date(a.createdAt).getTime();
      const bTime = b.timer_started_at ? new Date(b.timer_started_at).getTime() : new Date(b.createdAt).getTime();
      return aTime - bTime;
    });
  }, [todayMoments]);

  // The end-of-day reflection answer, stored as a special moment tagged
  // 'daily-reflection' so it can be surfaced once per day in the review card.
  const dailyReflection = useMemo(
    () => sortedMoments.find(m => m.tags?.includes('daily-reflection')) ?? null,
    [sortedMoments]
  );

  const handleSaveReflection = (text: string) => {
    void onAddMoment({
      text,
      emoji: '💛',
      photos: [],
      tags: ['daily-reflection'],
      isSpecial: true,
    });
  };

  // Calculate non-overlapping time coverage percentage
  const timeRecordedPct = useMemo(() => {
    const wakeMin = WAKE_HOUR * 60 + WAKE_MINUTE;
    const bedMin = BEDTIME_HOUR * 60 + BEDTIME_MINUTE;
    const totalDayMin = bedMin - wakeMin;
    if (totalDayMin <= 0) return 0;

    // Collect all time intervals from todos and moments
    const intervals: [number, number][] = [];
    
    // From moments
    todayMoments.forEach(m => {
      if (m.timer_started_at && m.timer_ended_at) {
        const s = new Date(m.timer_started_at);
        const e = new Date(m.timer_ended_at);
        intervals.push([s.getHours() * 60 + s.getMinutes(), e.getHours() * 60 + e.getMinutes()]);
      }
    });

    // From completed todos
    (completedTodos || []).forEach(t => {
      if (t.timer_started_at && t.timer_ended_at) {
        const s = parseISO(t.timer_started_at);
        const e = parseISO(t.timer_ended_at);
        intervals.push([s.getHours() * 60 + s.getMinutes(), e.getHours() * 60 + e.getMinutes()]);
      }
    });

    importedEvents.forEach(event => {
      const startIso = getImportedEventEffectiveStart(event);
      const endIso = getImportedEventEffectiveEnd(event);
      if (startIso && endIso) {
        const s = parseISO(startIso);
        const e = parseISO(endIso);
        intervals.push([s.getHours() * 60 + s.getMinutes(), e.getHours() * 60 + e.getMinutes()]);
      }
    });

    if (intervals.length === 0) return 0;

    // Merge overlapping intervals
    intervals.sort((a, b) => a[0] - b[0]);
    const merged: [number, number][] = [intervals[0]];
    for (let i = 1; i < intervals.length; i++) {
      const last = merged[merged.length - 1];
      if (intervals[i][0] <= last[1]) {
        last[1] = Math.max(last[1], intervals[i][1]);
      } else {
        merged.push(intervals[i]);
      }
    }

    const coveredMin = merged.reduce((sum, [s, e]) => sum + Math.max(0, Math.min(e, bedMin) - Math.max(s, wakeMin)), 0);
    return Math.round((coveredMin / totalDayMin) * 100);
  }, [todayMoments, completedTodos, importedEvents]);

  const shouldShowSampleTag = (moment: Moment) => {
    if (!moment.id.startsWith('sample-')) return false;
    // If the stored text already contains the tag, avoid duplicating in UI.
    return !(moment.text || '').includes('(sample)');
  };

  const timelineItems = useMemo(() => {
    type TimelineItem =
      | { type: 'todo'; data: Todo; time: Date; endTime?: Date; isPlanOutline?: boolean }
      | { type: 'moment'; data: Moment; time: Date; endTime?: Date; isPlanOutline?: boolean }
      | { type: 'imported'; data: ImportedEvent; time: Date; endTime?: Date; isPlanOutline?: boolean };

    const items: TimelineItem[] = [];

    completedTodos?.forEach(todo => {
      const time = todo.timer_started_at ? parseISO(todo.timer_started_at) : parseISO(todo.created_at);
      const endTime = todo.timer_ended_at ? parseISO(todo.timer_ended_at) : undefined;
      items.push({ type: 'todo', data: todo, time, endTime });
    });

    allTodos?.forEach(todo => {
      if (todo.is_completed) return;
      if (!todo.timer_started_at || !todo.timer_ended_at) return;
      if ((todo.timer_seconds || 0) <= 0) return;
      const time = parseISO(todo.timer_started_at);
      const endTime = parseISO(todo.timer_ended_at);
      items.push({ type: 'todo', data: todo, time, endTime });
    });

    allTodos?.forEach(todo => {
      if (todo.is_completed || !todo.timer_started_at) return;
      if (!todo.timer_ended_at) return;
      if ((todo.timer_seconds || 0) > 0) return;
      const time = parseISO(todo.timer_started_at);
      const endTime = parseISO(todo.timer_ended_at);
      const now = Date.now();
      if (endTime.getTime() > now) return;
      const createdAt = parseISO(todo.created_at).getTime();
      if (createdAt > endTime.getTime()) return;
      items.push({ type: 'todo', data: todo, time, endTime, isPlanOutline: true });
    });

    sortedMoments.forEach(moment => {
      const time = moment.timer_started_at ? parseISO(moment.timer_started_at) : parseISO(moment.createdAt);
      const endTime = moment.timer_ended_at ? parseISO(moment.timer_ended_at) : undefined;
      items.push({ type: 'moment', data: moment, time, endTime });
    });

    importedEvents.forEach(event => {
      const startIso = getImportedEventEffectiveStart(event);
      const endIso = getImportedEventEffectiveEnd(event);
      const time = parseISO(startIso);
      const endTime = endIso ? parseISO(endIso) : undefined;
      if (Number.isFinite(time.getTime())) {
        items.push({ type: 'imported', data: event, time, endTime });
      }
    });

    items.sort((a, b) => a.time.getTime() - b.time.getTime());
    return items;
  }, [completedTodos, allTodos, sortedMoments, importedEvents]);

  const todayTimeBreakdownRows = useMemo(() => {
    return timelineItems
      .filter((item) => !item.isPlanOutline && !!item.endTime)
      .map((item) => {
        const title = item.type === 'todo'
          ? item.data.title
          : item.type === 'moment'
            ? item.data.text
            : item.data.title;
        const tags = item.type === 'todo' ? item.data.tags : item.type === 'moment' ? item.data.tags : undefined;
        const workType = item.type === 'todo'
          ? getWorkType({ entity: 'todo', id: item.data.id, title, tags })
          : item.type === 'moment'
            ? getWorkType({ entity: 'moment', id: item.data.id, title, text: title, tags })
            : 'shallow';
        const startMs = item.time.getTime();
        const endMs = item.endTime ? item.endTime.getTime() : startMs;
        const durationMin = Math.max(0, Math.round((endMs - startMs) / 60000));
        return { workType, durationMin };
      });
  }, [timelineItems, getWorkType]);

  const todayTimeBreakdown = useMemo(() => {
    return buildTodayWorkTypeBreakdown(todayTimeBreakdownRows);
  }, [todayTimeBreakdownRows]);

  const rangedMomentTimeBreakdown = useMemo(() => {
    if (!historyMoments?.length) return [];
    const selectedDateKey = format(selectedDate, 'yyyy-MM-dd');
    const rangeStart = timeBreakdownRange === 'week'
      ? startOfWeek(selectedDate, { weekStartsOn: 1 })
      : new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
    const rangeEnd = timeBreakdownRange === 'week'
      ? addDays(rangeStart, 6)
      : new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0);
    const startKey = format(rangeStart, 'yyyy-MM-dd');
    const endKey = format(rangeEnd, 'yyyy-MM-dd');

    const historicalRows = historyMoments
        .filter((moment) => {
          if (moment.date < startKey || moment.date > endKey) return false;
          if (moment.date === selectedDateKey) return false;
          return true;
        })
        .map((moment) => {
          const title = parseSubtitleDetail(moment.text).subtitle || '';
          const workType = getWorkType({
            entity: 'moment',
            id: moment.id,
            title,
            text: title,
            tags: moment.tags,
          });
          let durationMin = 0;
          if (moment.timer_started_at && moment.timer_ended_at) {
            const startMs = parseISO(moment.timer_started_at).getTime();
            const endMs = parseISO(moment.timer_ended_at).getTime();
            if (Number.isFinite(startMs) && Number.isFinite(endMs)) {
              durationMin = Math.max(0, Math.round((endMs - startMs) / 60000));
            }
          } else if ((moment.timer_seconds || 0) > 0) {
            durationMin = Math.max(0, Math.round((moment.timer_seconds || 0) / 60));
          }
          return { workType, durationMin };
        });

    return buildTodayWorkTypeBreakdown([
      ...todayTimeBreakdownRows,
      ...historicalRows,
    ]);
  }, [historyMoments, selectedDate, timeBreakdownRange, getWorkType, todayTimeBreakdownRows]);

  const activeTimeBreakdown = timeBreakdownRange === 'today' ? todayTimeBreakdown : rangedMomentTimeBreakdown;
  const shouldShowTimeBreakdownCard = todayTimeBreakdown.length > 0 || (historyMoments?.length || 0) > 0;
  const priorityAlignment = useMemo(() => {
    const rankedTodos = [...(allTodos ?? [])]
      .filter((todo) => !todo.parent_due_id && todo.date === selectedDateStr)
      .sort((a, b) => a.sort_order - b.sort_order);

    if (rankedTodos.length === 0) return null;

    const topTodos = rankedTodos.slice(0, Math.min(2, rankedTodos.length));
    if (topTodos.length === 0) return null;

    const actualMinutesForTodo = (todo: Todo) => {
      if ((todo.timer_seconds || 0) > 0) {
        return Math.max(0, Math.round((todo.timer_seconds || 0) / 60));
      }
      if (!todo.timer_started_at || !todo.timer_ended_at) return 0;
      const startMs = parseISO(todo.timer_started_at).getTime();
      const endMs = parseISO(todo.timer_ended_at).getTime();
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return 0;
      return Math.max(0, Math.round((endMs - startMs) / 60000));
    };

    const topTodoIds = new Set(topTodos.map((todo) => todo.id));
    const timedTodos = rankedTodos.map((todo) => ({ todo, actualMin: actualMinutesForTodo(todo) }));
    const totalTrackedMin = timedTodos.reduce((sum, entry) => sum + entry.actualMin, 0);
    const topTrackedMin = timedTodos
      .filter((entry) => topTodoIds.has(entry.todo.id))
      .reduce((sum, entry) => sum + entry.actualMin, 0);
    const touchedTopCount = topTodos.filter((todo) => actualMinutesForTodo(todo) > 0 || todo.is_completed).length;
    const completedTopCount = topTodos.filter((todo) => todo.is_completed).length;
    const sharePct = totalTrackedMin > 0 ? Math.round((topTrackedMin / totalTrackedMin) * 100) : 0;
    const firstUntouched = topTodos.find((todo) => actualMinutesForTodo(todo) <= 0 && !todo.is_completed) ?? null;
    const strongestLowerPriority = timedTodos
      .filter((entry) => !topTodoIds.has(entry.todo.id) && entry.actualMin > 0)
      .sort((a, b) => b.actualMin - a.actualMin)[0] ?? null;

    if (totalTrackedMin === 0 && completedTopCount === 0) return null;

    const tone = sharePct >= 60 && touchedTopCount === topTodos.length
      ? 'aligned'
      : sharePct >= 40 || touchedTopCount > 0
        ? 'mixed'
        : 'drifted';

    return {
      tone,
      topCount: topTodos.length,
      sharePct,
      touchedTopCount,
      completedTopCount,
      firstUntouchedTitle: firstUntouched?.title ?? null,
      strongestLowerPriorityTitle: strongestLowerPriority?.todo.title ?? null,
      strongestLowerPriorityMin: strongestLowerPriority?.actualMin ?? 0,
    };
  }, [allTodos, selectedDateStr]);

  // Click outside to close edit
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target?.closest('[data-edit-popover="true"]')) return;
      if (editingMoment && editRef.current && !editRef.current.contains(target as Node)) {
        if (onEditMoment) {
          const trimmedTitle = editText.trim();
          const trimmedDetail = editDetailText?.trim();
          const finalText = trimmedDetail ? trimmedTitle + DETAIL_SEPARATOR + trimmedDetail : trimmedTitle;
          onEditMoment(editingMoment, {
            text: finalText || undefined,
            emoji: editEmoji || undefined,
            location: editLocation ?? null,
            photos: uniquePhotoList(editPhotos),
            tags: editTags,
          });
        }
        setEditingMoment(null);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [editingMoment, editText, editDetailText, editEmoji, editLocation, editPhotos, editTags, onEditMoment]);

  // Inline timeline insertion handler
  const handleInlineInsert = useCallback(async (timeStr: string) => {
    if (inlineInsertSubmitting || !inlineInsertText.trim()) return;
    setInlineInsertSubmitting(true);
    try {
      // If no emoji provided, classify mood from text
      const insertText = inlineInsertText.trim();
      const moodEmoji = insertText ? classifyMood(insertText).emoji : null;
      const result = await onAddMoment({ text: insertText, photos: [], emoji: moodEmoji || undefined });
      if (result && result.id && onEditMoment) {
        const dateStr = format(selectedDate, 'yyyy-MM-dd');
        const startISO = new Date(`${dateStr}T${timeStr}:00`).toISOString();
        await Promise.resolve(onEditMoment(result.id, {
          timer_started_at: startISO,
          timer_ended_at: null,
          timer_seconds: null,
        } as Partial<Moment>));
      }
      setInlineInsertText('');
      setInlineInsertTime(null);
    } finally {
      setInlineInsertSubmitting(false);
    }
  }, [inlineInsertSubmitting, inlineInsertText, onAddMoment, onEditMoment, selectedDate]);

  const handleSend = useCallback(async () => {
    if (isSubmitting || (!text.trim() && !selectedLocation && !selectedEmoji && selectedPhotos.length === 0 && selectedLinks.length === 0 && selectedTags.length === 0)) return;

    setIsSubmitting(true);
    try {
      const rawText = lightlyPolishRecapText(text);
      
      let finalText = rawText || undefined;
      if (rawText && shouldSummarize(rawText)) {
        const { title, detail } = buildLocalSummary(rawText);
        finalText = detail ? title + DETAIL_SEPARATOR + detail : title;
      }

      // If user didn't pick an emoji, try to auto-classify from text (only when there's text)
      let chosenEmoji: string | undefined = selectedEmoji || undefined;
      if (!chosenEmoji && finalText) {
        const cls = classifyMood(finalText as string);
        if (cls.emoji) chosenEmoji = cls.emoji;
      }

      const result = await onAddMoment({
        text: finalText,
        emoji: chosenEmoji,
        photos: selectedPhotos,
        links: selectedLinks,
        location: selectedLocation || undefined,
        tags: allFinalTags.length > 0 ? allFinalTags : undefined,
      });

      if (result && result.id && inputStartTime && onEditMoment) {
        const dateStr = format(selectedDate, 'yyyy-MM-dd');
        const startISO = new Date(`${dateStr}T${inputStartTime}:00`).toISOString();
        const isSameTime = !inputEndTime || inputEndTime === inputStartTime;
        const endISO = isSameTime ? undefined : new Date(`${dateStr}T${inputEndTime}:00`).toISOString();
        const diffSec = endISO ? Math.max(0, Math.floor((new Date(endISO).getTime() - new Date(startISO).getTime()) / 1000)) : undefined;
        await Promise.resolve(onEditMoment(result.id, {
          timer_started_at: startISO,
          timer_ended_at: endISO || null,
          timer_seconds: diffSec ?? null,
        } as Partial<Moment>));
      }

      // Create reminder if enabled
      if (reminderConfig.enabled) {
        await addReminder(
          rawText || selectedEmoji || 'Reminder',
          reminderConfig.intervalDays,
          `From moment: ${rawText}`
        );
      }

      setText('');
      setSelectedEmoji(null);
      setSelectedLocation(null);
      setSelectedPhotos([]);
      setSelectedLinks([]);
      setSelectedTags([]);
      setReminderConfig({ enabled: false, intervalDays: 30 });
      setInputStartTime(format(new Date(), 'HH:mm'));
      setInputEndTime(format(new Date(), 'HH:mm'));
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, text, selectedEmoji, selectedLocation, selectedPhotos, selectedLinks, selectedTags, onAddMoment, inputStartTime, inputEndTime, selectedDate, onEditMoment, reminderConfig, addReminder, allFinalTags]);

  const addLinkPreview = useCallback(async (rawUrl: string) => {
    const url = normalizeUrl(rawUrl);
    if (!url) {
      toast.error('Invalid link');
      return false;
    }
    const siteFallback = (() => {
      try {
        return new URL(url).hostname.replace(/^www\./, '');
      } catch {
        return url;
      }
    })();

    let shouldFetch = false;
    setSelectedLinks(prev => {
      if (prev.some(link => link.url === url)) return prev;
      shouldFetch = true;
      return [...prev, { url, siteName: siteFallback, title: siteFallback }];
    });
    if (!shouldFetch) return true;

    setIsResolvingLink(true);
    try {
      const { data, error } = await supabase.functions.invoke('link-preview', {
        body: { url },
      });

      if (error) {
        console.error('Link preview failed:', error);
        toast.warning('Preview unavailable, link added anyway');
        return true;
      }

      const preview: MomentLinkPreview = {
        url,
        title: typeof data?.title === 'string' ? data.title : siteFallback,
        description: typeof data?.description === 'string' ? data.description : undefined,
        image: typeof data?.image === 'string' ? data.image : undefined,
        siteName: typeof data?.siteName === 'string' ? data.siteName : siteFallback,
      };

      setSelectedLinks(prev => prev.map(link => link.url === url ? { ...link, ...preview } : link));
      return true;
    } catch (err) {
      console.error('Link preview exception:', err);
      toast.warning('Preview unavailable, link added anyway');
      return true;
    } finally {
      setIsResolvingLink(false);
    }
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const native = e.nativeEvent as KeyboardEvent;
    const isComposing = isImeComposing(native);
    if (e.key === 'Enter' && !e.shiftKey && !isComposing) {
      e.preventDefault();
      handleSend();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    let handledImage = false;
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        handledImage = true;
        const file = item.getAsFile();
        if (!file) continue;
        const reader = new FileReader();
        reader.onload = (ev) => {
          const dataUrl = ev.target?.result as string;
          if (dataUrl) setSelectedPhotos(prev => [...prev, dataUrl]);
        };
        reader.readAsDataURL(file);
      }
    }
    if (handledImage) return;

    const pastedText = e.clipboardData.getData('text/plain');
    const pastedUrl = extractFirstUrl(pastedText);
    if (pastedUrl && isStandaloneUrl(pastedUrl)) {
      e.preventDefault();
      void addLinkPreview(pastedUrl);
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px';
    }
  };

  const handlePhotoClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const validFiles = Array.from(files).filter(f => validatePhotoFile(f));
    if (!canAddMorePhotos(selectedPhotos.length, validFiles.length)) return;
    
    validFiles.forEach(file => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        if (dataUrl) {
          setSelectedPhotos(prev => [...prev, dataUrl]);
        }
      };
      reader.readAsDataURL(file);
    });
    
    // Reset input
    e.target.value = '';
  };

  const removePhoto = (index: number) => {
    setSelectedPhotos(prev => prev.filter((_, i) => i !== index));
  };

  const startEdit = (moment: Moment) => {
    const { subtitle, detail } = parseSubtitleDetail(moment.text);
    setEditingMoment(moment.id);
    setEditText(subtitle);
    setEditDetailText(detail);
    setEditEmoji(moment.emoji || null);
    setEditLocation(moment.location ? { ...moment.location, category: moment.location.category || 'other' } : null);
    setEditPhotos(uniquePhotoList(moment.photos || []));
    setEditTags(moment.tags || []);
  };

  const handleEditFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const validFiles = Array.from(files).filter(f => validatePhotoFile(f));
    if (!canAddMorePhotos(editPhotos.length, validFiles.length)) return;
    
    validFiles.forEach(file => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        if (dataUrl) {
          setEditPhotos(prev => uniquePhotoList([...prev, dataUrl]));
        }
      };
      reader.readAsDataURL(file);
    });
    
    e.target.value = '';
  };

  const removeEditPhoto = (index: number) => {
    setEditPhotos(prev => prev.filter((_, i) => i !== index));
  };

  const saveEdit = () => {
    if (editingMoment && onEditMoment) {
      const trimmedTitle = editText.trim();
      const trimmedDetail = editDetailText?.trim();
      const finalText = trimmedDetail ? trimmedTitle + DETAIL_SEPARATOR + trimmedDetail : trimmedTitle;
      onEditMoment(editingMoment, {
        text: finalText || undefined,
        emoji: editEmoji || undefined,
        location: editLocation ?? null,
        photos: uniquePhotoList(editPhotos),
        tags: editTags,
      });
    }
    setEditingMoment(null);
  };

  useEffect(() => {
    if (todayMode === 'plan') return;

    const updateRecapInputDock = () => {
      const el = recapRightColRef.current ?? recapContentRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setRecapInputDock({
        left: rect.left + 8,
        width: Math.max(280, rect.width - 16),
      });
    };

    updateRecapInputDock();

    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => updateRecapInputDock())
      : null;
    const observe = recapRightColRef.current ?? recapContentRef.current;
    if (resizeObserver && observe) resizeObserver.observe(observe);

    window.addEventListener('resize', updateRecapInputDock);
    window.addEventListener('scroll', updateRecapInputDock, true);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', updateRecapInputDock);
      window.removeEventListener('scroll', updateRecapInputDock, true);
    };
  }, [todayMode]);

  const canSend = text.trim() || selectedLocation || selectedEmoji || selectedPhotos.length > 0 || selectedLinks.length > 0 || selectedTags.length > 0;

  return (
    <div className="flex-1 flex flex-col">
      {/* Moment focusing overlay */}
      {showMomentTimerOverlay && timerMomentId && (
        <div
          className="fixed inset-0 z-50 bg-background flex flex-col items-center justify-center gap-10 animate-fade-in cursor-pointer"
          onClick={() => setShowMomentTimerOverlay(false)}
        >
          <p className="text-xs text-muted-foreground/60 tracking-[0.3em] uppercase">
            {momentTimerPaused ? 'Paused' : 'Focusing'}
          </p>
          <p className="text-base font-medium text-foreground/80">{timerMomentTitle}</p>
          <div className="text-5xl font-mono font-extralight text-foreground/30 tabular-nums">
            {String(Math.floor(momentTimerElapsed / 3600)).padStart(2, '0')}:{String(Math.floor((momentTimerElapsed % 3600) / 60)).padStart(2, '0')}
          </div>
          {momentTimerPaused && momentPauseElapsed > 0 && (
            <p className="text-sm font-mono text-muted-foreground/50 tabular-nums">
              paused {String(Math.floor(momentPauseElapsed / 60)).padStart(2, '0')}:{String(momentPauseElapsed % 60).padStart(2, '0')}
            </p>
          )}
          <div className="flex items-center gap-6" onClick={e => e.stopPropagation()}>
            <button onClick={() => { setMomentTimerPaused(p => !p); setMomentPauseElapsed(0); }} aria-label={momentTimerPaused ? 'Resume' : 'Pause'} className="w-12 h-12 rounded-full border border-border/50 flex items-center justify-center text-foreground/60 hover:text-foreground transition-colors">
              {momentTimerPaused ? <Play size={20} /> : <Pause size={20} />}
            </button>
            <button onClick={handleMomentTimerStop} aria-label="Stop timer" className="w-10 h-10 rounded-full border border-border/30 flex items-center justify-center text-primary/60 hover:text-primary transition-colors"><Square size={14} /></button>
            <button onClick={handleMomentTimerCancel} aria-label="Cancel timer" className="w-10 h-10 rounded-full border border-border/30 flex items-center justify-center text-destructive/50 hover:text-destructive transition-colors"><X size={14} /></button>
          </div>
          <p className="text-xs text-muted-foreground/30 mt-4">tap anywhere to minimize</p>
        </div>
      )}

      {/* Photo lightbox */}
      {lightboxPhotos && (
        <div className="fixed inset-0 z-[60] bg-background/95 backdrop-blur-sm flex items-center justify-center animate-fade-in" onClick={() => setLightboxPhotos(null)}>
          <button onClick={() => setLightboxPhotos(null)} className="absolute top-4 right-4 p-2 text-muted-foreground hover:text-foreground z-10">
            <X size={24} />
          </button>
          <div className="relative max-w-[90vw] max-h-[85vh]" onClick={e => e.stopPropagation()}>
            <StorageImage src={lightboxPhotos.photos[lightboxPhotos.index]} alt="" className="max-w-full max-h-[85vh] object-contain rounded-lg" />
            {lightboxPhotos.photos.length > 1 && (
              <div className="flex items-center justify-center gap-2 mt-3">
                {lightboxPhotos.photos.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setLightboxPhotos({ ...lightboxPhotos, index: i })}
                    className={cn("w-2 h-2 rounded-full transition-colors", i === lightboxPhotos.index ? "bg-primary" : "bg-muted-foreground/30")}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Moment timer summary */}
      {showMomentTimerSummary && momentTimerStartedAt && (
        <MomentTimerSummary
          title={timerMomentTitle}
          elapsed={momentTimerElapsed}
          startedAt={momentTimerStartedAt}
          onConfirm={handleMomentTimerConfirm}
          onCancel={handleMomentTimerCancel}
        />
      )}

      {/* Floating mini timer for moments */}
      {timerMomentId && !showMomentTimerOverlay && !showMomentTimerSummary && (
        <button
          onClick={() => setShowMomentTimerOverlay(true)}
          className={cn(
            "fixed bottom-20 right-3 z-40 flex items-center gap-2.5 px-4 py-2.5 rounded-2xl shadow-lg transition-colors border",
            momentTimerPaused ? "bg-muted border-border text-muted-foreground" : "bg-primary/10 border-primary/30 text-foreground"
          )}
        >
          <Timer size={16} className="text-primary" />
          <div className="flex flex-col">
            <span className="text-xs truncate max-w-[120px] font-medium">{timerMomentTitle}</span>
            <span className="text-base font-mono font-semibold tabular-nums text-primary">{String(Math.floor(momentTimerElapsed / 60)).padStart(2, '0')}:{String(momentTimerElapsed % 60).padStart(2, '0')}</span>
          </div>
        </button>
      )}
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Date + time + image layout */}
      <div className="pt-2 pb-1 overflow-hidden">
        <div className="flex items-start gap-3 sm:gap-5 px-4 sm:px-6">
          {/* Left: homepage image */}
          <div
            className="w-[58%] lg:w-[66%] flex-shrink-0 overflow-hidden rounded-2xl select-none"
            style={{ height: 84 }}
            onDragStart={(e) => e.preventDefault()}
            onMouseDown={(e) => e.preventDefault()}
          >
            <img
              src={headerImageSrc}
              alt="Daily painting"
              draggable={false}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                display: 'block',
                WebkitUserDrag: 'none',
                userSelect: 'none',
                pointerEvents: 'none',
              } as React.CSSProperties}
              onError={() => {
                setHeaderImageSrc((current) => {
                  if (!current || current === dailyPainting) return '';
                  if (current === monetPainting) return dailyPainting;
                  return monetPainting;
                });
              }}
            />
          </div>

          {/* Right: date info */}
          <div className="w-[38%] lg:w-[32%] flex flex-col min-w-0 pt-1 sm:pt-1.5">
            {/* Date row */}
            <div className="flex items-start justify-between">
              <span className="self-start text-[24px] sm:text-[30px] lg:text-[36px] font-light text-foreground leading-none">
                {format(today, 'd')}
              </span>
              <div className="flex flex-col items-end gap-0 self-end">
                <span className="text-[17px] sm:text-[20px] lg:text-[24px] font-semibold text-primary uppercase tracking-[0.18em] leading-none">
                  {formatDate(today, 'MMMM')}
                </span>
                <div className="mt-1.5 flex items-center gap-1.5 leading-none">
                  <span className="text-[17px] sm:text-[20px] text-muted-foreground">
                    {formatDate(today, 'yyyy')}
                  </span>
                  <span className="text-muted-foreground text-[17px] sm:text-[20px]">·</span>
                  <span className="text-[17px] sm:text-[20px] text-muted-foreground">
                    {formatDate(today, 'EEEE')}
                  </span>
                </div>
              </div>
            </div>

            {/* Time display intentionally hidden for now: users found the plan/recap logic hard to parse. */}
          </div>
        </div>
      </div>

      <WeekDateBar
        selectedDate={today}
        onDateSelect={onSelectedDateChange}
        recordedDates={recordedDates}
        onTaskMove={async (taskId: string, newDate: string) => {
          const todo = allTodos?.find(t => t.id === taskId);
          if (!todo) {
            await onUpdateTodo?.(taskId, { date: newDate });
            return;
          }

          await onUpdateTodo?.(taskId, {
            date: newDate,
            plan_started_at: moveIsoToDateKeepingLocalTime(todo.plan_started_at, newDate),
            plan_ended_at: moveIsoToDateKeepingLocalTime(todo.plan_ended_at, newDate),
            timer_started_at: moveIsoToDateKeepingLocalTime(todo.timer_started_at, newDate),
            timer_ended_at: moveIsoToDateKeepingLocalTime(todo.timer_ended_at, newDate),
          });
        }}
      />

      {/* Only show recap content when in recap mode */}
      {(!todayMode || todayMode === 'recap') && (
      <>

      {/* Floating bottom input bar */}
      {!voiceSheetOpen && recapInputDock && <div
        className="fixed z-20 pointer-events-none"
        style={{ left: recapInputDock.left, width: recapInputDock.width, bottom: 16 }}
      >
        <div className="pointer-events-auto">
        {/* Auto-detected tags + selected tags badges */}
        {(selectedTags.length > 0 || autoDetectedTags.length > 0) && (
          <div className="flex gap-1.5 px-1 pb-2 overflow-x-auto">
            {[...new Set([...autoDetectedTags, ...selectedTags])].map(tag => (
              <span key={tag} className="px-2 py-0.5 rounded-full text-xs font-medium bg-primary/15 text-primary flex items-center gap-1 whitespace-nowrap flex-shrink-0">
                {tag}
                <button onClick={() => setSelectedTags(prev => prev.filter(t => t !== tag))} className="hover:text-destructive"><X size={10} /></button>
              </span>
            ))}
          </div>
        )}
        <div className="bg-[hsl(var(--toolbar-background))] rounded-2xl overflow-hidden">
          {/* Photo previews */}
          {selectedPhotos.length > 0 && (
            <div className="flex gap-2 px-2.5 pt-2.5 overflow-x-auto">
              {selectedPhotos.map((photo, i) => (
                <div key={i} className="relative flex-shrink-0">
                  <StorageImage src={photo} alt="" className="w-14 h-14 object-cover rounded-lg" />
                  <button
                    onClick={() => removePhoto(i)}
                    className="absolute -top-1 -right-1 w-5 h-5 bg-foreground text-background rounded-full flex items-center justify-center"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {(selectedLinks.length > 0 || isResolvingLink) && (
            <div className="space-y-2 px-2.5 pt-2.5">
              {selectedLinks.map((link, index) => (
                <LinkPreviewCard
                  key={`${link.url}-${index}`}
                  preview={link}
                  compact
                  onRemove={() => setSelectedLinks(prev => prev.filter((_, i) => i !== index))}
                />
              ))}
              {isResolvingLink && (
                <div className="flex items-center gap-2 rounded-[16px] bg-[hsl(var(--surface-soft))] px-3 py-2 text-[12px] text-muted-foreground">
                  <Loader2 size={13} className="animate-spin" />
                  <span>Loading link preview…</span>
                </div>
              )}
            </div>
          )}

          {/* Selected location badge */}
          {selectedLocation && (
            <div className="flex flex-wrap gap-2 px-3 pt-2">
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[hsl(var(--surface-inset))] rounded-full text-sm animate-fade-in">
                <MapPin size={12} className="text-[hsl(var(--text-soft))]" />
                <span className="truncate max-w-[150px]">{selectedLocation.name}</span>
                <button onClick={() => setSelectedLocation(null)} className="text-muted-foreground hover:text-foreground">
                  <X size={12} />
                </button>
              </div>
            </div>
          )}

          {/* Main input row */}
          <div className="flex items-center gap-1.5 px-2.5 py-1.5">
            <InputPlusMenu
              emojis={emojis}
              selectedEmoji={selectedEmoji}
              onEmojiChange={setSelectedEmoji}
              selectedLocation={selectedLocation}
              onLocationChange={setSelectedLocation}
              availableTags={quickTags}
              selectedTags={selectedTags}
              onTagsChange={setSelectedTags}
              autoDetectedTags={autoDetectedTags}
              onPhotoClick={handlePhotoClick}
              photoCount={selectedPhotos.length}
              onAddLink={addLinkPreview}
              linkCount={selectedLinks.length}
              reminderConfig={reminderConfig}
              onReminderChange={setReminderConfig}
              showReminder={true}
              showTime={false}
            />
            <div className="flex-1 relative">
              <textarea
                ref={textareaRef}
                value={text}
                onChange={handleTextChange}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                placeholder={t('today.placeholder')}
                rows={1}
                className="w-full bg-transparent resize-none focus:outline-none text-foreground placeholder:text-muted-foreground/60 text-[14px] leading-5"
                style={{ minHeight: '24px', maxHeight: '100px' }}
              />


            </div>
            {/* Direct photo button */}
            <button
              onClick={handlePhotoClick}
              className="w-8 h-8 rounded-full transition-colors flex-shrink-0 hover:bg-[hsl(var(--surface-soft-hover))] text-muted-foreground hover:text-foreground flex items-center justify-center"
              title="Add photo"
            >
              <Image size={15} />
            </button>
            {/* Direct location button */}
            <Popover open={locationOpen} onOpenChange={setLocationOpen}>
              <PopoverTrigger asChild>
                <button
                  className={cn(
                    "w-8 h-8 rounded-full transition-colors flex-shrink-0 flex items-center justify-center",
                    selectedLocation
                      ? "bg-[hsl(var(--surface-inset))] text-foreground"
                      : "hover:bg-[hsl(var(--surface-soft-hover))] text-muted-foreground hover:text-foreground"
                  )}
                  title="Add location"
                >
                  <MapPin size={15} />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-3 bg-popover z-50" align="end" side="top">
                <LocationPopover
                  onSelect={(loc) => { setSelectedLocation(loc); setLocationOpen(false); }}
                  onClose={() => setLocationOpen(false)}
                />
              </PopoverContent>
            </Popover>
            {onOpenVoiceSheet && (
              <button
                onClick={onOpenVoiceSheet}
                className="w-8 h-8 rounded-full transition-colors flex-shrink-0 hover:bg-[hsl(var(--surface-soft-hover))] text-muted-foreground hover:text-foreground flex items-center justify-center"
              >
                <Mic size={15} />
              </button>
            )}
            <Button
              onClick={async () => {
                if (isSubmitting || !canSend) return;
                setIsSubmitting(true);
                try {
                  const rawText = lightlyPolishRecapText(text);
                  let finalText = rawText || undefined;
                  if (rawText && shouldSummarize(rawText)) {
                    const { title, detail } = buildLocalSummary(rawText);
                    finalText = detail ? title + DETAIL_SEPARATOR + detail : title;
                  }
                  const result = await onAddMoment({
                    text: finalText,
                    emoji: selectedEmoji || undefined,
                    photos: selectedPhotos,
                    links: selectedLinks,
                    location: selectedLocation || undefined,
                    tags: allFinalTags.length > 0 ? allFinalTags : undefined,
                  });
                  if (result && result.id && inputStartTime && onEditMoment) {
                    const dateStr = format(selectedDate, 'yyyy-MM-dd');
                    const startISO = new Date(`${dateStr}T${inputStartTime}:00`).toISOString();
                    const isSameTime = !inputEndTime || inputEndTime === inputStartTime;
                    const endISO = isSameTime ? undefined : new Date(`${dateStr}T${inputEndTime}:00`).toISOString();
                    const diffSec = endISO ? Math.max(0, Math.floor((new Date(endISO).getTime() - new Date(startISO).getTime()) / 1000)) : undefined;
                    await Promise.resolve(onEditMoment(result.id, {
                      timer_started_at: startISO, timer_ended_at: endISO || null, timer_seconds: diffSec ?? null,
                    } as Partial<Moment>));
                  }
                  if (reminderConfig.enabled && result) {
                    await addReminder(text.trim() || selectedEmoji || 'Reminder', reminderConfig.intervalDays, `From moment: ${text.trim()}`);
                  }
                  setText(''); setSelectedEmoji(null); setSelectedLocation(null); setSelectedPhotos([]); setSelectedLinks([]); setSelectedTags([]);
                  setReminderConfig({ enabled: false, intervalDays: 30 });
                  setInputStartTime(format(new Date(), 'HH:mm')); setInputEndTime(format(new Date(), 'HH:mm'));
                  if (textareaRef.current) textareaRef.current.style.height = 'auto';
                  if (result && result.id) startMomentTimer(result);
                } finally { setIsSubmitting(false); }
              }}
              variant="outline"
              disabled={!canSend || isSubmitting}
              size="icon"
              className="h-8 w-8 rounded-full flex-shrink-0 border-border text-muted-foreground hover:text-foreground hover:bg-[hsl(var(--surface-soft-hover))]"
              title="Add & start timer"
            >
              <Timer size={15} />
            </Button>
            <Button
              onClick={handleSend}
              disabled={!canSend || isSubmitting}
              size="icon"
              className="h-8 w-8 rounded-full flex-shrink-0 bg-primary/12 text-primary hover:bg-primary/18"
            >
              <ArrowUp size={15} />
            </Button>
          </div>
        </div>
        </div>
      </div>}

      {/* Moments list */}
      {/* Unified iOS-style timeline: merge completed todos + moments */}
      <div ref={recapContentRef} className="recap-readable-ui px-4 sm:px-5 lg:px-6 flex-1 overflow-y-auto mt-1 pb-40">
        <div className="lg:grid lg:grid-cols-[minmax(260px,3fr)_minmax(0,7fr)] lg:gap-6 lg:items-start">
          <div className="mb-5 lg:mb-0 flex flex-col gap-3">
            <EvidenceReviewCard
              moments={sortedMoments}
              todosDone={todosDone}
              todosTotal={todosTotal}
              reflection={dailyReflection}
              onSaveReflection={handleSaveReflection}
            />
            <DailyHabitTracker
              habits={recapHabits}
              selectedDateStr={selectedDateStr}
              onIncrement={(habitId, dateStr) => { void incrementHabitCount(habitId, dateStr); }}
              onSetCount={(habitId, nextCount, dateStr) => { void setHabitCount(habitId, nextCount, dateStr); }}
              onUpdateHabit={(habitId, updates) => { void updateDue(habitId, updates); }}
              onAddHabit={(title) => { void addDue(title, undefined, 'Uncategorized', true); }}
            />
            <LifeReplay items={timelineItems} lang={lang} dateKey={format(selectedDate, 'yyyy-MM-dd')} />
            <OnThisDayCard
              moments={historyMoments ?? []}
              selectedDate={selectedDate}
              onRevisit={(dateStr) => onSelectedDateChange(new Date(`${dateStr}T00:00:00`))}
            />
            <MemoryHorizonsCard moments={historyMoments ?? []} selectedDate={selectedDate} />
            {onTodayModeChange && (
              <div className="flex items-center justify-between pt-3 border-t border-border/20 mt-2">
                <span className="text-[11px] text-muted-foreground/50">
                  {[todosDone != null && todosTotal != null && todosTotal > 0 && `${todosDone}/${todosTotal} done`, sortedMoments.length > 0 && `${sortedMoments.length} moments`].filter(Boolean).join(' · ')}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onTodayModeChange('plan')}
                  className="rounded-full gap-1.5 text-[12px] font-semibold"
                >
                  Plan my day
                  <ChevronRight size={14} />
                </Button>
              </div>
            )}
          </div>
          <div className="min-w-0" ref={recapRightColRef}>

        {/* Unified timeline */}
        {(() => {
          // Build Life Rhythm segments
          type RhythmSegment = { tag: string; color: string; icon: string; durationMin: number; startMin: number; endMin: number };
          const rhythmSegments: RhythmSegment[] = [];
          
          for (const item of timelineItems) {
            if (item.isPlanOutline) continue; // Skip plan outlines from rhythm
            const title = item.type === 'todo' ? item.data.title : item.type === 'imported' ? item.data.title : (parseSubtitleDetail(item.data.text).subtitle || '');
            const tags = item.type === 'todo' ? item.data.tags : item.type === 'imported' ? undefined : item.data.tags;
            const tag = tags?.[0]?.toLowerCase() || autoClassifyTag(title) || 'life';
            const workTypeFallback = item.type === 'todo'
              ? WORK_TYPE_META[getWorkType({ entity: 'todo', id: item.data.id, title, tags })]?.color
              : item.type === 'moment'
                ? WORK_TYPE_META[getWorkType({ entity: 'moment', id: item.data.id, text: title, tags })]?.color
                : undefined;
            const fallback = workTypeFallback || (item.type === 'todo' ? 'hsl(var(--primary))' : item.type === 'imported' ? 'hsl(var(--accent))' : '#D5AE4C');
            const color = getActivityAccentColor({ title, tags, isDarkMode }) || fallback;
            const icon = getActivityTagIcon(title, tags) || '🍔';
            const startMin = item.time.getHours() * 60 + item.time.getMinutes();
            const endMin = item.endTime
              ? item.endTime.getHours() * 60 + item.endTime.getMinutes()
              : startMin + 5;
            const durationMin = Math.max(endMin - startMin, 5);

            // Merge with previous if same tag
            const prev = rhythmSegments[rhythmSegments.length - 1];
            if (prev && prev.tag === tag) {
              prev.durationMin += durationMin;
              prev.endMin = Math.max(prev.endMin, endMin);
            } else {
              rhythmSegments.push({ tag, color, icon, durationMin, startMin, endMin });
            }
          }

          const totalRhythmMin = rhythmSegments.reduce((s, r) => s + r.durationMin, 0);

          if (timelineItems.length === 0) {
            return (
              <div className="flex min-h-[42vh] items-center justify-center">
                <div className="w-full max-w-md rounded-3xl border border-border bg-[hsl(var(--surface-soft))] px-8 py-10 text-center shadow-[0_8px_24px_hsl(var(--foreground)/0.04)]">
                  <p className="text-[17px] font-normal text-[hsl(var(--text-soft))]">
                    {lang === 'zh' ? '今天的回看' : 'Recap my day'}
                  </p>
                  <p className="mt-3 text-[12px] leading-6 text-muted-foreground/70">
                    {lang === 'zh' ? '还没有记录。在下方添加一条 moment。' : 'Nothing logged yet. Add a moment below.'}
                  </p>
                  <ChevronDown size={16} className="mx-auto mt-3 text-muted-foreground/35 animate-bounce" aria-hidden />
                </div>
              </div>
            );
          }

              // Calculate evidence summary stats
              const totalActiveMin = (() => {
                const spans: { start: number; end: number }[] = [];
                for (const item of timelineItems) {
                  if (item.isPlanOutline) continue;
                  if (!item.endTime) continue;
                  const start = item.time.getTime();
                  const end = item.endTime.getTime();
                  if (end > start) spans.push({ start, end });
                }
                return Math.round(mergedWallClockFocusMinutes(spans));
              })();
              const activeHours = Math.floor(totalActiveMin / 60);
              const activeMins = totalActiveMin % 60;
              const categoryCount = new Set(rhythmSegments.map(s => s.tag)).size;

              // ─── Build Today Landscape data: hourly density buckets ───
              const LANDSCAPE_START = WAKE_HOUR;
              const LANDSCAPE_END = BEDTIME_HOUR + (BEDTIME_MINUTE > 0 ? 1 : 0);
              const landscapeBuckets: { hour: number; density: number; color: string; tag: string; events: number; activeMin: number }[] = [];
              
              for (let h = LANDSCAPE_START; h < LANDSCAPE_END; h++) {
                const bucketStart = h * 60;
                const bucketEnd = (h + 1) * 60;
                let activeMin = 0;
                let events = 0;
                const tagMinutes = new Map<string, { min: number; color: string }>();
                
                for (const item of timelineItems) {
                  if (item.isPlanOutline) continue;
                  const itemStartMin = item.time.getHours() * 60 + item.time.getMinutes();
                  const itemEndMin = item.endTime 
                    ? item.endTime.getHours() * 60 + item.endTime.getMinutes()
                    : itemStartMin + 5;
                  
                  const overlapStart = Math.max(itemStartMin, bucketStart);
                  const overlapEnd = Math.min(itemEndMin, bucketEnd);
                  if (overlapStart < overlapEnd) {
                    const overlapMin = overlapEnd - overlapStart;
                    activeMin += overlapMin;
                    events++;
                    const title = item.type === 'todo' ? item.data.title : item.type === 'imported' ? item.data.title : (parseSubtitleDetail(item.data.text).subtitle || '');
                    const tags = item.type === 'todo' ? item.data.tags : item.type === 'imported' ? undefined : item.data.tags;
                    const tag = tags?.[0]?.toLowerCase() || autoClassifyTag(title) || 'life';
                    const workTypeFallback = item.type === 'todo'
                      ? WORK_TYPE_META[getWorkType({ entity: 'todo', id: item.data.id, title, tags })]?.color
                      : item.type === 'moment'
                        ? WORK_TYPE_META[getWorkType({ entity: 'moment', id: item.data.id, text: title, tags })]?.color
                        : undefined;
                    const fallback = workTypeFallback || (item.type === 'todo' ? 'hsl(var(--primary))' : item.type === 'imported' ? 'hsl(var(--accent))' : '#D5AE4C');
                    const color = getActivityAccentColor({ title, tags, isDarkMode }) || fallback;
                    const existing = tagMinutes.get(tag);
                    if (existing) existing.min += overlapMin;
                    else tagMinutes.set(tag, { min: overlapMin, color });
                  }
                }
                
                let dominantTag = 'life';
                let dominantColor = 'hsl(var(--muted))';
                let maxTagMin = 0;
                for (const [tag, info] of tagMinutes) {
                  if (info.min > maxTagMin) { maxTagMin = info.min; dominantTag = tag; dominantColor = info.color; }
                }
                
                const density = Math.min(activeMin / 60, 1);
                landscapeBuckets.push({ hour: h, density, color: dominantColor, tag: dominantTag, events, activeMin: Math.min(activeMin, 60) });
              }

              const maxDensity = Math.max(...landscapeBuckets.map(b => b.density), 0.1);
              const realItemCount = timelineItems.filter(i => !i.isPlanOutline).length;

              return (
            <>
               {/* ─── Today Summary (compact) ─── */}
               <div className="mb-2 pb-2 border-b border-border/30">
                 <div className="flex items-center gap-1.5 flex-wrap text-[13px]">
                   <span className="font-semibold text-foreground">{realItemCount}</span>
                   <span className="text-muted-foreground/60">{realItemCount === 1 ? t('recap.moment') : t('recap.moments')}</span>
                   {totalActiveMin > 0 && (
                     <>
                       <span className="text-muted-foreground/30">·</span>
                       <span className="font-semibold text-foreground">
                         {activeHours > 0 ? `${activeHours}h` : ''}{activeMins > 0 ? `${activeMins}m` : activeHours > 0 ? '' : '0m'}
                       </span>
                       <span className="text-muted-foreground/60">active</span>
                     </>
                   )}
                   {rhythmSegments.length > 0 && (() => {
                     const tagTotals = new Map<string, { min: number; color: string }>();
                     for (const seg of rhythmSegments) {
                       const existing = tagTotals.get(seg.tag);
                       if (existing) existing.min += seg.durationMin;
                       else tagTotals.set(seg.tag, { min: seg.durationMin, color: seg.color });
                     }
                     const sorted = [...tagTotals.entries()].sort((a, b) => b[1].min - a[1].min);
                     const TOP_N = 3;
                     const top = sorted.slice(0, TOP_N);
                     const extraCount = Math.max(0, sorted.length - TOP_N);
                     return (
                       <>
                         {top.map(([tag, info]) => {
                           const h = Math.floor(info.min / 60);
                           const m = info.min % 60;
                           return (
                             <span key={tag} className="flex items-center gap-0.5">
                               <span className="text-muted-foreground/30">·</span>
                               <span className="w-[5px] h-[5px] rounded-full flex-shrink-0" style={{ backgroundColor: info.color }} />
                               <span className="text-muted-foreground/50 ml-0.5">{tag}</span>
                               <span className="font-mono tabular-nums text-muted-foreground/40 text-[11px]">
                                 {h > 0 ? `${h}h` : ''}{m > 0 ? `${m}m` : h > 0 ? '' : '0m'}
                               </span>
                             </span>
                           );
                         })}
                         {extraCount > 0 && (
                           <span className="flex items-center gap-0.5">
                             <span className="text-muted-foreground/30">·</span>
                             <span className="text-muted-foreground/45 text-[11px]">+{extraCount} more</span>
                           </span>
                         )}
                       </>
                     );
                   })()}
                 </div>
                 {rhythmSegments.length > 0 && (() => {
                   const tagTotals = new Map<string, { min: number; color: string }>();
                   for (const seg of rhythmSegments) {
                     const existing = tagTotals.get(seg.tag);
                     if (existing) existing.min += seg.durationMin;
                     else tagTotals.set(seg.tag, { min: seg.durationMin, color: seg.color });
                   }
                   const sorted = [...tagTotals.entries()].sort((a, b) => b[1].min - a[1].min);
                   const totalMin = sorted.reduce((sum, [, info]) => sum + info.min, 0);
                   return (
                     <div className="flex h-[3px] rounded-full overflow-hidden bg-muted/30 mt-1.5">
                       {sorted.map(([tag, info]) => {
                         const pct = totalMin > 0 ? (info.min / totalMin) * 100 : 0;
                         const h = Math.floor(info.min / 60);
                         const m = info.min % 60;
                         const timeStr = h > 0 ? `${h}h${m > 0 ? ` ${m}m` : ''}` : `${m}m`;
                         return (
                           <div
                             key={tag}
                             className="relative h-full transition-opacity hover:opacity-80"
                             style={{ width: `${pct}%`, backgroundColor: info.color, minWidth: pct > 0 ? '3px' : 0 }}
                             title={`${tag} — ${timeStr}`}
                           />
                         );
                       })}
                     </div>
                   );
                 })()}
               </div>
              {shouldShowTimeBreakdownCard && (
                 <div className="mt-3 rounded-2xl border border-border/50 bg-[hsl(var(--surface-soft))] px-3 py-3">
                   <div className="flex items-center justify-between gap-2">
                     <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/70">
                       {lang === 'zh' ? '时间分布' : 'Time Breakdown'}
                     </p>
                     <div className="inline-flex rounded-full border border-border/55 bg-background/75 p-0.5">
                       {([
                         { key: 'today', zh: '今日', en: 'Today' },
                         { key: 'week', zh: '本周', en: 'Week' },
                         { key: 'month', zh: '本月', en: 'Month' },
                       ] as const).map((range) => {
                         const active = timeBreakdownRange === range.key;
                         return (
                           <button
                             key={range.key}
                             type="button"
                             onClick={() => setTimeBreakdownRange(range.key)}
                             className={cn(
                               'rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors',
                               active
                                 ? 'bg-primary/15 text-foreground'
                                 : 'text-muted-foreground hover:text-foreground/90',
                             )}
                           >
                             {lang === 'zh' ? range.zh : range.en}
                           </button>
                         );
                       })}
                     </div>
                   </div>
                   {activeTimeBreakdown.length > 0 ? (
                     <>
                       <div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-muted/40">
                         {activeTimeBreakdown.map((item) => (
                           <div
                             key={item.type}
                             style={{ width: `${item.pct}%`, backgroundColor: WORK_TYPE_META[item.type].color }}
                             title={`${WORK_TYPE_META[item.type].label} · ${item.pct}%`}
                           />
                         ))}
                       </div>
                       <div className="mt-2.5 flex flex-wrap gap-2">
                         {activeTimeBreakdown.map((item) => {
                           const hour = Math.floor(item.min / 60);
                           const minute = item.min % 60;
                           const durationLabel = hour > 0
                             ? `${hour}h${minute > 0 ? ` ${minute}m` : ''}`
                             : `${minute}m`;
                           return (
                             <span key={item.type} className="inline-flex items-center gap-1.5 rounded-full border border-border/55 bg-background/75 px-2.5 py-1 text-[11px] text-muted-foreground">
                               <span className="h-2 w-2 rounded-full" style={{ backgroundColor: WORK_TYPE_META[item.type].color }} />
                               <span className="font-medium text-foreground/85">{WORK_TYPE_META[item.type].label}</span>
                               <span>{item.pct}%</span>
                               <span className="text-muted-foreground/70">{durationLabel}</span>
                             </span>
                           );
                         })}
                       </div>
                     </>
                   ) : (
                     <p className="mt-2 text-xs text-muted-foreground/75">
                       {lang === 'zh'
                         ? '这个时间范围内还没有可聚合的计时记录。'
                         : 'No aggregate-able timed records in this range yet.'}
                     </p>
                   )}
                   {timeBreakdownRange !== 'today' && (
                     <p className="mt-2 text-[10px] text-muted-foreground/65">
                       {lang === 'zh'
                         ? 'Week/Month：当天含 Todo/Calendar 计时，历史日期目前基于 Moments 计时记录。'
                         : 'Week/Month includes today timeline; historical dates currently aggregate from timed Moments.'}
                     </p>
                   )}
                 </div>
               )}
               <PlanDrift
                 allTodos={allTodos}
                 completedTodos={completedTodos}
                 allMoments={todayMoments}
                 todayDateStr={selectedDateStr}
                 defaultCollapsed={false}
               />
               {priorityAlignment && (
                 <div className="mt-3 rounded-2xl border border-border/50 bg-[hsl(var(--surface-soft))] px-3 py-3">
                   <div className="flex items-start gap-2.5">
                     <div
                       className={cn(
                         'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border',
                         priorityAlignment.tone === 'aligned'
                           ? 'border-primary/25 bg-primary/10 text-primary'
                           : priorityAlignment.tone === 'mixed'
                             ? 'border-accent/30 bg-accent/10 text-foreground/80'
                             : 'border-primary/20 bg-background/70 text-muted-foreground'
                       )}
                     >
                       {priorityAlignment.tone === 'aligned' ? (
                         <CheckCircle2 className="h-4 w-4" />
                       ) : (
                         <Clock className="h-4 w-4" />
                       )}
                     </div>
                     <div className="min-w-0 flex-1">
                       <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/70">
                         {lang === 'zh' ? '优先级对齐' : 'Priority Alignment'}
                       </p>
                       <p className="mt-1 text-[13px] leading-5 text-foreground/88">
                         {lang === 'zh'
                           ? priorityAlignment.tone === 'aligned'
                             ? `列表前 ${priorityAlignment.topCount} 件事吃下了 ${priorityAlignment.sharePct}% 的任务计时，今天的执行基本跟着优先级走。`
                             : priorityAlignment.tone === 'mixed'
                               ? `列表前 ${priorityAlignment.topCount} 件事拿到 ${priorityAlignment.sharePct}% 的任务计时，优先级有跟上，但还不算稳。`
                               : `今天更多任务计时流向了列表后面的事，前排优先事项还没有真正占住时间。`
                           : priorityAlignment.tone === 'aligned'
                             ? `Your first ${priorityAlignment.topCount} tasks captured ${priorityAlignment.sharePct}% of tracked task time today.`
                             : priorityAlignment.tone === 'mixed'
                               ? `Your first ${priorityAlignment.topCount} tasks still got ${priorityAlignment.sharePct}% of tracked task time, but the day spread wider than planned.`
                               : `More tracked task time drifted to lower-ranked work than to the top of today's list.`}
                       </p>
                       <p className="mt-1 text-[11px] leading-4 text-muted-foreground/75">
                         {lang === 'zh'
                           ? priorityAlignment.firstUntouchedTitle
                             ? `前排还落着 ${priorityAlignment.firstUntouchedTitle}；如果它明天仍最重要，尽量更早开做。`
                             : priorityAlignment.strongestLowerPriorityTitle
                               ? `${priorityAlignment.strongestLowerPriorityTitle} 分走了 ${priorityAlignment.strongestLowerPriorityMin}m，但前排任务至少都已经启动。`
                               : `前排任务里已经有 ${priorityAlignment.completedTopCount}/${priorityAlignment.topCount} 件完成。`
                           : priorityAlignment.firstUntouchedTitle
                             ? `${priorityAlignment.firstUntouchedTitle} is still sitting near the top; if it stays important tomorrow, start it earlier.`
                             : priorityAlignment.strongestLowerPriorityTitle
                               ? `${priorityAlignment.strongestLowerPriorityTitle} still pulled ${priorityAlignment.strongestLowerPriorityMin}m, but the top of the list was at least started.`
                               : `${priorityAlignment.completedTopCount}/${priorityAlignment.topCount} of today's top tasks were completed.`}
                       </p>
                       <div className="mt-2 flex flex-wrap gap-2">
                         <span className="inline-flex items-center gap-1.5 rounded-full border border-border/55 bg-background/75 px-2.5 py-1 text-[11px] text-muted-foreground">
                           <span className="font-medium text-foreground/85">{priorityAlignment.sharePct}%</span>
                           <span>{lang === 'zh' ? '任务计时在前排' : 'task time on top items'}</span>
                         </span>
                         <span className="inline-flex items-center gap-1.5 rounded-full border border-border/55 bg-background/75 px-2.5 py-1 text-[11px] text-muted-foreground">
                           <span className="font-medium text-foreground/85">{priorityAlignment.touchedTopCount}/{priorityAlignment.topCount}</span>
                           <span>{lang === 'zh' ? '前排任务已启动' : 'top tasks started'}</span>
                         </span>
                       </div>
                     </div>
                   </div>
                 </div>
               )}
                  {/* ─── Timeline ─── */}
                  <div className="mb-1.5">
                    <p className="text-[11px] uppercase tracking-[0.08em] mb-1 text-muted-foreground/35 font-normal">{t('recap.timeline')}</p>
                  </div>

            {/* Life Stream: flowing vertical line with dots, threads, phase labels */}
            {(() => {
              type TaggedItem = typeof timelineItems[0] & { tag: string; dotColor: string; tagIcon?: string; title: string };
              const tagged: TaggedItem[] = timelineItems.map(item => {
                const title = item.type === 'todo' ? item.data.title : item.type === 'imported' ? item.data.title : (parseSubtitleDetail(item.data.text).subtitle || '');
                const tags = item.type === 'todo' ? item.data.tags : item.type === 'imported' ? undefined : item.data.tags;
                const tag = tags?.[0]?.toLowerCase() || autoClassifyTag(title) || '';
                const workTypeFallback = item.type === 'todo'
                  ? WORK_TYPE_META[getWorkType({ entity: 'todo', id: item.data.id, title, tags })]?.color
                  : item.type === 'moment'
                    ? WORK_TYPE_META[getWorkType({ entity: 'moment', id: item.data.id, text: title, tags })]?.color
                    : undefined;
                const fallback = workTypeFallback || (item.type === 'todo' ? 'hsl(var(--primary))' : item.type === 'imported' ? 'hsl(var(--accent))' : '#D5AE4C');
                const dotColor = getActivityAccentColor({ title, tags, isDarkMode }) || fallback;
                const tagIcon = getActivityTagIcon(title, tags);
                return { ...item, tag, dotColor, tagIcon, title };
              });

              // Extract keywords from title
              const getKeywords = (title: string): Set<string> => {
                const words = title.toLowerCase().replace(/[^\w\u4e00-\u9fff]/g, ' ').split(/\s+/).filter(w => w.length >= 2);
                return new Set(words);
              };

              const hasKeywordOverlap = (a: string, b: string): boolean => {
                const kwA = getKeywords(a);
                const kwB = getKeywords(b);
                for (const w of kwA) {
                  if (kwB.has(w)) return true;
                  for (const w2 of kwB) {
                    if (w.includes(w2) || w2.includes(w)) return true;
                  }
                }
                return false;
              };

              const THREAD_MAX_GAP_MS = 4 * 60 * 60 * 1000;
              const CLUSTER_GAP_MS = 60 * 60 * 1000;
              type Thread = { tag: string; color: string; icon?: string; items: TaggedItem[]; startTime: Date; endTime: Date; threadName?: string };
              const threads: Thread[] = [];

              for (const item of tagged) {
                const itemEnd = item.endTime || new Date(item.time.getTime() + 5 * 60000);
                const prev = threads[threads.length - 1];
                if (prev && item.tag && prev.tag === item.tag) {
                  const gap = item.time.getTime() - prev.endTime.getTime();
                  const kwMatch = prev.items.some(pi => hasKeywordOverlap(pi.title, item.title));
                  if ((kwMatch && gap < THREAD_MAX_GAP_MS) || gap < CLUSTER_GAP_MS) {
                    prev.items.push(item);
                    prev.endTime = itemEnd > prev.endTime ? itemEnd : prev.endTime;
                    continue;
                  }
                }
                threads.push({ tag: item.tag, color: item.dotColor, icon: item.tagIcon, items: [item], startTime: item.time, endTime: itemEnd });
              }

              // Generate thread names
              for (const thread of threads) {
                if (thread.items.length < 2) continue;
                const wordCount = new Map<string, number>();
                thread.items.forEach(item => {
                  getKeywords(item.title).forEach(w => {
                    wordCount.set(w, (wordCount.get(w) || 0) + 1);
                  });
                });
                let bestWord = '';
                let bestCount = 1;
                for (const [word, count] of wordCount) {
                  if (count > bestCount) { bestWord = word; bestCount = count; }
                }
                if (bestWord && bestCount >= 2) {
                  thread.threadName = bestWord.charAt(0).toUpperCase() + bestWord.slice(1);
                }
              }

              // Determine activity phases based on time
              const getPhaseLabel = (hour: number): string => {
                if (hour < 12) return t('recap.morning');
                if (hour < 14) return lang === 'zh' ? '午间' : 'Midday';
                if (hour < 17) return t('recap.afternoon');
                if (hour < 20) return t('recap.evening');
                return t('recap.night');
              };
              const getPhaseIcon = (hour: number): string => {
                if (hour < 12) return '☀';
                if (hour < 17) return '🌤';
                return '🌙';
              };

              let lastPhase = '';

              return (
                <div className="px-2">
                  {threads.map((thread, gi) => {
                    const isThread = thread.tag && thread.items.length > 1;
                    const firstHour = thread.startTime.getHours();
                    const phase = getPhaseLabel(firstHour);
                    const phaseIcon = getPhaseIcon(firstHour);
                    const showPhase = phase !== lastPhase;
                    if (showPhase) lastPhase = phase;

                    const clusterDurMin = Math.round((thread.endTime.getTime() - thread.startTime.getTime()) / 60000);
                    const durLabel = clusterDurMin >= 60
                      ? `${Math.floor(clusterDurMin / 60)}h${clusterDurMin % 60 > 0 ? ` ${clusterDurMin % 60}m` : ''}`
                      : `${clusterDurMin}m`;

                    const prevThread = gi > 0 ? threads[gi - 1] : null;
                    const gapMinutes = prevThread ? Math.round((thread.startTime.getTime() - prevThread.endTime.getTime()) / 60000) : 0;
                    const midpointTime = prevThread && gapMinutes > 10
                      ? new Date(prevThread.endTime.getTime() + (thread.startTime.getTime() - prevThread.endTime.getTime()) / 2)
                      : null;
                    const midpointStr = midpointTime ? format(midpointTime, 'HH:mm') : null;
                    const gapH = Math.floor(gapMinutes / 60);
                    const gapM = gapMinutes % 60;
                    const gapLabel = gapMinutes >= 60
                      ? `${gapH}h${gapM > 0 ? ` ${gapM}m` : ''}`
                      : `${gapMinutes}m`;

                    return (
                      <div key={gi}>
                        {/* ── Inline insert between threads ── */}
                        {midpointStr && gapMinutes > 10 && (
                          inlineInsertTime === midpointStr ? (
                            <div className="flex items-stretch gap-0">
                              <div className="w-14 flex-shrink-0 pt-[3px] text-right pr-3">
                              <span className="font-mono tabular-nums text-primary/60" style={{ fontSize: '14px' }}>{midpointStr}</span>
                              </div>
                              <div className="w-5 flex-shrink-0 flex flex-col items-center">
                                <div className="w-[9px] h-[9px] rounded-full bg-primary/60 mt-[6px] z-10 ring-2 ring-background" />
                                <div className="flex-1 w-[1.5px] bg-border" />
                              </div>
                              <div className="flex-1 pl-2 pr-1 py-2">
                                <div className="flex items-center gap-2">
                                  <input
                                    ref={inlineInsertRef}
                                    autoFocus
                                    value={inlineInsertText}
                                    onChange={e => setInlineInsertText(e.target.value)}
                                    onKeyDown={e => {
                                      if (e.key === 'Enter' && !e.nativeEvent.isComposing && inlineInsertText.trim()) {
                                        handleInlineInsert(midpointStr);
                                      }
                                      if (e.key === 'Escape') { setInlineInsertTime(null); setInlineInsertText(''); }
                                    }}
                                    placeholder={lang === 'zh' ? '记录这里发生的事...' : 'What happened here...'}
                                    className="flex-1 min-w-0 bg-secondary/50 rounded-lg px-3 py-1.5 text-[14px] focus:outline-none focus:ring-1 focus:ring-primary/30 placeholder:text-muted-foreground/30"
                                  />
                                  <button
                                    onClick={() => { if (inlineInsertText.trim()) handleInlineInsert(midpointStr); }}
                                    disabled={!inlineInsertText.trim() || inlineInsertSubmitting}
                                    className="p-1.5 rounded-full bg-primary text-primary-foreground disabled:opacity-30 flex-shrink-0"
                                  >
                                    <ArrowUp size={12} />
                                  </button>
                                  <button
                                    onClick={() => { setInlineInsertTime(null); setInlineInsertText(''); }}
                                    className="p-1 text-muted-foreground/40 hover:text-muted-foreground flex-shrink-0"
                                  >
                                    <X size={12} />
                                  </button>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="group/insert flex items-stretch gap-0">
                              <div className="w-14 flex-shrink-0" />
                              <div className="w-5 flex-shrink-0 flex flex-col items-center">
                                <div className="flex-1 w-[1.5px] bg-border" />
                              </div>
                              <div className="flex-1 pl-2 pr-1">
                                <button
                                  onClick={() => { setInlineInsertTime(midpointStr); setInlineInsertText(''); }}
                                  className="w-full py-1 flex items-center gap-2 opacity-0 group-hover/insert:opacity-100 transition-opacity duration-200"
                                >
                                  <div className="flex-1 h-px bg-primary/15 group-hover/insert:bg-primary/25 transition-colors" />
                                  <span className="text-[10px] uppercase tracking-[0.08em] text-primary/35 group-hover/insert:text-primary/55 whitespace-nowrap transition-colors">
                                    + {lang === 'zh' ? '记录' : 'add'}
                                    {gapMinutes >= 45 && (
                                      <span className="text-muted-foreground/22 ml-1 normal-case tracking-normal">{gapLabel}</span>
                                    )}
                                  </span>
                                  <div className="flex-1 h-px bg-primary/15 group-hover/insert:bg-primary/25 transition-colors" />
                                </button>
                              </div>
                            </div>
                          )
                        )}

                        {/* Phase label — TimelineView section header style */}
                        {showPhase && (
                          <div className="flex items-center gap-2 px-3 pt-4 pb-2">
                            <span className="text-xs" style={{ opacity: 0.5 }}>{phaseIcon}</span>
                            <span className="text-xs font-medium tracking-wide uppercase text-muted-foreground/50">
                              {phase}
                            </span>
                            <div className="flex-1 h-px bg-border/50" />
                          </div>
                        )}

                        {/* Thread header */}
                        {isThread && (
                          <div className="flex items-stretch gap-0">
                            <div className="w-14 flex-shrink-0 pt-[3px] text-right pr-3">
                              <span className="font-mono tabular-nums text-muted-foreground" style={{ fontSize: '14px' }}>
                                {format(thread.startTime, 'HH:mm')}
                              </span>
                            </div>
                            <div className="w-5 flex-shrink-0 flex flex-col items-center">
                              <div
                                className="w-[10px] h-[10px] rounded-full flex-shrink-0 mt-[6px] z-10 ring-2 ring-background border-2"
                                style={{ borderColor: thread.color, backgroundColor: 'hsl(var(--background))' }}
                              />
                              <div className="flex-1 w-[1.5px] bg-border" />
                            </div>
                            <div className="flex-1 pl-2 pr-1 py-1.5">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-[12px] font-medium" style={{ color: thread.color }}>
                                  {thread.icon || ''} {thread.threadName || `${thread.tag} block`}
                                </span>
                                <span className="text-[11px] text-muted-foreground/40 font-mono tabular-nums">
                                  {format(thread.startTime, 'HH:mm')}–{format(thread.endTime, 'HH:mm')} · {durLabel}
                                </span>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Items */}
                        {thread.items.map((item, ii) => {
                          const timeStr = format(item.time, 'HH:mm');
                          const isPlanOutline = !!item.isPlanOutline;
                          const isLastItem = gi === threads.length - 1 && ii === thread.items.length - 1;

                          if (item.type === 'todo') {
                            const todo = item.data;
                            const hasTime = todo.timer_started_at && todo.timer_ended_at;
                            const durationMin = todo.timer_seconds ? Math.floor(todo.timer_seconds / 60) : 0;
                            const hasProgress = todo.progress > 0 && todo.progress < 100;
                            const isSavedSession = !todo.is_completed && !isPlanOutline;
                            const todoDurLabel = durationMin >= 60
                              ? `${Math.floor(durationMin / 60)}h${durationMin % 60 > 0 ? ` ${durationMin % 60}m` : ''}`
                              : `${durationMin}m`;
                            return (
                              <StreamNode
                                key={`todo-${todo.id}${isPlanOutline ? '-plan' : ''}`}
                                timeStr={timeStr}
                                color={item.dotColor}
                                isPlanOutline={isPlanOutline}
                                isLast={isLastItem}
                              >
                                <div className="group/card relative">
                                  <div className={cn("flex items-center gap-2 min-w-0", isPlanOutline && "opacity-50")}>
                                    {item.tagIcon && <span className="text-[14px] flex-shrink-0">{item.tagIcon}</span>}
                                    {editingTodoId === todo.id && !isPlanOutline ? (
                                      <input
                                        autoFocus
                                        value={editingTodoTitle}
                                        onChange={e => setEditingTodoTitle(e.target.value)}
                                        onKeyDown={e => {
                                          if (e.key === 'Enter' && !e.nativeEvent.isComposing && editingTodoTitle.trim()) {
                                            onUpdateTodo?.(todo.id, { title: editingTodoTitle.trim() });
                                            setEditingTodoId(null);
                                          }
                                          if (e.key === 'Escape') setEditingTodoId(null);
                                        }}
                                        onBlur={() => {
                                          if (editingTodoTitle.trim() && editingTodoTitle.trim() !== todo.title) {
                                            onUpdateTodo?.(todo.id, { title: editingTodoTitle.trim() });
                                          }
                                          setEditingTodoId(null);
                                        }}
                                        className="flex-1 min-w-0 bg-transparent font-medium focus:outline-none border-b border-primary/30"
                                        style={{ fontSize: '16px' }}
                                      />
                                    ) : (
                                      <span
                                        className={cn(
                                          "truncate cursor-pointer transition-colors",
                                          isPlanOutline ? "text-muted-foreground" : "text-foreground hover:text-primary/80",
                                          !isPlanOutline && todo.is_completed && "text-foreground/80"
                                        )}
                                        style={{ fontSize: '16px', fontWeight: 600, lineHeight: 1.2 }}
                                        onClick={() => { if (!isPlanOutline) { setEditingTodoId(todo.id); setEditingTodoTitle(todo.title); } }}
                                      >{todo.title}</span>
                                    )}
                                    {isPlanOutline && (
                                      <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-destructive/60 bg-destructive/8 px-1.5 py-0.5 rounded-full flex-shrink-0 ml-auto">
                                        <X size={8} strokeWidth={2.5} /> {t('recap.missed')}
                                      </span>
                                    )}
                                    {!isPlanOutline && todo.is_completed && (
                                      <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-primary/70 bg-primary/8 px-1.5 py-0.5 rounded-full flex-shrink-0 ml-auto">
                                        <Check size={8} strokeWidth={2.5} />
                                      </span>
                                    )}
                                    {isSavedSession && (
                                      <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-primary/70 bg-primary/8 px-1.5 py-0.5 rounded-full flex-shrink-0 ml-auto">
                                        <Timer size={8} strokeWidth={2.2} /> saved
                                      </span>
                                    )}
                                  </div>
                                  {hasProgress && (
                                    <div className="mt-1.5 flex items-center gap-1.5">
                                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                                        <div className="h-full rounded-full bg-primary/50" style={{ width: `${todo.progress}%` }} />
                                      </div>
                                      <span className="text-[11px] text-muted-foreground/60">{todo.progress}%</span>
                                    </div>
                                  )}
                                  {/* Meta row */}
                                  <div className="flex items-center gap-x-3 gap-y-1 mt-1 flex-wrap">
                                    {!isPlanOutline && hasTime && durationMin > 0 && (
                                      <span className="font-mono tabular-nums text-muted-foreground/75" style={{ fontSize: '14px' }}>
                                        ⏱ {todoDurLabel}
                                      </span>
                                    )}
                                    {hasTime && durationMin > 0 && (
                                      <span className="font-mono tabular-nums text-muted-foreground/45" style={{ fontSize: '14px' }}>
                                        {format(parseISO(todo.timer_started_at!), 'HH:mm')} → {format(parseISO(todo.timer_ended_at!), 'HH:mm')}
                                      </span>
                                    )}
                                    {!isPlanOutline && (
                                      <button
                                        className="ml-auto flex items-center gap-0.5 text-[10px] text-muted-foreground/35 hover:text-muted-foreground/70 transition-colors"
                                        onClick={() => toggleStreamExpand(todo.id)}
                                      >
                                        {expandedStreamIds.has(todo.id) ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                                        <span>{todo.note ? 'notes' : 'notes'}</span>
                                        {todo.note && <span className="w-1 h-1 rounded-full bg-primary/50 ml-0.5" />}
                                      </button>
                                    )}
                                  </div>
                                  {/* Expanded note panel */}
                                  {expandedStreamIds.has(todo.id) && !isPlanOutline && (
                                    <NoteCard
                                      content={todo.note}
                                      onSave={(v) => onUpdateTodo?.(todo.id, { note: v || null })}
                                      onCollapse={() => toggleStreamExpand(todo.id)}
                                    />
                                  )}
                                </div>
                              </StreamNode>
                            );
                          }

                          if (item.type === 'imported') {
                            const event = item.data;
                            const timerStart = event.timer_started_at ? parseISO(event.timer_started_at) : null;
                            const timerEnd = event.timer_ended_at ? parseISO(event.timer_ended_at) : null;
                            const hasTimer = !!(timerStart && timerEnd);
                            const durationSec = event.timer_seconds || (hasTimer ? Math.max(0, Math.floor((timerEnd!.getTime() - timerStart!.getTime()) / 1000)) : 0);
                            const durationMin = Math.floor(durationSec / 60);
                            const durationLabel = durationMin >= 60
                              ? `${Math.floor(durationMin / 60)}h${durationMin % 60 > 0 ? ` ${durationMin % 60}m` : ''}`
                              : `${durationMin}m`;

                            return (
                              <StreamNode
                                key={`imported-${event.id}`}
                                timeStr={timeStr}
                                color={item.dotColor}
                                isLast={isLastItem}
                              >
                                <div className="group/card relative">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="text-[14px] flex-shrink-0">📅</span>
                                    {editingImportedEventId === event.id ? (
                                      <input
                                        autoFocus
                                        value={editingImportedEventTitle}
                                        onChange={e => setEditingImportedEventTitle(e.target.value)}
                                        onKeyDown={e => {
                                          if (e.key === 'Enter' && !e.nativeEvent.isComposing && editingImportedEventTitle.trim()) {
                                            onUpdateImportedEvent?.(event.id, { title: editingImportedEventTitle.trim() });
                                            setEditingImportedEventId(null);
                                          }
                                          if (e.key === 'Escape') setEditingImportedEventId(null);
                                        }}
                                        onBlur={() => {
                                          if (editingImportedEventTitle.trim() && editingImportedEventTitle.trim() !== event.title) {
                                            onUpdateImportedEvent?.(event.id, { title: editingImportedEventTitle.trim() });
                                          }
                                          setEditingImportedEventId(null);
                                        }}
                                        className="flex-1 min-w-0 bg-transparent font-medium focus:outline-none border-b border-primary/30"
                                        style={{ fontSize: '16px' }}
                                      />
                                    ) : (
                                      <span
                                        className="truncate cursor-pointer text-foreground hover:text-primary/80 transition-colors"
                                        style={{ fontSize: '16px', fontWeight: 600, lineHeight: 1.2 }}
                                        onClick={() => {
                                          setEditingImportedEventId(event.id);
                                          setEditingImportedEventTitle(event.title);
                                        }}
                                      >
                                        {event.title}
                                      </span>
                                    )}
                                    {event.source_file === 'manual' && (
                                      <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-muted-foreground/60 bg-muted/40 px-1.5 py-0.5 rounded-full flex-shrink-0 ml-auto">
                                        calendar
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-x-3 gap-y-1 mt-1 flex-wrap">
                                    {hasTimer && durationMin > 0 && (
                                      <span className="font-mono tabular-nums text-muted-foreground/75" style={{ fontSize: '14px' }}>
                                        ⏱ {durationLabel}
                                      </span>
                                    )}
                                    <ImportedEventTimeEditor event={event} onUpdate={onUpdateImportedEvent} />
                                    {event.location && (
                                      <span className="flex items-center gap-1 text-muted-foreground/75 truncate" style={{ fontSize: '14px' }} title={event.location}>
                                        <MapPin size={14} className="flex-shrink-0" />
                                        <span className="truncate max-w-[180px]">{event.location}</span>
                                      </span>
                                    )}
                                    <button
                                      className="ml-auto flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] text-muted-foreground/45 hover:bg-primary/10 hover:text-primary transition-colors"
                                      onClick={() => startImportedEventTimer(event)}
                                    >
                                      <Timer size={10} />
                                      <span>{event.timer_started_at && !event.timer_ended_at ? 'timing' : 'start'}</span>
                                    </button>
                                  </div>
                                </div>
                              </StreamNode>
                            );
                          }

                          // Moment
                          const moment = item.data;
                          const { subtitle, detail } = parseSubtitleDetail(moment.text);
                          const hasTimer = moment.timer_started_at && moment.timer_ended_at;
                          const durationSec = moment.timer_seconds || 0;
                          const durationMin = Math.floor(durationSec / 60);
                          const momentDurLabel = durationMin >= 60
                            ? `${Math.floor(durationMin / 60)}h${durationMin % 60 > 0 ? `${durationMin % 60}m` : ''}`
                            : `${durationMin}m`;

                          return (
                            <StreamNode
                              key={`moment-${moment.id}`}
                              timeStr={timeStr}
                              color={item.dotColor}
                              isLast={isLastItem}
                            >
                              {editingMoment === moment.id ? (
                                /* ── Inline edit mode ── */
                                <div ref={editRef} data-edit-popover="true" className="space-y-2">
                                  <textarea
                                    autoFocus
                                    value={editText}
                                    onChange={e => setEditText(e.target.value)}
                                    onPaste={(e) => {
                                      const items = e.clipboardData?.items;
                                      if (!items) return;
                                      for (const item of Array.from(items)) {
                                        if (item.type.startsWith('image/')) {
                                          e.preventDefault();
                                          const file = item.getAsFile();
                                          if (!file) continue;
                                          const reader = new FileReader();
                                          reader.onload = (ev) => {
                                            const dataUrl = ev.target?.result as string;
                                            if (dataUrl) setEditPhotos(prev => uniquePhotoList([...prev, dataUrl]));
                                          };
                                          reader.readAsDataURL(file);
                                        }
                                      }
                                    }}
                                    placeholder={lang === 'zh' ? '标题' : 'Title'}
                                    className="w-full bg-secondary/50 rounded-lg px-3 py-2 text-[14px] focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                                    rows={1}
                                  />
                                  {editDetailText !== null && (
                                    <textarea
                                      value={editDetailText}
                                      onChange={e => setEditDetailText(e.target.value)}
                                      placeholder={lang === 'zh' ? '详情' : 'Details'}
                                      className="w-full bg-secondary/30 rounded-lg px-3 py-2 text-[13px] text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 resize-none border-l-2 border-primary/20"
                                      rows={3}
                                    />
                                  )}
                                  {editDetailText === null && (
                                    <button
                                      onClick={() => setEditDetailText('')}
                                      className="text-[11px] text-muted-foreground/40 hover:text-muted-foreground transition-colors"
                                    >
                                      + {lang === 'zh' ? '添加详情' : 'Add details'}
                                    </button>
                                  )}
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <MomentTimeEditor moment={moment} onEditMoment={onEditMoment} />
                                    <Popover open={editLocationOpen} onOpenChange={setEditLocationOpen}>
                                      <PopoverTrigger asChild>
                                        <button
                                          className={cn(
                                            "inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[12px] transition-colors",
                                            editLocation
                                              ? "bg-[hsl(var(--surface-inset))] text-foreground"
                                              : "bg-secondary/40 text-muted-foreground hover:text-foreground"
                                          )}
                                          title="Add location"
                                        >
                                          <MapPin size={13} />
                                          <span className="max-w-[140px] truncate">
                                            {editLocation ? editLocation.name : (lang === 'zh' ? '添加地点' : 'Add location')}
                                          </span>
                                        </button>
                                      </PopoverTrigger>
                                      <PopoverContent className="w-72 p-3 bg-popover z-50" align="start" side="bottom">
                                        <LocationPopover
                                          onSelect={(loc) => { setEditLocation(loc); setEditLocationOpen(false); }}
                                          onClose={() => setEditLocationOpen(false)}
                                        />
                                      </PopoverContent>
                                    </Popover>
                                  </div>
                                  {editPhotos.length > 0 && (
                                    <div className="flex gap-1.5 overflow-x-auto">
                                      {editPhotos.map((photo, pi) => (
                                        <div key={pi} className="relative flex-shrink-0">
                                          <StorageImage src={photo} alt="" className="w-10 h-10 object-cover rounded-lg" />
                                          <button onClick={() => removeEditPhoto(pi)} className="absolute -top-1 -right-1 w-4 h-4 bg-foreground text-background rounded-full flex items-center justify-center"><X size={10} /></button>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  <div className="flex flex-wrap gap-1">
                                    {editTags.map((tag, ti) => (
                                      <span key={ti} className="px-2 py-0.5 rounded-full text-[10px] bg-primary/10 text-primary flex items-center gap-1">
                                        {tag}
                                        <button onClick={() => setEditTags(prev => prev.filter((_, i) => i !== ti))}><X size={8} /></button>
                                      </span>
                                    ))}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <button onClick={() => editFileInputRef.current?.click()} className="p-1 text-muted-foreground hover:text-foreground"><Image size={13} /></button>
                                    <input ref={editFileInputRef} type="file" accept="image/*" multiple onChange={handleEditFileChange} className="hidden" />
                                    <div className="flex-1" />
                                    {onDeleteMoment && (
                                      <button onClick={() => { onDeleteMoment(moment.id); setEditingMoment(null); }} className="p-1 text-muted-foreground hover:text-destructive"><Trash2 size={13} /></button>
                                    )}
                                    <button onClick={() => setEditingMoment(null)} className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground">Cancel</button>
                                    <button onClick={saveEdit} className="px-3 py-1 text-xs bg-primary text-primary-foreground rounded-md hover:opacity-90">Save</button>
                                  </div>
                                </div>
                              ) : (
                                <div className="group/card relative flex items-start justify-between gap-3">
                                  <div className="flex-1 min-w-0">
                                    {/* Title row */}
                                    <div className="flex items-center gap-2 min-w-0">
                                      {!item.tagIcon && moment.emoji && <span className="text-[15px] flex-shrink-0">{moment.emoji}</span>}
                                      {item.tagIcon && <span className="text-[14px] flex-shrink-0">{item.tagIcon}</span>}
                                      <span
                                        className="truncate cursor-pointer text-foreground hover:text-primary/80 transition-colors"
                                        style={{ fontSize: '17px', fontWeight: 600, lineHeight: 1.2 }}
                                        onClick={() => startEdit(moment)}
                                      >
                                        {subtitle || moment.emoji || 'Moment'}
                                      </span>
                                      {moment.isSpecial && (
                                        <span className="flex-shrink-0 text-[13px]" title={lang === 'zh' ? '已留住' : 'Kept'}>💛</span>
                                      )}
                                      {/* Hover action icons */}
                                      <div className="flex items-center gap-0.5 opacity-0 group-hover/card:opacity-100 transition-opacity flex-shrink-0 ml-auto">
                                        <button onClick={() => startMomentTimer(moment)} className="p-1 text-muted-foreground/30 hover:text-primary transition-colors"><Timer size={12} /></button>
                                        <button onClick={() => startEdit(moment)} className="p-1 text-muted-foreground/30 hover:text-foreground transition-colors"><Pencil size={12} /></button>
                                        {onDeleteMoment && (
                                          <button onClick={() => onDeleteMoment(moment.id)} className="p-1 text-muted-foreground/30 hover:text-destructive transition-colors"><Trash2 size={12} /></button>
                                        )}
                                      </div>
                                    </div>

                                    {/* Meta row */}
                                    <div className="flex items-center gap-x-3 gap-y-1 mt-1 flex-wrap">
                                      {hasTimer && durationMin > 0 && (
                                        <span className="font-mono tabular-nums text-muted-foreground/75" style={{ fontSize: '14px' }}>
                                          ⏱ {momentDurLabel}
                                        </span>
                                      )}
                                      {moment.location && (
                                        onFocusLocationOnMap ? (
                                          <button
                                            type="button"
                                            onClick={() => onFocusLocationOnMap({ name: moment.location!.name, lat: moment.location!.lat, lng: moment.location!.lng })}
                                            className="flex items-center gap-1 text-muted-foreground/75 hover:text-primary transition-colors truncate"
                                            style={{ fontSize: '14px' }}
                                            title={lang === 'zh' ? `在地图上查看·${moment.location.name}` : `View on map · ${moment.location.name}`}
                                          >
                                            <MapPin size={14} className="flex-shrink-0" />
                                            <span className="truncate max-w-[180px] underline-offset-2 hover:underline">{moment.location.name}</span>
                                          </button>
                                        ) : (
                                          <span className="flex items-center gap-1 text-muted-foreground/75 truncate" style={{ fontSize: '14px' }} title={moment.location.name}>
                                            <MapPin size={14} className="flex-shrink-0" />
                                            <span className="truncate max-w-[180px]">{moment.location.name}</span>
                                          </span>
                                        )
                                      )}
                                      {hasTimer && durationMin > 0 && (
                                        <span className="font-mono tabular-nums text-muted-foreground/45" style={{ fontSize: '14px' }}>
                                          {format(parseISO(moment.timer_started_at!), 'HH:mm')} → {format(parseISO(moment.timer_ended_at!), 'HH:mm')}
                                        </span>
                                      )}
                                      <button
                                        className="ml-auto flex items-center gap-0.5 text-[10px] text-muted-foreground/35 hover:text-muted-foreground/70 transition-colors"
                                        onClick={() => toggleStreamExpand(moment.id)}
                                      >
                                        {expandedStreamIds.has(moment.id) ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                                        <span>notes</span>
                                        {detail && <span className="w-1 h-1 rounded-full bg-primary/50 ml-0.5" />}
                                      </button>
                                    </div>

                                    {/* Evidence tag chips */}
                                    {(() => {
                                      const displayTags = getMomentDisplayTags(moment.tags);
                                      if (displayTags.length === 0) return null;
                                      return (
                                        <div className="flex flex-wrap items-center gap-1 mt-1.5">
                                          {displayTags.slice(0, 4).map(tag => {
                                            const icon = TAG_CATEGORY_ICONS[tag.toLowerCase()];
                                            return (
                                              <span
                                                key={tag}
                                                className="inline-flex items-center gap-1 rounded-full bg-foreground/[0.04] px-2 py-0.5 text-[11px] font-medium text-muted-foreground/70"
                                              >
                                                {icon && <span className="text-[10px] leading-none">{icon}</span>}
                                                {tag}
                                              </span>
                                            );
                                          })}
                                        </div>
                                      );
                                    })()}

                                    {/* Expandable notes/detail */}
                                    {expandedStreamIds.has(moment.id) && (
                                      <StreamDetail
                                        detail={detail}
                                        onCollapse={() => toggleStreamExpand(moment.id)}
                                        onSaveDetail={(newDetail) => {
                                          if (onEditMoment) {
                                            const { subtitle: currentSubtitle } = parseSubtitleDetail(moment.text);
                                            const trimmedDetail = newDetail.trim();
                                            const finalText = trimmedDetail ? currentSubtitle + DETAIL_SEPARATOR + trimmedDetail : currentSubtitle;
                                            onEditMoment(moment.id, { text: finalText || undefined });
                                          }
                                        }}
                                      />
                                    )}

                                    {moment.links && moment.links.length > 0 && (
                                      <div className="mt-3 space-y-2">
                                        {moment.links.map((link, linkIndex) => (
                                          <LinkPreviewCard
                                            key={`${link.url}-${linkIndex}`}
                                            preview={link}
                                            compact
                                          />
                                        ))}
                                      </div>
                                    )}
                                  </div>

                                  {/* Right: photos (up to 4) */}
                                  {moment.photos.length > 0 && (
                                    <div className="flex-shrink-0 flex items-center gap-1.5">
                                      {moment.photos.slice(0, 4).map((photo, i) => {
                                        const singlePhoto = moment.photos.length === 1;
                                        const manyPhotos = moment.photos.length >= 3;
                                        return (
                                          <img
                                            key={i}
                                            src={photo}
                                            alt=""
                                            className={cn(
                                              "object-cover cursor-pointer border-[3px] border-white shadow-[0_12px_28px_hsl(var(--foreground)/0.12)] ring-1 ring-border/30 transition-transform hover:-translate-y-0.5 dark:border-foreground/[0.08]",
                                              singlePhoto
                                                ? "w-[96px] h-[124px] sm:w-[112px] sm:h-[144px] rounded-xl"
                                                : manyPhotos
                                                  ? "w-[60px] h-[76px] sm:w-[68px] sm:h-[88px] rounded-lg"
                                                  : "w-[72px] h-[92px] sm:w-[84px] sm:h-[108px] rounded-lg"
                                            )}
                                            onClick={() => setLightboxPhotos({ photos: moment.photos, index: i })}
                                          />
                                        );
                                      })}
                                      {moment.photos.length > 4 && (
                                        <button
                                          className="text-[12px] text-muted-foreground/60 pl-0.5"
                                          onClick={() => setLightboxPhotos({ photos: moment.photos, index: 0 })}
                                        >
                                          +{moment.photos.length - 4}
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}
                            </StreamNode>
                          );
                        })}
                      </div>
                    );
                  })}

                  {/* ── Add at end of timeline ── */}
                  {(() => {
                    const nowTime = format(new Date(), 'HH:mm');
                    const endInsertKey = `end-${nowTime}`;
                    return (
                      inlineInsertTime === endInsertKey ? (
                        <div className="flex items-stretch gap-0">
                          <div className="w-14 flex-shrink-0 pt-[3px] text-right pr-3">
                            <span className="font-mono tabular-nums text-primary/60" style={{ fontSize: '12px' }}>{nowTime}</span>
                          </div>
                          <div className="w-5 flex-shrink-0 flex flex-col items-center">
                            <div className="w-[9px] h-[9px] rounded-full bg-primary/60 mt-[6px] z-10 ring-2 ring-background" />
                          </div>
                          <div className="flex-1 pl-2 pr-1 py-2">
                            <div className="flex items-center gap-2">
                              <input
                                autoFocus
                                value={inlineInsertText}
                                onChange={e => setInlineInsertText(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter' && !e.nativeEvent.isComposing && inlineInsertText.trim()) {
                                    handleInlineInsert(nowTime);
                                  }
                                  if (e.key === 'Escape') { setInlineInsertTime(null); setInlineInsertText(''); }
                                }}
                                placeholder={lang === 'zh' ? '记录这里发生的事...' : 'What happened here...'}
                                className="flex-1 min-w-0 bg-secondary/50 rounded-lg px-3 py-1.5 text-[14px] focus:outline-none focus:ring-1 focus:ring-primary/30 placeholder:text-muted-foreground/30"
                              />
                              <button
                                onClick={() => { if (inlineInsertText.trim()) handleInlineInsert(nowTime); }}
                                disabled={!inlineInsertText.trim() || inlineInsertSubmitting}
                                className="p-1.5 rounded-full bg-primary text-primary-foreground disabled:opacity-30 flex-shrink-0"
                              >
                                <ArrowUp size={12} />
                              </button>
                              <button
                                onClick={() => { setInlineInsertTime(null); setInlineInsertText(''); }}
                                className="p-1 text-muted-foreground/40 hover:text-muted-foreground flex-shrink-0"
                              >
                                <X size={12} />
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="group/insert flex items-stretch gap-0">
                          <div className="w-14 flex-shrink-0" />
                          <div className="w-5 flex-shrink-0 flex flex-col items-center">
                            <div className="flex-1 w-[1.5px] bg-border" />
                          </div>
                          <div className="flex-1 pl-2 pr-1">
                            <button
                              onClick={() => { setInlineInsertTime(endInsertKey); setInlineInsertText(''); }}
                              className="w-full py-1 flex items-center gap-2 opacity-0 group-hover/insert:opacity-100 transition-opacity duration-200"
                            >
                              <div className="flex-1 h-px bg-primary/15 group-hover/insert:bg-primary/25 transition-colors" />
                              <span className="text-[11px] text-primary/40 group-hover/insert:text-primary/60 whitespace-nowrap transition-colors">
                                + {lang === 'zh' ? '记录' : 'add'}
                              </span>
                              <div className="flex-1 h-px bg-primary/15 group-hover/insert:bg-primary/25 transition-colors" />
                            </button>
                          </div>
                        </div>
                      )
                    );
                  })()}

                  {/* End cap */}
                  <div className="flex items-stretch gap-0">
                    <div className="w-14 flex-shrink-0" />
                    <div className="w-5 flex-shrink-0 flex justify-center">
                      <div className="w-[7px] h-[7px] rounded-full bg-border/60" />
                    </div>
                  </div>
                </div>
              );
            })()}

            </>
          );
        })()}
          </div>
        </div>
      </div>
      </>
      )}
    </div>
  );
}

/* ── Life Stream helper components ── */
function StreamNode({ timeStr, color, isPlanOutline, isLast, children }: {
  timeStr?: string; color: string; isPlanOutline?: boolean; isLast?: boolean; children: React.ReactNode;
}) {
  return (
    <div className="group flex items-stretch gap-0">
      {/* Time column */}
      <div className="w-14 flex-shrink-0 pt-[3px] text-right pr-3">
        {timeStr && (
          <span className="font-mono tabular-nums text-muted-foreground" style={{ fontSize: '14px' }}>
            {timeStr}
          </span>
        )}
      </div>
      {/* Dot + line column */}
      <div className="w-5 flex-shrink-0 flex flex-col items-center relative">
        <div
          className="w-[10px] h-[10px] rounded-full flex-shrink-0 mt-[6px] z-10 ring-2 ring-background"
          style={{
            backgroundColor: isPlanOutline ? 'transparent' : color,
            border: isPlanOutline ? `2px dashed ${color}` : 'none',
          }}
        />
        {!isLast && <div className="flex-1 w-[1.5px] bg-border" />}
      </div>
      {/* Content column */}
      <div className="flex-1 min-w-0 pb-2 pl-2 pr-1">
        {(() => {
          const outlineStyle: React.CSSProperties | undefined = isPlanOutline
            ? { borderStyle: 'dashed', borderWidth: '1.8px', borderColor: color }
            : undefined;
          return (
            <div
              className={cn(
                "rounded-xl transition-colors px-3 py-1.5 -ml-1",
                isPlanOutline ? "" : "hover:bg-muted/35"
              )}
              style={outlineStyle}
            >
              {children}
            </div>
          );
        })()}
      </div>
    </div>
  );
}

/* ── simple markdown → safe HTML ── */
function renderMarkdown(text: string): string {
  // Escape HTML first to prevent XSS
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  let html = esc(text);

  // Headings
  html = html.replace(/^### (.+)$/gm, '<strong style="font-size:13px">$1</strong>');
  html = html.replace(/^## (.+)$/gm, '<strong style="font-size:14px">$1</strong>');
  html = html.replace(/^# (.+)$/gm, '<strong style="font-size:15px">$1</strong>');

  // Bold / italic
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code style="font-family:monospace;font-size:11px;background:rgba(0,0,0,0.06);padding:1px 4px;border-radius:3px">$1</code>');

  // Markdown links [text](url)
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" style="color:hsl(var(--primary));text-decoration:underline;text-decoration-color:hsl(var(--primary)/0.4)">$1</a>');

  // Raw URLs
  html = html.replace(/(^|[\s(])((https?:\/\/)[^\s<)"]+)/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer" style="color:hsl(var(--primary));text-decoration:underline;text-decoration-color:hsl(var(--primary)/0.4)">$2</a>');

  // Bullet lists
  html = html.replace(/^[-*] (.+)$/gm, '<span style="display:block;padding-left:12px">· $1</span>');

  // Line breaks
  html = html.replace(/\n\n/g, '<br/><br/>');
  html = html.replace(/\n/g, '<br/>');

  return html;
}

function NoteCard({ content, onSave, onCollapse }: {
  content?: string | null;
  onSave?: (v: string) => void;
  onCollapse?: () => void;
}) {
  // Auto-enter edit mode when there's no content yet
  const [editing, setEditing] = useState(!content);
  const [value, setValue] = useState(content ?? '');

  useEffect(() => {
    setValue(content ?? '');
    if (!content) setEditing(true);
  }, [content]);

  const handleSave = () => {
    if (onSave) onSave(value);
    setEditing(false);
  };

  const handleCancel = () => {
    setEditing(false);
    setValue(content ?? '');
    if (!content && onCollapse) onCollapse();
  };

  if (editing) {
    return (
      <div className="mt-2 rounded-xl bg-[hsl(var(--surface-soft))] overflow-hidden">
        <textarea
          autoFocus
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder="Type notes... supports **bold**, *italic*, [link](url)"
          className="w-full bg-transparent px-3 pt-2.5 pb-1 text-[12px] text-foreground/75 focus:outline-none resize-none leading-relaxed placeholder:text-muted-foreground/35"
          rows={4}
        />
        <div className="flex items-center justify-end gap-3 px-3 pb-2.5">
          <button onClick={handleCancel} className="text-[11px] text-muted-foreground/50 hover:text-muted-foreground transition-colors">Cancel</button>
          <button onClick={handleSave} className="text-[11px] text-primary hover:text-primary/80 font-medium transition-colors">Save</button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="group/note mt-2 relative rounded-xl bg-[hsl(var(--surface-soft))] px-3 py-2.5 cursor-pointer"
      onClick={() => { setValue(content ?? ''); setEditing(true); }}
    >
      <div
        className="text-[12px] text-foreground/55 leading-relaxed max-h-[180px] overflow-y-auto"
        dangerouslySetInnerHTML={{ __html: renderMarkdown(content ?? '') }}
      />
      <div className="absolute top-2 right-2 opacity-0 group-hover/note:opacity-100 transition-opacity">
        <Pencil size={10} className="text-muted-foreground/40" />
      </div>
    </div>
  );
}

function StreamDetail({ detail, onSaveDetail, onCollapse }: { detail?: string | null; onSaveDetail?: (newDetail: string) => void; onCollapse?: () => void }) {
  return <NoteCard content={detail} onSave={onSaveDetail} onCollapse={onCollapse} />;
}
