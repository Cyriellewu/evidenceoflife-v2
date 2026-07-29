import { useState, useEffect, useRef, useCallback } from 'react';
import { format, differenceInDays, parseISO } from 'date-fns';
import { Plus, Calendar, Clock, Repeat, X, Link, Target, Camera, ChevronDown, ChevronUp, Mic } from 'lucide-react';
import { cn, isImeComposing } from '@/lib/utils';
import {
  normalizeUrl,
  isUrlLike as isStandaloneUrl,
  extractFirstUrl,
  getDomain as getSiteFallback,
} from '@/lib/linkUtils';
import { useDues, DueWithStats, DueLink } from '@/hooks/useDues';
import { useDueReminders } from '@/hooks/useDueReminders';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/hooks/useLanguage';
import { parseDateFromText as parseDateFromTextShared } from '@/lib/parseDateFromText';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { LinkPreviewCard } from '@/components/LinkPreviewCard';
import {
  hasRichPreview,
  LightweightLinkItem,
} from '@/components/views/dues/DueLinkItems';
import {
  CompactHabitCard,
} from '@/components/views/dues/DueCards';
import { DueCard } from '@/components/views/dues/DueCard';
import { SheetHeader, SheetEmptyState } from '@/components/sheet/SheetShell';
import { SheetComposer } from '@/components/sheet/SheetComposer';
import { toast } from 'sonner';
import { StorageImage } from "@/components/StorageImage";

type DuesViewMode = 'deadline' | 'habit';

