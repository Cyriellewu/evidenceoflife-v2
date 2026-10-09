import { useState, useCallback, useEffect, useMemo, useRef, Component, type ErrorInfo, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useDues } from '@/hooks/useDues';
import { DueNotifications } from '@/components/DueNotifications';
import { usePlaces } from '@/hooks/usePlaces';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/hooks/useLanguage';
import { format, isSameDay, parseISO, subDays } from 'date-fns';
import { SideNav } from '@/components/SideNav';
import { SheetSwitcher } from '@/components/sheet/SheetSwitcher';
import { MobileNavChrome } from '@/components/MobileNavChrome';
import { PlanPaneSwitcher } from '@/components/PlanPaneSwitcher';
import { TodayView } from '@/components/views/TodayView';
import { PlanView } from '@/components/views/PlanView';

import { CalendarView } from '@/components/views/CalendarView';
import { MapView } from '@/components/views/MapView';
import { DuesView } from '@/components/views/DuesView';
import { HabitsView } from '@/components/views/HabitsView';
import { ProfileView } from '@/components/views/ProfileView';
import { StickyNotesView } from '@/components/views/StickyNotesView';
import { LinksView } from '@/components/views/LinksView';
import { VoiceInputSheet } from '@/components/VoiceInputSheet';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useMoments } from '@/hooks/useMoments';
import { useTodos } from '@/hooks/useTodos';
import { usePrevDayTodos } from '@/hooks/usePrevDayTodos';
import { useImportedEvents } from '@/hooks/useImportedEvents';
import { useProfile } from '@/hooks/useProfile';
import { Moment, TabType, TodayMode } from '@/types';
import { showUndoToast } from '@/lib/undoToast';
import { extractLeadingEmoji } from '@/lib/emoji';
import { FocusTimerOverlay, FloatingTimer } from '@/components/FocusTimerOverlay';
import { FocusRecapPrompt, type FocusRecapDraft } from '@/components/FocusRecapPrompt';

function isActivelyRunningTodo(todo: { timer_started_at: string | null; timer_ended_at: string | null }) {
  if (!todo.timer_started_at || todo.timer_ended_at) return false;
  const startedAt = new Date(todo.timer_started_at).getTime();
  return Number.isFinite(startedAt) && startedAt <= Date.now();
}

function safeTimeLabel(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return null;
  return format(parsed, 'HH:mm');
}

class AppSectionErrorBoundary extends Component<
  { children: ReactNode; label: string },
  { hasError: boolean; message: string | null }
