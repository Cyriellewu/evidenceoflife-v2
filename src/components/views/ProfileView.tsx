import { useState, useRef, ChangeEvent, useEffect, useMemo } from 'react';
import { LifeHeatmap } from '@/components/today/LifeHeatmap';
import { LifeCalendar } from '@/components/views/LifeCalendar';
import monetPainting from '@/assets/monet-impression-sunrise.jpg';
import { CircularTimeRing } from '@/components/CircularTimeRing';
import { AppearanceEditor } from '@/components/AppearanceEditor';
import { EmptyState } from '@/components/ui/empty-state';
import {
  BarChart3,
  Bell,
  BellOff,
  BookOpen,
  CalendarDays,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  Images,
  Pencil,
  RefreshCw,
  Settings,
  Sparkles,
  X,
} from 'lucide-react';
import { useLifeReminder } from '@/hooks/useLifeReminder';
import { useProfile } from '@/hooks/useProfile';
import { useDues } from '@/hooks/useDues';
import { useLanguage } from '@/hooks/useLanguage';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { GoogleCalendarButton } from '@/components/GoogleCalendarButton';
import { supabase } from '@/integrations/supabase/client';
import { TAG_CATEGORY_ICONS } from '@/lib/autoTag';
import { getMomentDisplayTags } from '@/lib/momentTags';
import { buildEvidenceExport, serializeEvidenceExport, evidenceExportFilename } from '@/lib/exportEvidence';
import { buildLocalLifeReplay } from '@/components/views/today/todayHelpers';
import { format } from 'date-fns';
import { DayRecord, Moment } from '@/types';
import { Todo } from '@/hooks/useTodos';
import { ImportedEvent } from '@/hooks/useImportedEvents';
import { StorageImage } from "@/components/StorageImage";

interface ProfileViewProps {
  stats: {
    daysRecorded: number;
    momentsCaptured: number;
    placesVisited: number;
    tasksDone: number;
  };
  moments: Moment[];
  dayRecords: Map<string, DayRecord>;
  getMomentsForDate: (date: string) => Moment[];
  todos?: Todo[];
  importedEvents?: ImportedEvent[];
}

function formatDuration(totalSeconds: number, lang: string) {
  const minutes = Math.max(0, Math.round(totalSeconds / 60));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h <= 0) return lang === 'zh' ? `${m}分钟` : `${m}m`;
  if (m <= 0) return lang === 'zh' ? `${h}小时` : `${h}h`;
  return lang === 'zh' ? `${h}小时${m}分钟` : `${h}h ${m}m`;
}

function shortDate(value: string) {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return value;
  return format(parsed, 'MMM d');
}