export function DuesView({
  onBack,
  onOpenVoiceSheet,
  voiceSheetOpen,
  initialMode = 'deadline',
  lockedMode = false,
}: {
  onBack?: () => void;
  onOpenVoiceSheet?: () => void;
  voiceSheetOpen?: boolean;
  initialMode?: DuesViewMode;
  lockedMode?: boolean;
}) {
  const { t, lang } = useLanguage();
  const { dues, addDue, addToToday, deleteDue, updateDue, addStep, toggleStep, deleteStep, reorderDues, incrementHabitCount, setHabitCount, refetch } = useDues();
  const { getRemindersForDue, upsertReminder, removeReminder } = useDueReminders();
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [dueDateDraft, setDueDateDraft] = useState('');
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const [inputMode, setInputMode] = useState<DuesViewMode>(initialMode);
  const [habitCategory, setHabitCategory] = useState('');
  const PRESET_CATEGORIES = ['Health', 'Learning', 'Life'];
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [newLinkLabel, setNewLinkLabel] = useState('');
  const [pendingLinks, setPendingLinks] = useState<DueLink[]>([]);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const dueDateInputRef = useRef<HTMLInputElement>(null);
  const dueTimeInputRef = useRef<HTMLInputElement>(null);
  const [pendingPhotos, setPendingPhotos] = useState<string[]>([]);
  const [addingPendingLink, setAddingPendingLink] = useState(false);
  const { user } = useAuth();
  const [completedCollapsed, setCompletedCollapsed] = useState(true);
  const [upcomingCollapsed, setUpcomingCollapsed] = useState(false);
  const [noDateCollapsed, setNoDateCollapsed] = useState(false);
  const [focusedDueId, setFocusedDueId] = useState<string | null>(null);
  const [draggedHabitId, setDraggedHabitId] = useState<string | null>(null);
  const [habitDropTargetId, setHabitDropTargetId] = useState<string | null>(null);
  const [expandedHabitId, setExpandedHabitId] = useState<string | null>(null);

  const isDeadlineMode = inputMode === 'deadline';

  useEffect(() => {
    setInputMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') refetch();
    }, 60000);
    return () => clearInterval(interval);
  }, [refetch]);

  // Listen for navigate-to-dues with a specific dueId to auto-expand
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.dueId) {
        setFocusedDueId(detail.dueId);
        // Auto-scroll after a tick
        setTimeout(() => {
          const el = document.getElementById(`due-card-${detail.dueId}`);
          el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 200);
      }
    };
    window.addEventListener('navigate-to-dues', handler);
    return () => window.removeEventListener('navigate-to-dues', handler);
  }, []);





  const uploadPhotoFile = useCallback(async (file: File): Promise<string | null> => {
    if (!user || file.size > 5 * 1024 * 1024) return null;
    const { uploadMomentPhotoObject } = await import('@/lib/momentPhotos');
    const ext = file.type.split('/')[1] || file.name.split('.').pop() || 'jpg';
    return uploadMomentPhotoObject(user.id, file, file.type || `image/${ext}`, ext);
  }, [user]);

  const handlePhotoUploadForNew = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !user) return;
    for (const file of Array.from(files)) {
      const url = await uploadPhotoFile(file);
      if (url) setPendingPhotos(prev => [...prev, url]);
    }
    if (photoInputRef.current) photoInputRef.current.value = '';
  };

  const handleAddPendingLink = useCallback(async (rawUrl?: string) => {
    const url = normalizeUrl(rawUrl ?? newLinkUrl);
    if (!url) {
      toast.error('Invalid link');
      return false;
    }
    const existingLink = pendingLinks.find(link => link.url === url);
    if (existingLink && hasRichPreview(existingLink)) {
      setNewLinkUrl('');
      setNewLinkLabel('');
      return true;
    }

    setAddingPendingLink(true);
    try {
      const siteFallback = getSiteFallback(url);
      if (!existingLink) {
        setPendingLinks(prev => [
          ...prev,
          { url, label: newLinkLabel.trim() || siteFallback, title: siteFallback, siteName: siteFallback },
        ]);
      }
      setNewLinkUrl('');
      setNewLinkLabel('');

      const { data, error } = await supabase.functions.invoke('link-preview', { body: { url } });
      if (error) {
        console.error('Pending due link preview failed:', error);
        toast.warning('Preview unavailable, link added anyway');
        return true;
      }
      setPendingLinks(prev => prev.map(link => link.url === url ? {
        ...link,
        label: newLinkLabel.trim() || data?.title || data?.siteName || siteFallback,
        title: typeof data?.title === 'string' ? data.title : link.title,
        description: typeof data?.description === 'string' ? data.description : link.description,
        image: typeof data?.image === 'string' ? data.image : link.image,
        siteName: typeof data?.siteName === 'string' ? data.siteName : link.siteName,
      } : link));
      return true;
    } catch (err) {
      console.error('Pending due link preview exception:', err);
      toast.warning('Preview unavailable, link added anyway');
      return true;
    } finally {
      setAddingPendingLink(false);
    }
  }, [newLinkUrl, newLinkLabel, pendingLinks]);

  // Use shared date parser
  const parseDateFromTitle = (raw: string) => {
    const result = parseDateFromTextShared(raw);
    return { cleanTitle: result.cleanTitle, parsedDate: result.parsedDate };
  };

  const DUE_DATE_EDITABLE_POSITIONS = [0, 1, 3, 4, 6, 7, 8, 9, 12, 13, 15, 16] as const;
  const DUE_DATE_FIELDS = [
    [0, 1],
    [3, 4],
    [6, 7, 8, 9],
    [12, 13],
    [15, 16],
  ] as const;

  const getDefaultDueDateDraft = useCallback(() => {
    const now = new Date();
    return `${format(now, 'MM')}/__/` + `${format(now, 'yyyy')}, 23:59`;
  }, []);

  const parseManualDueDate = useCallback((raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return '';

    const match = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4}), (\d{2}):(\d{2})$/);
    if (!match) return null;

    const month = Number(match[1]);
    const day = Number(match[2]);
    const year = Number(match[3]);
    const hour = Number(match[4]);
    const minute = Number(match[5]);

    const candidate = new Date(year, month - 1, day, hour, minute);
    if (
      Number.isNaN(candidate.getTime()) ||
      candidate.getFullYear() !== year ||
      candidate.getMonth() + 1 !== month ||
      candidate.getDate() !== day ||
      hour < 0 ||
      hour > 23 ||
      minute < 0 ||
      minute > 59
    ) {
      return null;
    }

    return format(candidate, "yyyy-MM-dd'T'HH:mm");
  }, []);

  const formatManualDueDate = useCallback((value: string) => {
    try {
      return format(parseISO(value), 'MM/dd/yyyy, HH:mm');
    } catch {
      return value;
    }
  }, []);

  const replaceDraftChar = useCallback((draft: string, index: number, char: string) => {
    return `${draft.slice(0, index)}${char}${draft.slice(index + 1)}`;
  }, []);

  const findEditablePosition = useCallback((cursor: number, direction: 'forward' | 'backward') => {
    const positions = [...DUE_DATE_EDITABLE_POSITIONS];
    if (direction === 'forward') {
      return positions.find(pos => pos >= cursor) ?? positions[positions.length - 1];
    }
    for (let i = positions.length - 1; i >= 0; i -= 1) {
      if (positions[i] < cursor) return positions[i];
    }
    return positions[0];
  }, []);

  const getFieldForPosition = useCallback((cursor: number) => {
    return DUE_DATE_FIELDS.find(field => {
      const first = field[0];
      const last = field[field.length - 1];
      return cursor >= first && cursor <= last;
    }) ?? DUE_DATE_FIELDS[0];
  }, []);

  const findTargetInField = useCallback((draft: string, field: readonly number[], cursor: number) => {
    const blankInField = field.find(pos => draft[pos] === '_');
    if (blankInField !== undefined) return blankInField;
    return field.find(pos => pos >= cursor) ?? field[field.length - 1];
  }, []);

  const findNextCursorAfterField = useCallback((draft: string, field: readonly number[], currentPos: number) => {
    const nextInField = field.find(pos => pos > currentPos && draft[pos] === '_');
    if (nextInField !== undefined) return nextInField;

    const fieldIndex = DUE_DATE_FIELDS.findIndex(candidate => candidate === field);
    for (let i = fieldIndex + 1; i < DUE_DATE_FIELDS.length; i += 1) {
      const nextFieldBlank = DUE_DATE_FIELDS[i].find(pos => draft[pos] === '_');
      if (nextFieldBlank !== undefined) return nextFieldBlank;
    }

    return field[field.length - 1];
  }, []);

  const findFieldEndCursor = useCallback((field: readonly number[]) => {
    return field[field.length - 1] + 1;
  }, []);

  const findImmediateNextFieldStart = useCallback((field: readonly number[]) => {
    const fieldIndex = DUE_DATE_FIELDS.findIndex(candidate => candidate === field);
    const nextField = DUE_DATE_FIELDS[fieldIndex + 1];
    return nextField ? nextField[0] : findFieldEndCursor(field);
  }, [findFieldEndCursor]);

  const findCursorAfterFilledField = useCallback((field: readonly number[]) => {
    return field === DUE_DATE_FIELDS[0]
      ? findImmediateNextFieldStart(field)
      : findFieldEndCursor(field);
  }, [findFieldEndCursor, findImmediateNextFieldStart]);

  const setInputCursor = useCallback((position: number) => {
    requestAnimationFrame(() => {
      dueDateInputRef.current?.setSelectionRange(position, position);
    });
  }, []);

  const commitDueDateDraft = useCallback(() => {
    if (!dueDateDraft.trim()) {
      setDueDate('');
      setDueDateDraft(getDefaultDueDateDraft());
      return;
    }
    if (dueDateDraft.includes('_')) {
      setDueDate('');
      setDueDateDraft(dueDateDraft || getDefaultDueDateDraft());
      return;
    }
    const parsed = parseManualDueDate(dueDateDraft);
    if (parsed === null) {
      if (dueDateDraft.trim() === getDefaultDueDateDraft().trim()) {
        setDueDate('');
        setDueDateDraft(getDefaultDueDateDraft());
        return;
      }
      toast.error('Invalid deadline');
      setDueDateDraft(dueDate ? formatManualDueDate(dueDate) : getDefaultDueDateDraft());
      return;
    }
    setDueDate(parsed);
    setDueDateDraft(formatManualDueDate(parsed));
  }, [dueDate, dueDateDraft, formatManualDueDate, getDefaultDueDateDraft, parseManualDueDate]);

  const getNativeDueParts = useCallback(() => {
    if (!dueDate) return { date: '', time: '23:59' };
    try {
      const parsed = parseISO(dueDate);
      return {
        date: format(parsed, 'yyyy-MM-dd'),
        time: format(parsed, 'HH:mm'),
      };
    } catch {
      return { date: '', time: '23:59' };
    }
  }, [dueDate]);

  const applyNativeDueDate = useCallback((datePart: string, timePart = '23:59') => {
    if (!datePart) {
      setDueDate('');
      setDueDateDraft(getDefaultDueDateDraft());
      return;
    }

    const next = `${datePart}T${timePart || '23:59'}`;
    setDueDate(next);
    setDueDateDraft(formatManualDueDate(next));
  }, [formatManualDueDate, getDefaultDueDateDraft]);

  useEffect(() => {
    if (isDeadlineMode && !dueDate && !dueDateDraft) {
      setDueDateDraft(getDefaultDueDateDraft());
    }
  }, [dueDate, dueDateDraft, getDefaultDueDateDraft, isDeadlineMode]);

  const handleTitleInputChange = useCallback((value: string) => {
    const pastedUrl = extractFirstUrl(value);
    if (pastedUrl) {
      const withoutUrl = value.replace(pastedUrl, '').replace(/\s{2,}/g, ' ').trim();
      setTitle(withoutUrl);
      void handleAddPendingLink(pastedUrl);
      return;
    }
    setTitle(value);
  }, [handleAddPendingLink]);

  const updatePendingLinkLabel = useCallback((index: number, nextLabel: string) => {
    setPendingLinks(prev => prev.map((link, i) => i === index ? { ...link, label: nextLabel } : link));
  }, []);

  const handleAdd = async () => {
    if (!title.trim()) return;
    let finalTitle = title.trim();
    let finalDueDate = dueDate || '';

    // Auto-parse date from title if no manual due date set
    if (inputMode === 'deadline' && !finalDueDate) {
      const { cleanTitle, parsedDate } = parseDateFromTitle(finalTitle);
      if (parsedDate) {
        finalTitle = cleanTitle;
        finalDueDate = parsedDate;
      }
    }

    // Only pass habit_category if explicitly in habit mode
    const category = inputMode === 'habit' ? (habitCategory || 'Uncategorized') : undefined;
    await addDue(finalTitle, inputMode === 'deadline' ? (finalDueDate || undefined) : undefined, category);
    // After adding, refetch to get the new due's ID for attaching links/photos
    if (pendingLinks.length > 0 || pendingPhotos.length > 0) {
      await refetch();
    }
    // Use a short delay + re-read to find the new due
    if (pendingLinks.length > 0 || pendingPhotos.length > 0) {
      // Refetch again to ensure we have the latest data
      const { data: freshData } = await supabase
        .from('todos')
        .select('*')
        .like('date', '_due_%')
        .eq('title', finalTitle)
        .order('created_at', { ascending: false })
        .limit(1);
      if (freshData && freshData.length > 0) {
        const newDueId = freshData[0].id;
        if (pendingLinks.length > 0) await updateDue(newDueId, { links: pendingLinks });
        if (pendingPhotos.length > 0) await updateDue(newDueId, { photos: pendingPhotos });
      }
    }
    setTitle(''); setDueDate(''); setDueDateDraft(getDefaultDueDateDraft()); setHabitCategory('');
    setPendingLinks([]); setPendingPhotos([]); setShowPlusMenu(false);
    await refetch();
  };

  const handleAddToToday = async (id: string, stepTitle?: string) => {
    await addToToday(id, stepTitle);
    setJustAdded(id);
    setTimeout(() => setJustAdded(null), 2000);
  };

  const getRemindersForDueTree = useCallback((due: DueWithStats) => {
    return [
      ...getRemindersForDue(due.id),
      ...due.steps.flatMap(step => getRemindersForDue(step.id)),
    ];
  }, [getRemindersForDue]);

  const activeDues = dues.filter(d => !d.is_completed);
  const allCompletedDues = dues.filter(d => d.is_completed);

  // Separate habits from deadlines — habit_category distinguishes them
  const activeHabits = activeDues.filter(d => d.habit_category !== null);
  const activeDeadlines = activeDues.filter(d => d.habit_category === null);
  const completedDues = lockedMode
    ? allCompletedDues.filter(d => isDeadlineMode ? d.habit_category === null : d.habit_category !== null)
    : allCompletedDues;
  const visibleActiveCount = lockedMode
    ? (isDeadlineMode ? activeDeadlines.length : activeHabits.length)
    : activeDues.length;
  const hasFutureCommitments = visibleActiveCount > 0;
  const viewTitle = lockedMode ? (isDeadlineMode ? 'Deadlines' : 'Habits') : 'Commitments';

  const noDateDeadlines = activeDeadlines.filter(d => !d.due_date);

  const todayUrgent = activeDeadlines.filter(d => {
    if (!d.due_date) return false;
    const dueDate = parseISO(d.due_date);
    const daysLeft = differenceInDays(dueDate, new Date());
    return daysLeft <= 3;
  });

  const upcoming = activeDeadlines.filter(d => {
    if (!d.due_date) return false;
    const daysLeft = differenceInDays(parseISO(d.due_date), new Date());
    return daysLeft > 3;
  });

  const moveHabitBefore = useCallback(async (draggedId: string, targetId: string) => {
    if (!draggedId || !targetId || draggedId === targetId) return;
    const reordered = [...activeHabits];
    const fromIndex = reordered.findIndex(item => item.id === draggedId);
    const toIndex = reordered.findIndex(item => item.id === targetId);
    if (fromIndex === -1 || toIndex === -1) return;
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);
    await reorderDues(reordered.map(item => item.id));
  }, [activeHabits, reorderDues]);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      {lockedMode && (
        <SheetHeader
          title={
            isDeadlineMode
              ? (lang === 'zh' ? '截止任务' : 'Deadlines')
              : (lang === 'zh' ? '习惯' : 'Habits')
          }
          subtitle={
            isDeadlineMode
              ? (lang === 'zh' ? '保留有期限的任务,按期推进。' : 'Time-bound tasks. Pull the next one into Today.')
              : (lang === 'zh' ? '可重复的小事,逐日累计。' : 'Repeatable practices that build up over time.')
          }
          secondaryRow={
            <div className={cn(
              'inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold',
              isDeadlineMode
                ? 'bg-[hsl(var(--deadline)/0.10)] text-[hsl(var(--deadline))]'
                : 'bg-[hsl(var(--habit)/0.10)] text-[hsl(var(--habit))]',
            )}>
              {visibleActiveCount} {lang === 'zh' ? '进行中' : 'active'}
            </div>
          }
        />
      )}

      <div className="flex w-full max-w-[1040px] mx-auto flex-1 flex-col overflow-y-auto px-5 pb-4 pt-3">

      {!hasFutureCommitments && !lockedMode && (
        <div className="mb-5">
          <div className="rounded-3xl border border-border/70 bg-[hsl(var(--surface-soft))] px-5 py-4 shadow-[0_10px_28px_hsl(var(--foreground)/0.05)]">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-2xl">
                <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground/55">
                  Future Commitments
                </p>
                <h1 className="mt-1 text-[22px] font-semibold tracking-[-0.03em] text-foreground">
                  Deadlines and habits
                </h1>
                <p className="mt-1 max-w-[54ch] text-[14px] leading-6 text-muted-foreground">
                  Future work stays visible. Pull the next thing into Today.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <div className="min-w-[132px] rounded-2xl border border-[hsl(var(--deadline)/0.18)] bg-[hsl(var(--deadline)/0.07)] px-3 py-2.5">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-[hsl(var(--deadline)/0.78)]">Deadlines</p>
                  <div className="mt-1 flex items-end gap-2">
                    <p className="text-[20px] font-semibold leading-none text-foreground">{activeDeadlines.length}</p>
                    <p className="text-[11px] text-muted-foreground">{todayUrgent.length} urgent</p>
                  </div>
                </div>
                <div className="min-w-[132px] rounded-2xl border border-[hsl(var(--habit)/0.18)] bg-[hsl(var(--habit)/0.07)] px-3 py-2.5">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-[hsl(var(--habit)/0.78)]">Habits</p>
                  <div className="mt-1 flex items-end gap-2">
                    <p className="text-[20px] font-semibold leading-none text-foreground">{activeHabits.length}</p>
                    <p className="text-[11px] text-muted-foreground">repeatable</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              {noDateDeadlines.length > 0 ? (
                <div className="rounded-full bg-[hsl(var(--deadline)/0.10)] px-3 py-1.5 text-[12px] text-[hsl(var(--deadline))] shadow-[inset_0_0_0_1px_hsl(var(--deadline)/0.20)]">
                  {noDateDeadlines.length} deadline{noDateDeadlines.length > 1 ? 's' : ''} without a date
                </div>
              ) : (
                <div className="rounded-full bg-background px-3 py-1.5 text-[12px] text-muted-foreground shadow-[inset_0_0_0_1px_hsl(var(--border)/0.7)]">
                  {upcoming.length} upcoming deadline{upcoming.length === 1 ? '' : 's'}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {!hasFutureCommitments && lockedMode && (
        <SheetEmptyState
          className="mt-8"
          icon={isDeadlineMode ? <Clock size={20} /> : <Repeat size={20} />}
          title={
            isDeadlineMode
              ? (lang === 'zh' ? '还没有截止任务' : 'No deadlines yet')
              : (lang === 'zh' ? '还没有习惯' : 'No habits yet')
          }
          hint={
            isDeadlineMode
              ? (lang === 'zh' ? '在下方输入任务名,可选添加日期。' : 'Type a task below. Add a date if it matters.')
              : (lang === 'zh' ? '在下方输入想坚持的小事,比如「跑步」。' : 'Type something repeatable below, like “run”.')
          }
        />
      )}

      {hasFutureCommitments && !lockedMode && (
        <div className="mb-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-[19px] font-semibold tracking-[-0.03em] text-foreground">{viewTitle}</h2>
            </div>
          {!lockedMode && (
          <div className="flex gap-1.5">
            <button
              onClick={() => setInputMode('deadline')}
              className={cn(
                'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium transition-all',
                isDeadlineMode
                  ? 'border-[hsl(var(--deadline)/0.32)] bg-[hsl(var(--deadline)/0.11)] text-[hsl(var(--deadline))] shadow-sm'
                  : 'border-border bg-card text-muted-foreground hover:text-foreground'
              )}
            >
              <Clock size={14} />
              <span>{t('dues.deadline')}</span>
              <span className={cn(
                'flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold',
                isDeadlineMode ? 'bg-background/85 text-[hsl(var(--deadline))]' : 'bg-muted text-muted-foreground'
              )}>
                {activeDeadlines.length}
              </span>
            </button>
            <button
              onClick={() => setInputMode('habit')}
              className={cn(
                'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium transition-all',
                !isDeadlineMode
                  ? 'border-[hsl(var(--habit)/0.32)] bg-[hsl(var(--habit)/0.11)] text-[hsl(var(--habit))] shadow-sm'
                  : 'border-border bg-card text-muted-foreground hover:text-foreground'
              )}
            >
              <Repeat size={14} />
              <span>{t('dues.habit')}</span>
              <span className={cn(
                'flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold',
                !isDeadlineMode ? 'bg-background/85 text-[hsl(var(--habit))]' : 'bg-muted text-muted-foreground'
              )}>
                {activeHabits.length}
              </span>
            </button>
          </div>
          )}
          </div>
        </div>
      )}

      {/* Bottom composer — shared by Deadlines and Habits */}
      <input ref={photoInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoUploadForNew} />
      {!voiceSheetOpen && (
        <SheetComposer
          value={title}
          onChange={handleTitleInputChange}
          onSubmit={handleAdd}
          placeholder={isDeadlineMode ? t('dues.deadlinePlaceholder') : t('dues.habitPlaceholder')}
          onPaste={(e) => {
            const imageItem = Array.from(e.clipboardData.items).find(item => item.type.startsWith('image/'));
            if (imageItem) {
              e.preventDefault();
              const file = imageItem.getAsFile();
              if (file) void uploadPhotoFile(file).then(url => { if (url) setPendingPhotos(prev => [...prev, url]); });
              return;
            }
            const pastedText = e.clipboardData.getData('text/plain');
            const pastedUrl = extractFirstUrl(pastedText);
            if (pastedUrl && isStandaloneUrl(pastedUrl)) {
              e.preventDefault();
              void handleAddPendingLink(pastedUrl);
            }
          }}
          className="order-last mb-1 mt-4"
          leading={
            <Popover open={showPlusMenu} onOpenChange={setShowPlusMenu}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label="Attach"
                  className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-[hsl(var(--surface-soft-hover))] hover:text-foreground"
                >
                  <Plus size={16} />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-52 p-2 space-y-1.5" align="start" side="top">
                <button onClick={() => { photoInputRef.current?.click(); setShowPlusMenu(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] hover:bg-secondary transition-colors">
                  <Camera size={14} className="text-muted-foreground" />{t('dues.photo')}
                </button>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 px-3 py-1">
                    <Link size={14} className="text-muted-foreground flex-shrink-0" />
                    <span className="text-[12px] text-muted-foreground">{t('dues.link')}</span>
                  </div>
                  <input value={newLinkUrl} onChange={e => setNewLinkUrl(e.target.value)} placeholder="https://..."
                    className="w-full bg-secondary rounded-lg px-2.5 py-1.5 text-[13px] focus:outline-none focus:ring-1 focus:ring-primary"
                    onKeyDown={e => { const ne = e.nativeEvent as KeyboardEvent; if (e.key === 'Enter' && !ne.isComposing) void handleAddPendingLink(); }} />
                  <input value={newLinkLabel} onChange={e => setNewLinkLabel(e.target.value)} placeholder={t('dues.labelOptional')}
                    className="w-full bg-secondary rounded-lg px-2.5 py-1.5 text-[13px] focus:outline-none focus:ring-1 focus:ring-primary"
                    onKeyDown={e => { const ne = e.nativeEvent as KeyboardEvent; if (e.key === 'Enter' && !ne.isComposing) void handleAddPendingLink(); }} />
                  {newLinkUrl.trim() && (
                    <button onClick={() => void handleAddPendingLink()} className="text-[12px] text-primary hover:underline w-full text-left px-1" disabled={addingPendingLink}>{t('dues.addBtn')}</button>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          }
          trailing={
            onOpenVoiceSheet ? (
              <button
                type="button"
                onClick={onOpenVoiceSheet}
                aria-label="Voice input"
                className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-background/80 hover:text-foreground"
              >
                <Mic size={14} />
              </button>
            ) : null
          }
          attachments={(pendingLinks.length > 0 || pendingPhotos.length > 0) ? (
            <div className="flex flex-wrap gap-2 pb-2">
              {pendingLinks.map((link, i) => (
                isDeadlineMode ? (
                  <LightweightLinkItem
                    key={`${link.url}-${i}`}
                    link={link}
                    compact
                    onRemove={() => setPendingLinks(prev => prev.filter((_, idx) => idx !== i))}
                    onRename={(nextLabel) => updatePendingLinkLabel(i, nextLabel)}
                  />
                ) : (
                  <LinkPreviewCard
                    key={`${link.url}-${i}`}
                    preview={{
                      url: link.url,
                      title: link.title || link.label,
                      description: link.description,
                      image: link.image,
                      siteName: link.siteName,
                    }}
                    compact
                    className="max-w-[320px]"
                    onRemove={() => setPendingLinks(prev => prev.filter((_, idx) => idx !== i))}
                  />
                )
              ))}
              {pendingPhotos.map((photo, i) => (
                <div key={i} className="relative w-8 h-8 rounded-lg overflow-hidden">
                  <StorageImage src={photo} alt="" className="w-full h-full object-cover" />
                  <button onClick={() => setPendingPhotos(prev => prev.filter((_, idx) => idx !== i))} aria-label="Remove photo"
                    className="absolute top-0 right-0 bg-black/50 text-white p-0.5 rounded-bl"><X size={8} /></button>
                </div>
              ))}
            </div>
          ) : null}
          expand={isDeadlineMode ? (
            (() => {
              const parts = getNativeDueParts();
              return (
                <div className="flex items-center gap-2 rounded-full bg-[hsl(var(--surface-soft))] px-2.5 py-1.5 text-muted-foreground/80">
                  <button
                    type="button"
                    onClick={() => {
                      const input = dueDateInputRef.current;
                      input?.focus();
                      input?.showPicker?.();
                    }}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground/72 transition-colors hover:bg-background/85 hover:text-foreground"
                    aria-label="Choose due date"
                  >
                    <Calendar size={14} />
                  </button>
                  <label className="min-w-0 flex-1">
                    <span className="sr-only">Due date</span>
                    <input
                      ref={dueDateInputRef}
                      type="date"
                      value={parts.date}
                      onChange={(e) => applyNativeDueDate(e.target.value, parts.time)}
                      className="datetime-input-iconless w-full min-w-0 bg-transparent text-[13px] font-medium text-foreground/82 focus:outline-none"
                    />
                  </label>
                  <label className="w-[72px] shrink-0">
                    <span className="sr-only">Time</span>
                    <input
                      ref={dueTimeInputRef}
                      type="time"
                      value={parts.time}
                      onChange={(e) => applyNativeDueDate(parts.date || format(new Date(), 'yyyy-MM-dd'), e.target.value)}
                      className="datetime-input-iconless w-full bg-transparent text-[13px] font-medium text-foreground/82 focus:outline-none"
                    />
                  </label>
                  {dueDate && (
                    <button
                      type="button"
                      onClick={() => applyNativeDueDate('', '23:59')}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground/45 transition-colors hover:bg-background/85 hover:text-destructive"
                      aria-label="Clear due date"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              );
            })()
          ) : (
            <div className="flex items-center gap-2 px-1 py-0.5">
              <span className="text-[11px] text-muted-foreground/65">Category</span>
              <div className="flex gap-1.5 flex-1 flex-wrap">
                {PRESET_CATEGORIES.map(cat => (
                  <button key={cat} onClick={() => setHabitCategory(habitCategory === cat ? '' : cat)}
                    className={cn("px-2 py-0.5 rounded-full text-[11px] font-medium transition-colors",
                      habitCategory === cat ? "bg-primary/12 text-primary" : "bg-secondary text-muted-foreground hover:text-foreground"
                    )}>{cat}</button>
                ))}
                <input value={habitCategory && !PRESET_CATEGORIES.includes(habitCategory) ? habitCategory : ''}
                  onChange={e => setHabitCategory(e.target.value)}
                  placeholder="Custom..."
                  className="bg-transparent text-[12px] text-muted-foreground focus:outline-none w-20"
                  onKeyDown={e => {
                    const ne = e.nativeEvent as KeyboardEvent;
                    if (e.key === 'Enter') {
                      if (isImeComposing(ne)) return;
                      handleAdd();
                    }
                  }}
                />
              </div>
            </div>
          )}
        />
      )}

      <div className="mb-8">
        {isDeadlineMode ? (
          <div className="min-w-0">
          {/* Today / Urgent */}
          {todayUrgent.length > 0 && (
            <div className="mb-5">
              <h2 className="text-[12px] text-muted-foreground/62 uppercase tracking-[0.16em] mb-2.5 flex items-center gap-2" >
                <Target size={14} />
                {t('dues.todayUrgent')}
              </h2>
              <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,440px),1fr))]">
                {todayUrgent.map(due => (
                  <DueCard key={due.id} due={due} onUpdate={updateDue} onDelete={deleteDue}
                    onAddToToday={handleAddToToday} justAdded={justAdded === due.id}
                    dueReminders={getRemindersForDueTree(due)} onUpsertReminder={upsertReminder} onRemoveReminder={removeReminder}
                    onAddStep={addStep} onToggleStep={toggleStep} onDeleteStep={deleteStep}
                    onIncrementHabitCount={incrementHabitCount} onSetHabitCount={setHabitCount} />
                ))}
              </div>
            </div>
          )}

          {/* Upcoming */}
          {upcoming.length > 0 && (
            <div className="mb-5">
              <button onClick={() => setUpcomingCollapsed(!upcomingCollapsed)}
                className="w-full flex items-center justify-between text-[12px] text-muted-foreground/62 uppercase tracking-[0.16em] mb-2.5 hover:text-muted-foreground transition-colors" >
                <span className="flex items-center gap-2">
                  <Calendar size={14} />
                  {t('dues.upcoming')} ({upcoming.length})
                </span>
                {upcomingCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
              </button>
              {!upcomingCollapsed && (
                <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,440px),1fr))]">
                  {upcoming.map(due => (
                    <DueCard key={due.id} due={due} onUpdate={updateDue} onDelete={deleteDue}
                      onAddToToday={handleAddToToday} justAdded={justAdded === due.id}
                      dueReminders={getRemindersForDueTree(due)} onUpsertReminder={upsertReminder} onRemoveReminder={removeReminder}
                      onAddStep={addStep} onToggleStep={toggleStep} onDeleteStep={deleteStep}
                      onIncrementHabitCount={incrementHabitCount} onSetHabitCount={setHabitCount} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* No date yet */}
          {noDateDeadlines.length > 0 && (
            <div className="mb-5">
              <button onClick={() => setNoDateCollapsed(!noDateCollapsed)}
                className="w-full flex items-center justify-between text-[12px] text-muted-foreground/62 uppercase tracking-[0.16em] mb-2.5 hover:text-muted-foreground transition-colors">
                <span className="flex items-center gap-2">
                  <Calendar size={14} />
                  No date ({noDateDeadlines.length})
                </span>
                {noDateCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
              </button>
              {!noDateCollapsed && (
                <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,440px),1fr))]">
                  {noDateDeadlines.map(due => (
                    <DueCard key={due.id} due={due} onUpdate={updateDue} onDelete={deleteDue}
                      onAddToToday={handleAddToToday} justAdded={justAdded === due.id}
                      dueReminders={getRemindersForDueTree(due)} onUpsertReminder={upsertReminder} onRemoveReminder={removeReminder}
                      onAddStep={addStep} onToggleStep={toggleStep} onDeleteStep={deleteStep}
                      onIncrementHabitCount={incrementHabitCount} onSetHabitCount={setHabitCount} />
                  ))}
                </div>
              )}
            </div>
          )}
          </div>
        ) : activeHabits.length > 0 ? (
          <div
            className="grid gap-2.5"
            style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}
          >
            {activeHabits.map(due => expandedHabitId === due.id ? (
                <div
                  key={due.id}
                  draggable
                  onDragStart={() => {
                    setDraggedHabitId(due.id);
                    setHabitDropTargetId(due.id);
                  }}
                  onDragEnd={() => {
                    setDraggedHabitId(null);
                    setHabitDropTargetId(null);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (habitDropTargetId !== due.id) setHabitDropTargetId(due.id);
                  }}
                  onDrop={async (e) => {
                    e.preventDefault();
                    const currentDraggedId = draggedHabitId;
                    setDraggedHabitId(null);
                    setHabitDropTargetId(null);
                    if (currentDraggedId) {
                      await moveHabitBefore(currentDraggedId, due.id);
                    }
                  }}
                  className={cn(
                    'rounded-2xl border border-[hsl(var(--habit)/0.32)] bg-[hsl(var(--habit)/0.04)] transition-all',
                    draggedHabitId === due.id && 'opacity-60 scale-[0.985]',
                    habitDropTargetId === due.id && draggedHabitId !== due.id && 'ring-2 ring-[hsl(var(--habit)/0.35)] ring-offset-2 ring-offset-background',
                  )}
                >
                  <button
                    onClick={() => setExpandedHabitId(null)}
                    aria-label="Collapse"
                    className="w-full flex items-center justify-center py-1.5 text-muted-foreground/35 hover:text-muted-foreground transition-colors"
                  >
                    <ChevronUp size={14} />
                  </button>
                  <div className="px-1 pb-1">
                    <DueCard due={due} onUpdate={updateDue} onDelete={deleteDue}
                      onAddToToday={handleAddToToday} justAdded={justAdded === due.id}
                      dueReminders={getRemindersForDueTree(due)} onUpsertReminder={upsertReminder} onRemoveReminder={removeReminder}
                      onAddStep={addStep} onToggleStep={toggleStep} onDeleteStep={deleteStep}
                      onIncrementHabitCount={incrementHabitCount} onSetHabitCount={setHabitCount} />
                  </div>
                </div>
              ) : (
                <CompactHabitCard
                  key={due.id}
                  due={due}
                  expanded={false}
                  onToggleExpand={() => setExpandedHabitId(due.id)}
                  onIncrement={() => incrementHabitCount(due.id)}
                />
              ))}
          </div>
        ) : null}
      </div>

      {/* Empty */}
      {visibleActiveCount === 0 && !lockedMode && (
        <div>
          <p className="text-[13px] text-muted-foreground/65 text-center py-10">
            {t('dues.empty')}
          </p>
        </div>
      )}

      {/* Completed - collapsible */}
      {completedDues.length > 0 && (
        <div className="mb-8">
          <button onClick={() => setCompletedCollapsed(!completedCollapsed)}
            className="w-full flex items-center justify-between text-[13px] text-muted-foreground/50 uppercase tracking-wider mb-4 hover:text-muted-foreground transition-colors" >
            <span>{t('dues.completed')} ({completedDues.length})</span>
            {completedCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          </button>
          {!completedCollapsed && (
            <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,440px),1fr))]">
              {completedDues.map(due => (
                <DueCard key={due.id} due={due} onUpdate={updateDue} onDelete={deleteDue}
                  onAddToToday={handleAddToToday} justAdded={false}
                  dueReminders={getRemindersForDueTree(due)} onUpsertReminder={upsertReminder} onRemoveReminder={removeReminder}
                  onAddStep={addStep} onToggleStep={toggleStep} onDeleteStep={deleteStep}
                  onIncrementHabitCount={incrementHabitCount} onSetHabitCount={setHabitCount} />
              ))}
            </div>
          )}
        </div>
      )}

      </div>
    </div>
  );
}