> {
  state = { hasError: false, message: null as string | null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error?.message || 'Unknown error' };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[AppSectionErrorBoundary:${this.props.label}]`, error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="m-4 rounded-[28px] border border-destructive/20 bg-card px-6 py-5">
          <p className="text-base font-semibold text-foreground">
            {this.props.label} crashed
          </p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground/75">
            {this.state.message || 'Unknown render error'}
          </p>
        </div>
      );
    }

    return this.props.children;
  }
}

function AppSideSheet({
  open,
  onOpenChange,
  maxWidthClass,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  maxWidthClass: string;
  children: ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        // Sit above phone chrome (z-130), demo banner (z-120), and Plan
        // composer/timer (z-55–70) so those never paint through Notes/etc.
        // Stay below the hamburger drawer (z-210/220).
        overlayClassName="!z-[190]"
        className={cn(
          '!z-[200] flex h-full w-full flex-col overflow-hidden p-0 border-border/60 bg-background/95 shadow-[0_24px_70px_hsl(var(--foreground)/0.14)] backdrop-blur-xl',
          maxWidthClass,
        )}
      >
        {children}
      </SheetContent>
    </Sheet>
  );
}

const Index = ({ publicDemo = false }: { publicDemo?: boolean }) => {
  const [searchParams] = useSearchParams();
  const { t, lang } = useLanguage();
  const isEmbeddedDemo = searchParams.get('embed') === '1';
  const forcedDemoStep = searchParams.get('demoStep');
  const landingDemoMode = publicDemo || (isEmbeddedDemo && !!forcedDemoStep);
  const demoFixedDate = useMemo(() => new Date('2026-04-08T12:00:00'), []);
  const [activeTab, setActiveTab] = useState<TabType>('today');
  const [todayMode, setTodayMode] = useState<TodayMode>(() => {
    if (typeof window === 'undefined') return 'plan';
    return window.matchMedia('(max-width: 767px)').matches ? 'recap' : 'plan';
  });
  const [voiceSheetOpen, setVoiceSheetOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  // Pending "focus this place on the map" request, carried into MapView when we jump there.
  const [mapFocus, setMapFocus] = useState<{ name: string; lat: number; lng: number; token: number } | null>(null);
  // Only one side sheet can be open at a time.
  const [activeSheet, setActiveSheet] = useState<'notes' | 'dues' | 'habits' | 'links' | null>(null);
  const openDues = useCallback(() => setActiveSheet('dues'), []);
  const librarySwitcher = (
    <SheetSwitcher<'notes' | 'links'>
      options={[
        { key: 'notes', label: lang === 'zh' ? '笔记' : 'Notes' },
        { key: 'links', label: lang === 'zh' ? '链接' : 'Links' },
      ]}
      value={activeSheet === 'links' ? 'links' : 'notes'}
      onChange={setActiveSheet}
    />
  );
  const upcomingSwitcher = (
    <SheetSwitcher<'dues' | 'habits'>
      options={[
        { key: 'dues', label: lang === 'zh' ? '截止' : 'Deadlines' },
        { key: 'habits', label: lang === 'zh' ? '习惯' : 'Habits' },
      ]}
      value={activeSheet === 'habits' ? 'habits' : 'dues'}
      onChange={setActiveSheet}
    />
  );
  
  const [selectedDate, setSelectedDate] = useState<Date>(() => (landingDemoMode ? demoFixedDate : new Date()));
  const [autoFollowToday, setAutoFollowToday] = useState(() => !landingDemoMode);
  const [timerTick, setTimerTick] = useState(0);
  const [timeOverrideTick, setTimeOverrideTick] = useState(0);

  // Global focus overlay state
  const [globalFocusId, setGlobalFocusId] = useState<string | null>(null);
  // Recap prompt shown right after a focus session ends (natural capture trigger)
  const [focusRecap, setFocusRecap] = useState<{ momentId: string | null; title: string; workingSec: number; completed: boolean } | null>(null);
  const pauseStatesRef = useRef<Map<string, { pausedAt: number | null; totalPausedMs: number }>>(new Map());
  const [pauseStateVersion, setPauseStateVersion] = useState(0);

  const {
    moments,
    allLocations,
    addMoment,
    editMoment,
    deleteMoment,
    restoreMoment,
    getMomentsForDate,
    getDayRecords,
    getStats,
  } = useMoments();
  const selectedDateStr = format(selectedDate, 'yyyy-MM-dd');
  const prevDateStr = format(subDays(selectedDate, 1), 'yyyy-MM-dd');
  const { todos, pastDayOpenTodos, updateTodo, addTodo, deleteTodo, toggleRecurring, refetch: refetchTodos } = useTodos(selectedDateStr);
  const prevDayTodos = usePrevDayTodos(prevDateStr);
  const { events: importedEvents, updateEvent: updateImportedEvent } = useImportedEvents();
  const { profile } = useProfile();
  const { addDue, dues } = useDues();
  const placesData = usePlaces();
  const momentStats = useMemo(() => getStats(), [getStats]);
  const embedTourEnabled = isEmbeddedDemo && searchParams.get('tour') === '1';

  useEffect(() => {
    const onOverrideUpdated = () => setTimeOverrideTick(v => v + 1);
    const onNavigateToDues = () => setActiveSheet('dues');
    window.addEventListener('day-time-override-updated', onOverrideUpdated);
    window.addEventListener('navigate-to-dues', onNavigateToDues);
    return () => {
      window.removeEventListener('day-time-override-updated', onOverrideUpdated);
      window.removeEventListener('navigate-to-dues', onNavigateToDues);
    };
  }, []);

  useEffect(() => {
    if (!landingDemoMode) return;
    setSelectedDate(demoFixedDate);
  }, [landingDemoMode, demoFixedDate]);

  useEffect(() => {
    if (landingDemoMode) return;

    const syncSelectedDateToToday = () => {
      const now = new Date();
      setSelectedDate(prev => (isSameDay(prev, now) ? prev : now));
      setAutoFollowToday(true);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') syncSelectedDateToToday();
    };

    const handleWindowFocus = () => {
      syncSelectedDateToToday();
    };

    if (autoFollowToday) {
      syncSelectedDateToToday();
    }

    const intervalId = autoFollowToday
      ? window.setInterval(syncSelectedDateToToday, 60_000)
      : null;
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleWindowFocus);

    return () => {
      if (intervalId != null) window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, [autoFollowToday, landingDemoMode]);

  const handleSelectedDateChange = useCallback((date: Date) => {
    setSelectedDate(date);
    setAutoFollowToday(isSameDay(date, new Date()));
  }, []);

  const dayTimeOverride = useMemo(() => {
    if (publicDemo) return null;
    try {
      const raw = localStorage.getItem(`day-time-override-${selectedDateStr}`);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }, [selectedDateStr, timeOverrideTick, publicDemo]);

  // Enhanced stats including todos
  const profileStats = useMemo(() => {
    // Count all unique dates with todos
    const allTodoDates = new Set<string>();
    // We only have current date todos, so we combine with moment dates
    todos.forEach(t => allTodoDates.add(t.date));
    
    const totalTasksDone = todos.filter(t => t.is_completed).length;
    
    return {
      daysRecorded: momentStats.daysRecorded,
      momentsCaptured: momentStats.momentsCaptured,
      placesVisited: momentStats.placesVisited,
      tasksDone: totalTasksDone,
    };
  }, [momentStats, todos]);

  useEffect(() => {
    if (activeTab === 'today') refetchTodos();
  }, [activeTab, refetchTodos]);

  useEffect(() => {
    if (forcedDemoStep) {
      switch (forcedDemoStep) {
        case 'plan':
          setActiveTab('today');
          setTodayMode('plan');
          return;
        case 'focus':
          setActiveTab('today');
          setTodayMode('plan');
          return;
        case 'recap':
          setActiveTab('today');
          setTodayMode('recap');
          return;
        case 'calendar':
          setActiveTab('calendar');
          return;
        case 'map':
          setActiveTab('map');
          return;
        case 'profile':
          setActiveTab('profile');
          return;
        default:
          break;
      }
    }
  }, [forcedDemoStep]);

  useEffect(() => {
    if (!embedTourEnabled) return;
    if (forcedDemoStep) return;

    const cycleMs = 18000;
    const tickMs = 250;
    const startedAt = Date.now();

    const applyTourStep = () => {
      const elapsed = (Date.now() - startedAt) % cycleMs;

      if (elapsed < 4000) {
        setActiveTab('today');
        setTodayMode('plan');
        return;
      }

      if (elapsed < 8000) {
        setActiveTab('today');
        setTodayMode('recap');
        return;
      }

      if (elapsed < 12000) {
        setActiveTab('calendar');
        return;
      }

      if (elapsed < 15000) {
        setActiveTab('map');
        return;
      }

      setActiveTab('profile');
    };

    applyTourStep();
    const intervalId = window.setInterval(applyTourStep, tickMs);
    return () => window.clearInterval(intervalId);
  }, [embedTourEnabled, forcedDemoStep]);

  const dayRecords = useMemo(() => getDayRecords(), [getDayRecords]);
  const todosDone = useMemo(() => todos.filter(t => t.is_completed).length, [todos]);
  const todosTotal = todos.length;
  const completedTodos = useMemo(() => todos.filter(t => t.is_completed), [todos]);
  const dateMoments = useMemo(() => getMomentsForDate(selectedDateStr), [getMomentsForDate, selectedDateStr]);
  const prevDayMoments = useMemo(() => getMomentsForDate(prevDateStr), [getMomentsForDate, prevDateStr]);

  // Filter imported events for selected date (compare in local time, not UTC)
  const recordedDates = useMemo(() => new Set<string>(Array.from(dayRecords.keys())), [dayRecords]);
  const dateImportedEvents = useMemo(() => {
    return importedEvents.filter(e => {
      const parsed = new Date(e.start_time);
      if (!Number.isFinite(parsed.getTime())) return false;
      const localDate = format(parsed, 'yyyy-MM-dd');
      return localDate === selectedDateStr;
    });
  }, [importedEvents, selectedDateStr]);
  const activeTimerTodos = useMemo(() => todos.filter(isActivelyRunningTodo), [todos]);
  const landingDemoFocusTodo = useMemo(() => {
    if (!landingDemoMode || forcedDemoStep !== 'focus') return null;
    return todos.find((todo) => todo.tags?.includes('focus')) || todos[0] || null;
  }, [forcedDemoStep, landingDemoMode, todos]);

  useEffect(() => {
    if (landingDemoMode) return;
    if (activeTimerTodos.length === 0) return;
    const interval = setInterval(() => setTimerTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, [activeTimerTodos.length, landingDemoMode]);

  // Force re-render every second when timers are active
  void timerTick;
  void pauseStateVersion;

  const handleFocusPauseStateChange = useCallback((todoId: string, pauseState: { pausedAt: number | null; totalPausedMs: number }) => {
    if (pauseState.pausedAt === null && pauseState.totalPausedMs === 0) {
      pauseStatesRef.current.delete(todoId);
    } else {
      pauseStatesRef.current.set(todoId, pauseState);
    }
    setPauseStateVersion(v => v + 1);
  }, []);

  const handleAddMoment = useCallback(async (data: {
    text?: string;
    emoji?: string;
    photos: string[];
    links?: import('@/types').MomentLinkPreview[];
    tags?: string[];
    location?: { name: string; lat: number; lng: number; category?: 'restaurant' | 'coffee' | 'grocery' | 'park' | 'museum' | 'other' };
    isSpecial?: boolean;
    timer_started_at?: string | null;
    timer_ended_at?: string | null;
    timer_seconds?: number | null;
    date?: string;
  }) => {
    const newMoment = await addMoment({
      date: selectedDateStr,
      ...data,
    });
    // Auto-create visit in places system when moment has location
    if (newMoment && data.location && data.location.lat && data.location.lng) {
      placesData.recordVisitFromMoment(data.location, selectedDateStr, newMoment.id, newMoment.photos);
    }
    return newMoment;
  }, [addMoment, selectedDateStr, placesData]);

  // Multiple focus timers may run at the same time — the user often does several
  // things in parallel. Each running timer (todo / moment / imported event) keeps
  // ticking independently and shows up as its own floating widget. We deliberately
  // do NOT collapse to a single timer.

  const handleEditMoment = useCallback(async (
    id: string,
    updates: Partial<Omit<Moment, 'location'>> & { location?: Moment['location'] | null }
  ) => {
    const existing = moments.find(moment => moment.id === id);
    await editMoment(id, updates);

    const photosTouched = Object.prototype.hasOwnProperty.call(updates, 'photos');
    const locationTouched = Object.prototype.hasOwnProperty.call(updates, 'location');
    const textTouched = Object.prototype.hasOwnProperty.call(updates, 'text');

    if (!existing || (!photosTouched && !locationTouched && !textTouched)) return;

    const nextLocation = locationTouched ? updates.location : existing.location;
    const nextPhotos = photosTouched ? (updates.photos || []) : existing.photos;
    const nextText = textTouched ? updates.text : existing.text;

    await placesData.syncVisitFromMoment(
      nextLocation ?? null,
      existing.date,
      id,
      nextText,
      nextPhotos
    );
  }, [editMoment, moments, placesData]);
  // Delete a moment with the same instant-Undo pattern used for tasks.
  const handleDeleteMoment = useCallback((id: string) => {
    const snapshot = moments.find(m => m.id === id);
    deleteMoment(id);
    if (!snapshot) return;
    const label = snapshot.text?.trim() || snapshot.emoji || (lang === 'zh' ? '这条记录' : 'this moment');
    showUndoToast({
      description: lang === 'zh' ? `已删除“${label}”` : `Deleted “${label}”`,
      undoLabel: lang === 'zh' ? '撤销' : 'Undo',
      onUndo: () => { restoreMoment(snapshot); },
    });
  }, [moments, deleteMoment, restoreMoment, lang]);

  // Jump to the Map and focus the place behind a moment's location.
  const handleFocusLocationOnMap = useCallback((location: { name: string; lat: number; lng: number }) => {
    setMapFocus({ ...location, token: Date.now() });
    setActiveTab('map');
  }, []);

  // Jump from a map visit back to the day it happened (Today recap).
  const handleOpenDate = useCallback((dateStr: string) => {
    const parsed = parseISO(dateStr);
    if (Number.isNaN(parsed.getTime())) return;
    setAutoFollowToday(false);
    setSelectedDate(parsed);
    setTodayMode('recap');
    setActiveTab('today');
  }, []);

  return (
    <div className="h-screen bg-background flex overflow-hidden">
      <div className="flex flex-1 h-full min-h-0">
        <AppSectionErrorBoundary label="SideNav">
          <SideNav
            activeTab={activeTab}
            activeSheet={activeSheet}
            onTabChange={(tab) => {
              if (tab === 'notes') { setActiveSheet('notes'); return; }
              if (tab === 'dues') { setActiveSheet('dues'); return; }
              if (tab === 'habits') { setActiveSheet('habits'); return; }
              if (tab === 'linkup') { setActiveSheet('links'); return; }
              setActiveSheet(null);
              setActiveTab(tab);
            }}
          />
        </AppSectionErrorBoundary>
        <main className="flex-1 min-h-0 min-w-0 overflow-y-auto px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:px-3 md:pb-0 lg:px-4">
          <AppSectionErrorBoundary label="MainContent">
          {(publicDemo || !landingDemoMode) && (
            <MobileNavChrome
              open={mobileNavOpen}
              onOpenChange={setMobileNavOpen}
              activeTab={activeTab}
              activeSheet={activeSheet}
              onTabChange={(tab) => {
                if (tab === 'notes') { setActiveSheet('notes'); return; }
                if (tab === 'dues') { setActiveSheet('dues'); return; }
                if (tab === 'habits') { setActiveSheet('habits'); return; }
                if (tab === 'linkup') { setActiveSheet('links'); return; }
                setActiveSheet(null);
                setActiveTab(tab);
              }}
              centerSlot={
                activeTab === 'today'
                  ? (
                    <PlanPaneSwitcher
                      todayMode={todayMode}
                      onTodayModeChange={setTodayMode}
                    />
                  )
                  : undefined
              }
            />
          )}
          {activeTab === 'today' && (
          <>
            <TodayView
              selectedDate={selectedDate}
              onSelectedDateChange={handleSelectedDateChange}
              recordedDates={recordedDates}
              getMomentsForDate={getMomentsForDate}
              onAddMoment={handleAddMoment}
              onEditMoment={handleEditMoment}
              onDeleteMoment={handleDeleteMoment}
              onFocusLocationOnMap={handleFocusLocationOnMap}
              todayMode={todayMode}
              onTodayModeChange={(mode) => {
                setTodayMode(mode);
              }}
              todosDone={todosDone}
              todosTotal={todosTotal}
              completedTodos={completedTodos}
              allTodos={todos}
              allMoments={dateMoments}
              historyMoments={moments}
              importedEvents={dateImportedEvents}
              onUpdateTodo={updateTodo}
              onUpdateImportedEvent={updateImportedEvent}
              wakeHour={dayTimeOverride?.wake_hour ?? profile?.wake_hour ?? 8}
              wakeMinute={dayTimeOverride?.wake_minute ?? profile?.wake_minute ?? 0}
              bedtimeHour={dayTimeOverride?.bedtime_hour ?? profile?.bedtime_hour ?? 23}
              bedtimeMinute={dayTimeOverride?.bedtime_minute ?? profile?.bedtime_minute ?? 30}
              homepageImageUrl={profile?.homepage_image_url ?? undefined}
              onOpenVoiceSheet={() => setVoiceSheetOpen(true)}
              voiceSheetOpen={voiceSheetOpen}
            />
            {todayMode === 'plan' && (
              <PlanView
                onTodosChanged={refetchTodos}
                date={selectedDateStr}
                todos={todos}
                pastDayOpenTodos={pastDayOpenTodos}
                toggleRecurring={toggleRecurring}
                addTodo={addTodo}
                updateTodo={updateTodo}
                importedEvents={dateImportedEvents}
                prevDayTodos={prevDayTodos}
                prevDayMoments={prevDayMoments}
                onViewDues={openDues}
                onOpenVoiceSheet={() => setVoiceSheetOpen(true)}
                voiceSheetOpen={voiceSheetOpen}
                overlayOpen={!!activeSheet}
                onSwitchToRecap={() => setTodayMode('recap')}
                moments={dateMoments}
                onAddMoment={(data) => handleAddMoment(data)}
                onEditMoment={handleEditMoment}
                onDeleteMoment={handleDeleteMoment}
              />
            )}
          </>
          )}


          {activeTab === 'calendar' && (
          <CalendarView
            dayRecords={dayRecords}
            getMomentsForDate={getMomentsForDate}
            onAddMoment={addMoment}
            onEditMoment={handleEditMoment}
            onDeleteMoment={handleDeleteMoment}
            onUpdateTodo={updateTodo}
            onDeleteTodo={deleteTodo}
            todos={todos}
            onViewDues={openDues}
            initialDate={selectedDate}
            forcedViewMode={landingDemoMode && forcedDemoStep === 'calendar' ? 'week' : undefined}
            onSelectDate={handleSelectedDateChange}
          />
          )}



          {activeTab === 'map' && (
          <AppSectionErrorBoundary label="MapView">
            <MapView moments={allLocations} placesData={placesData} focusPlace={mapFocus} onOpenDate={handleOpenDate} />
          </AppSectionErrorBoundary>
          )}

          {activeTab === 'profile' && (
          <ProfileView
            stats={profileStats}
            moments={moments}
            dayRecords={dayRecords}
            getMomentsForDate={getMomentsForDate}
            todos={todos}
            importedEvents={importedEvents}
          />
          )}
          </AppSectionErrorBoundary>
        </main>
      </div>

      {/* Global Focus Overlay */}
      {globalFocusId && (() => {
        const focusTodo = activeTimerTodos.find(t => t.id === globalFocusId);
        if (!focusTodo) return null;
        return (
          <FocusTimerOverlay
            todo={focusTodo}
            pauseState={pauseStatesRef.current.get(focusTodo.id)}
            onPauseStateChange={(pauseState) => handleFocusPauseStateChange(focusTodo.id, pauseState)}
            onMinimize={() => setGlobalFocusId(null)}
            onComplete={async (workingSec, progress) => {
              const finalProgress = progress ?? 100;
              const endedAtISO = new Date().toISOString();
              let createdMomentId: string | null = null;
              try {
                if (finalProgress < 100 && focusTodo.timer_started_at && workingSec > 0) {
                  const created = await handleAddMoment({
                    text: focusTodo.title,
                    emoji: extractLeadingEmoji(focusTodo.title),
                    photos: [],
                    tags: ['focus-session', `todo-session:${focusTodo.id}`, ...(focusTodo.tags || [])],
                    timer_started_at: focusTodo.timer_started_at,
                    timer_ended_at: endedAtISO,
                    timer_seconds: workingSec,
                  });
                  createdMomentId = created?.id ?? null;
                }
                await updateTodo(focusTodo.id, {
                  timer_started_at: finalProgress < 100 ? null : focusTodo.timer_started_at,
                  timer_ended_at: finalProgress < 100 ? null : endedAtISO,
                  timer_seconds: (focusTodo.timer_seconds || 0) + workingSec,
                  is_completed: finalProgress >= 100,
                  progress: finalProgress,
                });
              } finally {
                setGlobalFocusId(null);
                pauseStatesRef.current.delete(focusTodo.id);
                setPauseStateVersion(v => v + 1);
                if (workingSec > 0) {
                  setFocusRecap({
                    momentId: createdMomentId,
                    title: focusTodo.title,
                    workingSec,
                    completed: finalProgress >= 100,
                  });
                }
              }
            }}
            onSaveAndContinue={async (workingSec, progress) => {
              const nextProgress = progress ?? focusTodo.progress ?? 0;
              const endedAtISO = new Date().toISOString();
              const snap = focusTodo;
              // Close immediately — don't wait for the DB round-trip
              setGlobalFocusId(null);
              pauseStatesRef.current.delete(snap.id);
              setPauseStateVersion(v => v + 1);
              try {
                let createdMomentId: string | null = null;
                if (snap.timer_started_at && workingSec > 0) {
                  const created = await handleAddMoment({
                    text: snap.title,
                    emoji: extractLeadingEmoji(snap.title),
                    photos: [],
                    tags: ['focus-session', `todo-session:${snap.id}`, ...(snap.tags || [])],
                    timer_started_at: snap.timer_started_at,
                    timer_ended_at: endedAtISO,
                    timer_seconds: workingSec,
                  });
                  createdMomentId = created?.id ?? null;
                }
                await updateTodo(snap.id, {
                  timer_started_at: null,
                  timer_ended_at: endedAtISO,
                  timer_seconds: (snap.timer_seconds || 0) + workingSec,
                  progress: nextProgress,
                  is_completed: false,
                });
                if (workingSec > 0) {
                  setFocusRecap({
                    momentId: createdMomentId,
                    title: snap.title,
                    workingSec,
                    completed: false,
                  });
                }
              } catch {
                // best-effort save
              }
            }}
            onCancel={async () => {
              await updateTodo(focusTodo.id, { timer_started_at: null, timer_ended_at: null });
              setGlobalFocusId(null);
              pauseStatesRef.current.delete(focusTodo.id);
              setPauseStateVersion(v => v + 1);
            }}
            onUpdateStartTime={async (newStartedAt) => {
              await updateTodo(focusTodo.id, { timer_started_at: newStartedAt });
            }}
            onUpdateEndTime={async (newEndedAt) => {
              await updateTodo(focusTodo.id, { plan_ended_at: newEndedAt });
            }}
          />
        );
      })()}

      {focusRecap && (
        <FocusRecapPrompt
          title={focusRecap.title}
          workingSec={focusRecap.workingSec}
          completed={focusRecap.completed}
          onSkip={() => setFocusRecap(null)}
          onSave={async (draft: FocusRecapDraft) => {
            const recap = focusRecap;
            setFocusRecap(null);
            if (!recap) return;
            const recapText = draft.note ? `${recap.title} · ${draft.note}` : recap.title;
            try {
              if (recap.momentId) {
                await handleEditMoment(recap.momentId, {
                  text: recapText,
                  ...(draft.mood ? { emoji: draft.mood } : {}),
                });
              } else {
                const endedAtISO = new Date().toISOString();
                const startedAtISO = new Date(Date.now() - recap.workingSec * 1000).toISOString();
                await handleAddMoment({
                  text: recapText,
                  emoji: draft.mood || undefined,
                  photos: [],
                  tags: ['focus-session'],
                  timer_started_at: startedAtISO,
                  timer_ended_at: endedAtISO,
                  timer_seconds: recap.workingSec,
                });
              }
              toast.success(t('focusRecap.saved'));
            } catch {
              // best-effort capture
            }
          }}
        />
      )}

      {landingDemoFocusTodo && !globalFocusId && (
        <FocusTimerOverlay
          todo={landingDemoFocusTodo}
          previewMode
          previewElapsedSec={24 * 60}
          onMinimize={() => {}}
          onComplete={() => {}}
          onSaveAndContinue={() => {}}
          onCancel={() => {}}
        />
      )}

      {/* Global floating timer widgets — hidden when PlanView is active (it has its own) */}
      {!landingDemoMode && activeTimerTodos.length > 0 && !globalFocusId && !activeSheet && !(activeTab === 'today' && todayMode === 'plan') && (
        <div className="fixed bottom-28 right-4 z-[60] flex flex-col gap-2 max-w-[calc(100vw-2rem)]" style={{ pointerEvents: 'auto' }}>
          {activeTimerTodos.map(t => (
            <FloatingTimer
              key={t.id}
              todo={t}
              isPaused={pauseStatesRef.current.get(t.id)?.pausedAt != null}
              pauseState={pauseStatesRef.current.get(t.id)}
              onClick={() => setGlobalFocusId(t.id)}
            />
          ))}
        </div>
      )}

      {!landingDemoMode && activeTab !== 'map' && (
        <AppSectionErrorBoundary label="DueNotifications">
          <DueNotifications dues={dues} onNavigateToDues={openDues} />
        </AppSectionErrorBoundary>
      )}

      {/* Library = Notes + Links; Upcoming = Deadlines + Habits. Each pair shares
          one nav entry and one sheet, switched from the sheet title. */}
      <AppSideSheet
        open={activeSheet === 'notes' || activeSheet === 'links'}
        onOpenChange={(open) => setActiveSheet(open ? 'notes' : null)}
        maxWidthClass="sm:max-w-[720px]"
      >
        {activeSheet === 'links'
          ? <LinksView titleSlot={librarySwitcher} />
          : <StickyNotesView titleSlot={librarySwitcher} />}
      </AppSideSheet>

      <AppSideSheet
        open={activeSheet === 'dues' || activeSheet === 'habits'}
        onOpenChange={(open) => setActiveSheet(open ? 'dues' : null)}
        maxWidthClass="sm:max-w-[780px]"
      >
        {activeSheet === 'habits'
          ? <HabitsView titleSlot={upcomingSwitcher} />
          : (
            <DuesView
              onBack={() => setActiveSheet(null)}
              onOpenVoiceSheet={() => setVoiceSheetOpen(true)}
              voiceSheetOpen={voiceSheetOpen}
              initialMode="deadline"
              lockedMode
              titleSlot={upcomingSwitcher}
            />
          )}
      </AppSideSheet>

      <AppSectionErrorBoundary label="VoiceInputSheet">
        <VoiceInputSheet
          open={voiceSheetOpen}
          onOpenChange={setVoiceSheetOpen}
          onAddMoment={handleAddMoment}
          onAddTodo={(title, seg) => addTodo(title, seg as Parameters<typeof addTodo>[1])}
          onAddDue={(title, dueDate, _isHabit) => addDue(title, _isHabit ? undefined : dueDate)}
          selectedDate={selectedDateStr}
          todayEvents={[
            ...completedTodos
              .map(t => ({
                time: safeTimeLabel(t.timer_started_at),
                title: t.title,
                duration: t.timer_seconds ? `${Math.floor(t.timer_seconds / 60)}m` : undefined,
              }))
              .filter((event): event is { time: string; title: string; duration: string | undefined } => Boolean(event.time))
              .map(event => ({
                time: event.time,
                title: event.title,
                duration: event.duration,
              })),
            ...dateMoments
              .map(m => ({
                time: safeTimeLabel(m.timer_started_at),
                title: m.text || m.emoji || 'Moment',
                duration: m.timer_seconds ? `${Math.floor(m.timer_seconds / 60)}m` : undefined,
              }))
              .filter((event): event is { time: string; title: string; duration: string | undefined } => Boolean(event.time))
              .map(event => ({
                time: event.time,
                title: event.title,
                duration: event.duration,
              })),
          ]}
        />
      </AppSectionErrorBoundary>
    </div>
  );
};

export default Index;