export function ProfileView({ stats, moments, dayRecords, getMomentsForDate, todos = [], importedEvents = [] }: ProfileViewProps) {
  const { profile, updateProfile, uploadHomepageImage } = useProfile();
  const { dues } = useDues();
  const [showLifeCalendar, setShowLifeCalendar] = useState(false);
  const { lang, setLang, t } = useLanguage();

  const [displayName, setDisplayName] = useState(profile?.display_name || '');
  const [isEditingName, setIsEditingName] = useState(false);
  const [wakeHour, setWakeHour] = useState(profile?.wake_hour ?? 8);
  const [wakeMinute, setWakeMinute] = useState(profile?.wake_minute ?? 0);
  const [bedtimeHour, setBedtimeHour] = useState(profile?.bedtime_hour ?? 23);
  const [bedtimeMinute, setBedtimeMinute] = useState(profile?.bedtime_minute ?? 30);
  const [uploading, setUploading] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [reflectionOpen, setReflectionOpen] = useState(false);
  const [showAllEvidence, setShowAllEvidence] = useState(false);
  const [lightboxPhoto, setLightboxPhoto] = useState<string | null>(null);
  const [albumOpen, setAlbumOpen] = useState(false);
  const photoStripRef = useRef<HTMLDivElement | null>(null);
  const scrollStrip = (dir: -1 | 1) => {
    const el = photoStripRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(240, el.clientWidth * 0.7), behavior: 'smooth' });
  };
  const fileInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const [lifeReplay, setLifeReplay] = useState<string | null>(null);
  const [replayLoading, setReplayLoading] = useState(false);

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const todayMoments = useMemo(() => moments.filter(m => m.date === todayStr), [moments, todayStr]);
  const todayTodos = useMemo(() => todos.filter(todo => todo.date === todayStr), [todos, todayStr]);
  const todayImportedEvents = useMemo(
    () => importedEvents.filter(event => {
      const parsed = new Date(event.start_time);
      return Number.isFinite(parsed.getTime()) && format(parsed, 'yyyy-MM-dd') === todayStr;
    }),
    [importedEvents, todayStr],
  );
  const todayFocusSeconds = useMemo(
    () => (
      todayMoments.reduce((sum, m) => sum + (m.timer_seconds || 0), 0) +
      todayTodos.reduce((sum, todo) => sum + (todo.timer_seconds || 0), 0)
    ),
    [todayMoments, todayTodos],
  );
  const evidenceStats = useMemo(() => {
    const recordedDays = new Set<string>();
    moments.forEach(moment => recordedDays.add(moment.date));
    todos.forEach(todo => {
      if (!todo.date.startsWith('_due_')) recordedDays.add(todo.date);
    });
    importedEvents.forEach(event => {
      const parsed = new Date(event.start_time);
      if (Number.isFinite(parsed.getTime())) recordedDays.add(format(parsed, 'yyyy-MM-dd'));
    });

    return {
      daysRecorded: Math.max(stats.daysRecorded, recordedDays.size),
      proofToday: todayMoments.length + todayTodos.filter(todo => todo.is_completed || (todo.timer_seconds || 0) > 0).length + todayImportedEvents.length,
      events: Math.max(stats.tasksDone, todos.filter(todo => todo.is_completed).length) + importedEvents.length,
    };
  }, [importedEvents, moments, stats.daysRecorded, stats.tasksDone, todayImportedEvents.length, todayMoments.length, todayTodos, todos]);
  const recentEvidence = useMemo(() => {
    return [...moments]
      .filter(m => m.text || m.emoji || m.photos.length > 0 || (m.tags && m.tags.length > 0))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [moments]);
  const visibleEvidence = showAllEvidence ? recentEvidence.slice(0, 24) : recentEvidence.slice(0, 3);

  const recentPhotos = useMemo(() => {
    const seen = new Set<string>();
    const out: { url: string; date: string; momentText: string }[] = [];
    [...moments]
      .sort((a, b) => new Date(b.createdAt || b.date).getTime() - new Date(a.createdAt || a.date).getTime())
      .forEach(m => {
        m.photos?.forEach(url => {
          if (!url || seen.has(url)) return;
          seen.add(url);
          out.push({ url, date: m.createdAt || m.date, momentText: m.text?.split('---DETAIL---')[0]?.trim() || m.emoji || '' });
        });
      });
    return out;
  }, [moments]);

  const upcomingDues = useMemo(() => {
    return dues
      .filter(due => !due.is_completed && due.due_date)
      .sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime())
      .slice(0, 3);
  }, [dues]);

  const handleExportEvidence = () => {
    try {
      const now = new Date();
      const data = buildEvidenceExport(moments, now);
      const blob = new Blob([serializeEvidenceExport(data)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = evidenceExportFilename(now);
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success(
        lang === 'zh'
          ? `已导出 ${data.counts.moments} 条记忆·${data.counts.days} 天`
          : `Exported ${data.counts.moments} moments · ${data.counts.days} days`,
      );
    } catch {
      toast.error(lang === 'zh' ? '导出失败，请重试' : 'Export failed, please try again');
    }
  };

  const randomMemory = useMemo(() => {
    const pastMoments = moments.filter(m => m.date !== todayStr && (m.text || m.emoji));
    if (pastMoments.length === 0) return null;
    return pastMoments[Math.floor(Math.random() * pastMoments.length)];
  }, [moments, todayStr]);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name || '');
      setWakeHour(profile.wake_hour);
      setWakeMinute(profile.wake_minute);
      setBedtimeHour(profile.bedtime_hour);
      setBedtimeMinute(profile.bedtime_minute);
    }
  }, [profile]);

  const generateLifeReplay = async () => {
    setReplayLoading(true);
    const events = todayMoments.map(m => ({
      time: m.createdAt ? format(new Date(m.createdAt), 'HH:mm') : '',
      title: m.tags?.[0] || m.text || m.emoji || '',
      duration: m.timer_seconds ? `${Math.round(m.timer_seconds / 60)}m` : '',
    })).filter(e => e.title);

    if (events.length < 3) {
      setLifeReplay(lang === 'zh' ? '活动还不够，需要至少 3 条' : 'Need at least 3 activities for a replay.');
      setReplayLoading(false);
      return;
    }

    try {
      const { data } = await supabase.functions.invoke('life-replay', { body: { events, lang } });
      setLifeReplay(data?.story || buildLocalLifeReplay(events, lang) || (lang === 'zh' ? '今天还没有足够的活动来生成回放。' : 'Not enough activity today for a replay.'));
    } catch {
      const fallback = buildLocalLifeReplay(events, lang);
      if (fallback) setLifeReplay(fallback);
      else toast.error(lang === 'zh' ? '回放生成失败' : 'Replay failed');
    }
    setReplayLoading(false);
  };

  const handleSave = async () => {
    await updateProfile({
      display_name: displayName || null,
      wake_hour: wakeHour,
      wake_minute: wakeMinute,
      bedtime_hour: bedtimeHour,
      bedtime_minute: bedtimeMinute,
    });
    toast.success(lang === 'zh' ? '已应用于所有天' : 'Applied to all days');
  };

  const handleSaveTimeTodayOnly = () => {
    const now = new Date();
    const dateKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    localStorage.setItem(`day-time-override-${dateKey}`, JSON.stringify({
      wake_hour: wakeHour, wake_minute: wakeMinute, bedtime_hour: bedtimeHour, bedtime_minute: bedtimeMinute,
    }));
    window.dispatchEvent(new CustomEvent('day-time-override-updated'));
    toast.success(lang === 'zh' ? '仅应用于今天' : 'Applied only to today');
  };

  const handleNameSave = async () => {
    setIsEditingName(false);
    if (displayName !== (profile?.display_name || '')) {
      await updateProfile({ display_name: displayName || null });
      toast.success(lang === 'zh' ? '名称已更新' : 'Name updated');
    }
  };

  const handleImageUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const url = await uploadHomepageImage(file);
    if (url) {
      await updateProfile({ homepage_image_url: url });
      toast.success(lang === 'zh' ? '图片已更新' : 'Image updated');
    }
    setUploading(false);
    e.target.value = '';
  };

  const handleAvatarUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    const url = await uploadHomepageImage(file);
    if (url) {
      await updateProfile({ avatar_url: url });
      toast.success(lang === 'zh' ? '头像已更新' : 'Avatar updated');
    }
    setUploadingAvatar(false);
    e.target.value = '';
  };

  const handleResetHomepageImage = async () => {
    await updateProfile({ homepage_image_url: null });
    toast.success(lang === 'zh' ? '已恢复默认' : 'Reset to default');
  };

  if (showLifeCalendar) {
    return (
      <LifeCalendar
        allMoments={moments}
        dayRecords={dayRecords}
        getMomentsForDate={getMomentsForDate}
        onClose={() => setShowLifeCalendar(false)}
      />
    );
  }

  const displayTitle = profile?.display_name || (lang === 'zh' ? '我的 Summary' : 'My Summary');

  return (
    <div className="flex-1 w-full overflow-y-auto bg-[hsl(var(--surface-soft))] px-4 pb-14 pt-4 sm:px-5 lg:px-7">
      <div className="mx-auto max-w-[1120px] space-y-4">
        <section className="overflow-hidden rounded-3xl border border-border/60 bg-background shadow-[0_24px_80px_-62px_rgba(88,70,54,0.42)]">
          <div className="grid gap-0 lg:grid-cols-[1fr_340px]">
            <div className="p-5 sm:p-6 lg:p-7">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3.5">
                  <button
                    onClick={() => avatarInputRef.current?.click()}
                    className="group relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-2xl border border-border/65 bg-primary/8 shadow-[0_14px_36px_-28px_rgba(190,120,82,0.5)]"
                  >
                    {profile?.avatar_url ? (
                      <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-[28px]">🌱</span>
                    )}
                    <span className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity group-hover:opacity-100">
                      <Camera size={16} className="text-white" />
                    </span>
                    {uploadingAvatar && <span className="absolute inset-0 bg-black/40" />}
                  </button>
                  <input ref={avatarInputRef} type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />

                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground/42">
                      {lang === 'zh' ? '生活证据总览' : 'Evidence dashboard'}
                    </p>
                    {isEditingName ? (
                      <div className="mt-1 flex items-center gap-1.5">
                        <input
                          value={displayName}
                          onChange={e => setDisplayName(e.target.value)}
                          onBlur={handleNameSave}
                          onKeyDown={e => { if (e.key === 'Enter') handleNameSave(); if (e.key === 'Escape') { setDisplayName(profile?.display_name || ''); setIsEditingName(false); } }}
                          className="w-48 border-b border-primary/45 bg-transparent py-0.5 text-[27px] font-semibold tracking-[-0.04em] text-foreground focus:outline-none"
                          autoFocus
                        />
                        <button onClick={handleNameSave} aria-label="Save name" className="text-primary"><Check size={15} /></button>
                      </div>
                    ) : (
                      <button className="group mt-1 flex max-w-full items-center gap-2 text-left" onClick={() => setIsEditingName(true)}>
                        <h1 className="truncate text-[30px] font-semibold leading-none tracking-[-0.055em] text-foreground sm:text-[34px]">
                          {displayTitle}
                        </h1>
                        <Pencil size={14} className="flex-shrink-0 text-muted-foreground/0 transition-colors group-hover:text-muted-foreground/55" />
                      </button>
                    )}
                    <p className="mt-2 max-w-[54ch] text-[13px] font-medium leading-5 text-muted-foreground/58">
                      {lang === 'zh' ? '看你最近留下了什么，以及今天有没有真的发生。' : 'A quiet view of what happened, and what needs attention.'}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setSettingsOpen(v => !v)}
                  className="inline-flex h-10 items-center gap-2 rounded-full border border-border/65 bg-card/80 px-3.5 text-[13px] font-semibold text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
                >
                  <Settings size={15} />
                  {lang === 'zh' ? '设置' : 'Settings'}
                </button>
              </div>

              <div className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                <SummaryMetric value={formatDuration(todayFocusSeconds, lang)} label={lang === 'zh' ? '今天专注' : 'Focused today'} icon={Clock3} primary />
                <SummaryMetric value={String(evidenceStats.proofToday)} label={lang === 'zh' ? '今天证据' : 'Proof today'} icon={Sparkles} />
                <SummaryMetric value={String(evidenceStats.daysRecorded)} label={t('profile.days')} icon={CalendarDays} />
                <SummaryMetric value={String(evidenceStats.events)} label={t('profile.tasksDone')} icon={BarChart3} />
              </div>
            </div>

            <button
              onClick={() => fileInputRef.current?.click()}
              className="group relative min-h-[170px] overflow-hidden border-t border-border/55 lg:border-l lg:border-t-0"
            >
              <img
                src={profile?.homepage_image_url || monetPainting}
                alt=""
                className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.025]"
              />
              <div className="absolute inset-0 bg-gradient-to-br from-background/20 via-background/0 to-background/38" />
              <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between gap-3">
                <span className="rounded-full bg-background/76 px-3 py-1.5 text-[11px] font-semibold text-muted-foreground backdrop-blur-md">
                  {lang === 'zh' ? '主页氛围图' : 'Home image'}
                </span>
                <span className="rounded-full bg-background/76 p-2 text-muted-foreground backdrop-blur-md">
                  <Camera size={14} />
                </span>
              </div>
            </button>
          </div>
        </section>

        {settingsOpen && (
          <section className="rounded-3xl border border-border/60 bg-background/92 p-4 shadow-[0_18px_60px_-48px_rgba(88,70,54,0.34)]">
            <div className="space-y-4">
              <AppearanceEditor
                lang={lang}
                homepageImageUrl={profile?.homepage_image_url}
                uploading={uploading}
                onUploadImage={handleImageUpload}
                onResetImage={handleResetHomepageImage}
              />

              <div className="rounded-3xl border border-border/55 bg-card/72 p-4">
                <div className="mb-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/45">
                    {lang === 'zh' ? '每日节奏' : 'Daily flow'}
                  </p>
                  <p className="mt-1 text-[12px] text-muted-foreground/58">
                    {lang === 'zh' ? '作息、提醒、语言与连接的服务。' : 'Day rhythm, reminders, language, and connected tools.'}
                  </p>
                </div>

                <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
                  <div>
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/55">
                      {lang === 'zh' ? '作息时间' : 'Day rhythm'}
                    </p>
                    <CircularTimeRing
                      wakeHour={wakeHour} wakeMinute={wakeMinute}
                      bedtimeHour={bedtimeHour} bedtimeMinute={bedtimeMinute}
                      lang={lang}
                      onWakeChange={(h, m) => { setWakeHour(h); setWakeMinute(m); }}
                      onBedtimeChange={(h, m) => { setBedtimeHour(h); setBedtimeMinute(m); }}
                    />
                    <div className="mt-3 flex gap-2">
                      <button onClick={handleSaveTimeTodayOnly} className="flex-1 rounded-full border border-border/55 px-3 py-2 text-[12px] font-semibold text-muted-foreground hover:bg-muted/55 hover:text-foreground">
                        {lang === 'zh' ? '仅今天' : 'Today only'}
                      </button>
                      <button onClick={handleSave} className="flex-1 rounded-full bg-foreground px-3 py-2 text-[12px] font-semibold text-background hover:opacity-90">
                        {lang === 'zh' ? '全部应用' : 'Apply to all'}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <LifeReminderCard lang={lang} flat />

                    <div>
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/55">
                        {lang === 'zh' ? '语言与连接' : 'Language & connections'}
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="flex h-10 items-center rounded-full border border-border/65 bg-secondary/30 p-1">
                          <button onClick={() => setLang('zh')} className={cn('rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors', lang === 'zh' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground')}>中文</button>
                          <button onClick={() => setLang('en')} className={cn('rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors', lang === 'en' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground')}>EN</button>
                        </div>
                        <GoogleCalendarButton />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-border/55 bg-card/72 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/45">
                  {lang === 'zh' ? '你的数据' : 'Your data'}
                </p>
                <p className="mt-1 text-[12px] text-muted-foreground/58">
                  {lang === 'zh'
                    ? '私密优先。随时把全部记忆导出为一份 JSON——即使有一天我们不在了，它仍然属于你。'
                    : 'Private by default. Export everything as one JSON file anytime — even if we disappear, your evidence stays yours.'}
                </p>
                <button
                  onClick={handleExportEvidence}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-border/65 bg-background px-3 py-2 text-[12px] font-semibold text-muted-foreground hover:text-foreground"
                >
                  <Download size={13} /> {lang === 'zh' ? '导出我的证据' : 'Export my evidence'}
                </button>
              </div>
            </div>
          </section>
        )}

        {recentPhotos.length > 0 && (
          <section className="rounded-3xl border border-border/60 bg-background p-4 shadow-[0_16px_60px_-50px_rgba(88,70,54,0.28)]">
            <div className="mb-3 flex items-end justify-between gap-3 px-1">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground/45">
                  {lang === 'zh' ? '最近的照片' : 'Recent photos'}
                </p>
                <h2 className="mt-0.5 text-[17px] font-semibold tracking-[-0.03em] text-foreground">
                  {lang === 'zh' ? `共 ${recentPhotos.length} 张` : `${recentPhotos.length} captured`}
                </h2>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => scrollStrip(-1)}
                  aria-label={lang === 'zh' ? '上一张' : 'Scroll left'}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-border/55 text-muted-foreground transition-colors hover:bg-secondary/50 hover:text-foreground"
                >
                  <ChevronLeft size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => scrollStrip(1)}
                  aria-label={lang === 'zh' ? '下一张' : 'Scroll right'}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-border/55 text-muted-foreground transition-colors hover:bg-secondary/50 hover:text-foreground"
                >
                  <ChevronRight size={15} />
                </button>
                {recentPhotos.length > 12 && (
                  <button
                    type="button"
                    onClick={() => setAlbumOpen(true)}
                    className="ml-1 inline-flex items-center gap-1.5 rounded-full border border-border/55 px-3 py-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-secondary/50 hover:text-foreground"
                  >
                    <Images size={13} />
                    {lang === 'zh' ? '看全部' : 'View all'}
                  </button>
                )}
              </div>
            </div>
            <div ref={photoStripRef} className="-mx-1 overflow-x-auto scroll-smooth px-1 pb-1 no-scrollbar">
              <div className="flex gap-2">
                {recentPhotos.slice(0, 40).map(photo => (
                  <button
                    key={photo.url}
                    type="button"
                    onClick={() => setLightboxPhoto(photo.url)}
                    title={`${shortDate(photo.date)}${photo.momentText ? ' · ' + photo.momentText : ''}`}
                    className="group relative h-24 w-24 flex-shrink-0 overflow-hidden rounded-[16px] border border-border/45 bg-secondary/30 transition-transform hover:scale-[1.03] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  >
                    <StorageImage src={photo.url} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                    <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/45 via-black/0 to-transparent px-2 pb-1 pt-4 text-left text-[10px] font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100">
                      {shortDate(photo.date)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </section>
        )}

        <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-3xl border border-border/60 bg-background p-5 shadow-[0_16px_60px_-50px_rgba(88,70,54,0.28)]">
            <button onClick={() => setShowLifeCalendar(true)} className="group w-full text-left">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground/45">Evidence Calendar</p>
                  <h2 className="mt-1 text-[20px] font-semibold tracking-[-0.04em] text-foreground">
                    {lang === 'zh' ? '最近半年留下的痕迹' : 'The last half-year of proof'}
                  </h2>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full border border-border/65 bg-card px-3 py-1.5 text-[12px] font-semibold text-muted-foreground transition-colors group-hover:text-foreground">
                  {lang === 'zh' ? '全年' : 'Year'} <ChevronRight size={13} />
                </span>
              </div>
              <LifeHeatmap allMoments={moments} />
            </button>
          </section>

          <section className="rounded-3xl border border-border/60 bg-background p-5 shadow-[0_16px_60px_-50px_rgba(88,70,54,0.28)]">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground/45">Upcoming Attention</p>
                <h2 className="mt-1 text-[20px] font-semibold tracking-[-0.04em] text-foreground">
                  {lang === 'zh' ? '接下来最该看见的事' : 'What should stay visible'}
                </h2>
              </div>
            </div>
            {upcomingDues.length > 0 ? (
              <div className="space-y-2">
                {upcomingDues.map(due => (
                  <div key={due.id} className="rounded-[18px] border border-border/55 bg-card/72 px-3.5 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 flex-1 truncate text-[15px] font-semibold text-foreground">{due.title}</p>
                      <span className="flex-shrink-0 rounded-full bg-[rgba(232,130,90,0.08)] px-2 py-1 text-[11px] font-semibold text-[#c86e4a]">
                        {due.due_date ? shortDate(due.due_date) : ''}
                      </span>
                    </div>
                    {due.steps?.length > 0 && (
                      <p className="mt-1 text-[12px] font-medium text-muted-foreground/52">{due.steps.filter(s => s.is_completed).length}/{due.steps.length} steps</p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                variant="inline"
                title={lang === 'zh' ? '暂时没有临近 deadline。' : 'No urgent commitments right now.'}
              />
            )}
          </section>
        </div>

        <section className="rounded-3xl border border-border/60 bg-background p-5 shadow-[0_16px_60px_-50px_rgba(88,70,54,0.28)]">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground/45">Recent Proof</p>
              <h2 className="mt-1 text-[20px] font-semibold tracking-[-0.04em] text-foreground">
                {lang === 'zh' ? '最近真的发生过的东西' : 'Things that actually happened'}
              </h2>
            </div>
            <button onClick={() => setReflectionOpen(v => !v)} className="inline-flex items-center gap-1.5 rounded-full border border-border/65 bg-card px-3 py-1.5 text-[12px] font-semibold text-muted-foreground hover:text-foreground">
              <BookOpen size={13} /> {lang === 'zh' ? '反思' : 'Reflect'}
            </button>
          </div>

          {recentEvidence.length > 0 ? (
            <>
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {visibleEvidence.map(memory => (
                  <div key={memory.id} className="rounded-2xl border border-border/55 bg-card/72 p-3.5">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="font-mono text-[11px] text-muted-foreground/48">{shortDate(memory.createdAt || memory.date)}</span>
                      {memory.emoji && <span className="text-[18px]">{memory.emoji}</span>}
                    </div>
                    <p className="line-clamp-3 text-[13px] font-medium leading-5 text-foreground/82">
                      {memory.text?.split('---DETAIL---')[0] || (lang === 'zh' ? '一条生活证据' : 'A piece of evidence')}
                    </p>
                    {(() => {
                      const displayTags = getMomentDisplayTags(memory.tags);
                      return displayTags.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {displayTags.slice(0, 2).map((tag, i) => (
                            <span key={i} className="rounded-full bg-secondary/65 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground/64">
                              {TAG_CATEGORY_ICONS[tag] || '•'} {tag}
                            </span>
                          ))}
                        </div>
                      ) : null;
                    })()}
                    {memory.photos.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setLightboxPhoto(memory.photos[0])}
                        className="mt-2 block w-full overflow-hidden rounded-[14px] border border-border/40 bg-secondary/30"
                      >
                        <StorageImage src={memory.photos[0]} alt="" loading="lazy" className="max-h-48 w-full object-contain" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {recentEvidence.length > 3 && (
                <div className="mt-3 flex justify-center">
                  <button
                    onClick={() => setShowAllEvidence(v => !v)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border/65 bg-card px-3 py-1.5 text-[12px] font-semibold text-muted-foreground hover:text-foreground"
                  >
                    {showAllEvidence
                      ? (lang === 'zh' ? '收起' : 'Show less')
                      : (lang === 'zh' ? `查看全部 (${recentEvidence.length})` : `See more (${recentEvidence.length})`)}
                  </button>
                </div>
              )}
            </>
          ) : (
            <EmptyState
              variant="inline"
              title={lang === 'zh' ? '记录 moment 后，这里会变成你的证据流。' : 'Log moments and this becomes your evidence stream.'}
              className="py-8"
            />
          )}
        </section>

        {reflectionOpen && (
          <section className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-3xl border border-border/60 bg-background p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground/45">Life Replay</p>
                  <h2 className="mt-1 text-[18px] font-semibold tracking-[-0.04em] text-foreground">{lang === 'zh' ? '把今天讲成一段话' : 'Turn today into a short replay'}</h2>
                </div>
                <button onClick={generateLifeReplay} disabled={replayLoading} className="inline-flex items-center gap-1.5 rounded-full border border-border/65 bg-card px-3 py-1.5 text-[12px] font-semibold text-muted-foreground hover:text-foreground">
                  <RefreshCw size={13} className={replayLoading ? 'animate-spin' : ''} />
                  {lang === 'zh' ? '生成' : 'Generate'}
                </button>
              </div>
              <p className="rounded-[18px] bg-card/62 px-4 py-4 text-[14px] leading-7 text-foreground/76">
                {replayLoading ? (lang === 'zh' ? '正在回放...' : 'Replaying...') : lifeReplay || (lang === 'zh' ? '默认收起' : 'Hidden by default')}
              </p>
            </div>

            {randomMemory && (
              <div className="rounded-3xl border border-border/60 bg-background p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground/45">Memory</p>
                <h2 className="mt-1 text-[18px] font-semibold tracking-[-0.04em] text-foreground">{t('profile.memory')}</h2>
                <div className="mt-4 rounded-[18px] bg-card/62 px-4 py-4">
                  <p className="font-mono text-[11px] text-muted-foreground/48">{randomMemory.date}</p>
                  <p className="mt-2 text-[14px] font-medium leading-6 text-foreground/82">
                    {randomMemory.emoji && <span className="mr-1.5">{randomMemory.emoji}</span>}
                    {randomMemory.text?.split('---DETAIL---')[0] || ''}
                  </p>
                </div>
              </div>
            )}
          </section>
        )}
      </div>

      {lightboxPhoto && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-background/95 backdrop-blur-sm animate-fade-in" onClick={() => setLightboxPhoto(null)}>
          <button onClick={() => setLightboxPhoto(null)} className="absolute top-4 right-4 z-10 p-2 text-muted-foreground hover:text-foreground">
            <X size={24} />
          </button>
          <StorageImage src={lightboxPhoto} alt="" className="max-h-[85vh] max-w-[90vw] rounded-lg object-contain" onClick={e => e.stopPropagation()} />
        </div>
      )}

      {albumOpen && (
        <div className="fixed inset-0 z-[55] flex flex-col bg-background/97 backdrop-blur-sm animate-fade-in">
          <div className="flex items-center justify-between border-b border-border/45 px-5 py-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground/55">
                {lang === 'zh' ? '相册' : 'Album'}
              </p>
              <h2 className="mt-0.5 text-[17px] font-semibold tracking-[-0.03em] text-foreground">
                {lang === 'zh' ? `共 ${recentPhotos.length} 张` : `${recentPhotos.length} captured`}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setAlbumOpen(false)}
              aria-label={lang === 'zh' ? '关闭' : 'Close'}
              className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
            >
              <X size={18} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4">
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
              {recentPhotos.map(photo => (
                <button
                  key={photo.url}
                  type="button"
                  onClick={() => setLightboxPhoto(photo.url)}
                  title={`${shortDate(photo.date)}${photo.momentText ? ' · ' + photo.momentText : ''}`}
                  className="group relative aspect-square overflow-hidden rounded-[10px] border border-border/45 bg-secondary/30 transition-transform hover:scale-[1.02] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                >
                  <StorageImage src={photo.url} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                  <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 via-black/0 to-transparent px-2 pb-1 pt-4 text-left text-[10px] font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100">
                    {shortDate(photo.date)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryMetric({ value, label, icon: Icon, primary = false }: { value: string; label: string; icon: typeof Clock3; primary?: boolean }) {
  return (
    <div className={cn(
      'rounded-2xl border px-3.5 py-3.5',
      primary
        ? 'border-[rgba(200,112,76,0.2)] bg-[rgba(232,130,90,0.08)]'
        : 'border-border/55 bg-card/70',
    )}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <Icon size={15} className={primary ? 'text-[#c86e4a]' : 'text-muted-foreground/52'} />
      </div>
      <p className="truncate text-[24px] font-semibold leading-none tracking-[-0.045em] text-foreground">{value}</p>
      <p className="mt-1.5 truncate text-[11px] font-semibold text-muted-foreground/52">{label}</p>
    </div>
  );
}

function LifeReminderCard({ lang, flat = false }: { lang: string; flat?: boolean }) {
  const { config, setConfig, requestPermission } = useLifeReminder();
  const intervals = [1, 2, 3, 4];
  const [ntfyDraft, setNtfyDraft] = useState(config.ntfyTopic);

  useEffect(() => {
    setNtfyDraft(config.ntfyTopic);
  }, [config.ntfyTopic]);

  const handleToggle = async () => {
    if (!config.enabled) {
      const wantsNtfy = config.ntfyEnabled && !!config.ntfyTopic.trim();
      if (!wantsNtfy) {
        const granted = await requestPermission();
        if (!granted) {
          toast(lang === 'zh' ? '请允许通知权限，或先配置 ntfy topic' : 'Allow notifications, or configure an ntfy topic first');
          return;
        }
      }
      setConfig({ enabled: true });
      toast.success(lang === 'zh' ? '生活提醒已开启' : 'Life reminders enabled');
    } else {
      setConfig({ enabled: false });
      toast(lang === 'zh' ? '生活提醒已关闭' : 'Life reminders disabled');
    }
  };

  const saveNtfyTopic = () => {
    setConfig({ ntfyTopic: ntfyDraft.trim(), ntfyEnabled: ntfyDraft.trim().length > 0 ? config.ntfyEnabled : false });
    toast.success(lang === 'zh' ? '已保存 ntfy topic' : 'ntfy topic saved');
  };

  return (
    <div className={flat ? '' : 'rounded-3xl border border-border/55 bg-card/72 p-4'}>
      {flat && (
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/55">
          {lang === 'zh' ? '生活提醒' : 'Reminder'}
        </p>
      )}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {config.enabled ? <Bell size={17} className="text-primary" /> : <BellOff size={17} className="text-muted-foreground/58" />}
          <div>
            <p className="text-[13px] font-semibold text-foreground">{lang === 'zh' ? '生活捕捉提醒' : 'Life Capture Reminder'}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground/52">{lang === 'zh' ? '轻轻提醒你记录瞬间' : 'A gentle nudge to log moments'}</p>
          </div>
        </div>
        <button onClick={handleToggle} aria-pressed={config.enabled} aria-label={config.enabled ? 'Disable reminder' : 'Enable reminder'} className={cn('relative h-6 w-11 rounded-full transition-colors', config.enabled ? 'bg-primary' : 'bg-muted')}>
          <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform', config.enabled ? 'translate-x-[22px]' : 'translate-x-0.5')} />
        </button>
      </div>

      {config.enabled && (
        <div className={cn('mt-3 space-y-3', flat ? '' : 'border-t border-border/55 pt-3')}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12px] font-medium text-muted-foreground/55">{lang === 'zh' ? '每' : 'Every'}</span>
            {intervals.map(h => (
              <button
                key={h}
                onClick={() => setConfig({ intervalHours: h })}
                className={cn('rounded-full px-3 py-1 text-[12px] font-semibold transition-colors', config.intervalHours === h ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground')}
              >
                {h}h
              </button>
            ))}
            <span className="text-[12px] font-medium text-muted-foreground/55">{lang === 'zh' ? '提醒一次' : 'reminder'}</span>
          </div>

          <div className="rounded-2xl border border-border/50 bg-background/40 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[12px] font-semibold text-foreground">ntfy</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground/55">
                  {lang === 'zh' ? '推送到手机（可选，可与浏览器通知并用）' : 'Optional phone push (works with or without browser notifications)'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setConfig({ ntfyEnabled: !config.ntfyEnabled })}
                aria-pressed={config.ntfyEnabled}
                className={cn('relative h-6 w-11 shrink-0 rounded-full transition-colors', config.ntfyEnabled ? 'bg-primary' : 'bg-muted')}
              >
                <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform', config.ntfyEnabled ? 'translate-x-[22px]' : 'translate-x-0.5')} />
              </button>
            </div>
            {config.ntfyEnabled && (
              <div className="mt-2.5 flex gap-2">
                <input
                  value={ntfyDraft}
                  onChange={(e) => setNtfyDraft(e.target.value)}
                  placeholder={lang === 'zh' ? 'topic 或 https://ntfy.sh/topic' : 'topic or https://ntfy.sh/topic'}
                  className="min-w-0 flex-1 rounded-xl border border-border/55 bg-background px-3 py-2 text-[12px] text-foreground placeholder:text-muted-foreground/45 focus:outline-none focus:ring-1 focus:ring-primary/40"
                />
                <button
                  type="button"
                  onClick={saveNtfyTopic}
                  className="shrink-0 rounded-xl bg-secondary px-3 py-2 text-[12px] font-semibold text-foreground hover:bg-secondary/80"
                >
                  {lang === 'zh' ? '保存' : 'Save'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
