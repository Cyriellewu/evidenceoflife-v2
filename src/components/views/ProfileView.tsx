import { ReactNode, useMemo, useState } from 'react';
import { LifeHeatmap } from '@/components/today/LifeHeatmap';
import { LifeCalendar } from '@/components/views/LifeCalendar';
import monetPainting from '@/assets/monet-impression-sunrise.jpg';
import { getDailyArtwork } from '@/lib/dailyArtwork';
import { EmptyState } from '@/components/ui/empty-state';
import { ChevronRight, RefreshCw, Settings, X } from 'lucide-react';
import { useProfile } from '@/hooks/useProfile';
import { useDues } from '@/hooks/useDues';
import { useLanguage } from '@/hooks/useLanguage';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { TAG_CATEGORY_ICONS } from '@/lib/autoTag';
import { getMomentDisplayTags } from '@/lib/momentTags';
import { buildLocalLifeReplay, pickReplayLang } from '@/components/views/today/todayHelpers';
import { format } from 'date-fns';
import { DayRecord, Moment } from '@/types';
import { Todo } from '@/hooks/useTodos';
import { ImportedEvent } from '@/hooks/useImportedEvents';
import { StorageImage } from "@/components/StorageImage";
import { SettingsPanel } from '@/components/profile/SettingsPanel';

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
  const { profile } = useProfile();
  const { dues } = useDues();
  const { lang, t } = useLanguage();
  const zh = lang === 'zh';
  const dailyArtwork = useMemo(() => getDailyArtwork(new Date()), []);

  const [page, setPage] = useState<'profile' | 'settings' | 'calendar'>('profile');
  const [showAllEvidence, setShowAllEvidence] = useState(false);
  const [lightboxPhoto, setLightboxPhoto] = useState<string | null>(null);
  const [albumOpen, setAlbumOpen] = useState(false);
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
    };
  }, [importedEvents, moments, stats.daysRecorded, todayImportedEvents.length, todayMoments.length, todayTodos, todos]);

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

  const randomMemory = useMemo(() => {
    const pastMoments = moments.filter(m => m.date !== todayStr && (m.text || m.emoji));
    if (pastMoments.length === 0) return null;
    return pastMoments[Math.floor(Math.random() * pastMoments.length)];
  }, [moments, todayStr]);

  const generateLifeReplay = async () => {
    setReplayLoading(true);
    const events = todayMoments.map(m => ({
      time: m.createdAt ? format(new Date(m.createdAt), 'HH:mm') : '',
      title: m.tags?.[0] || m.text || m.emoji || '',
      duration: m.timer_seconds ? `${Math.round(m.timer_seconds / 60)}m` : '',
    })).filter(e => e.title);

    if (events.length < 3) {
      setLifeReplay(zh ? '今天的记录还不够，至少要 3 条。' : 'Need at least 3 activities for a replay.');
      setReplayLoading(false);
      return;
    }

    try {
      const { data } = await supabase.functions.invoke('life-replay', { body: { events, lang: pickReplayLang(events.map(e => e.title), lang) } });
      setLifeReplay(data?.story || buildLocalLifeReplay(events, lang) || (zh ? '今天还没有足够的活动来生成回放。' : 'Not enough activity today for a replay.'));
    } catch {
      const fallback = buildLocalLifeReplay(events, lang);
      if (fallback) setLifeReplay(fallback);
      else toast.error(zh ? '回放生成失败' : 'Replay failed');
    }
    setReplayLoading(false);
  };

  if (page === 'calendar') {
    return (
      <LifeCalendar
        allMoments={moments}
        dayRecords={dayRecords}
        getMomentsForDate={getMomentsForDate}
        onClose={() => setPage('profile')}
      />
    );
  }

  if (page === 'settings') {
    return <SettingsPanel moments={moments} onBack={() => setPage('profile')} />;
  }

  const displayTitle = profile?.display_name || (zh ? '我' : 'Me');
  const coverSrc = profile?.homepage_image_url || dailyArtwork.imageUrl;

  return (
    <div className="flex-1 w-full overflow-y-auto bg-[hsl(var(--surface-soft))] px-4 pb-14 pt-4 sm:px-5 lg:px-7">
      <div className="mx-auto max-w-[760px] space-y-4">
        {/* Who + today, in one card. Editing lives in Settings only. */}
        <section className="overflow-hidden rounded-3xl border border-border/60 bg-background">
          <div className="relative h-28 sm:h-36">
            <StorageImage
              src={coverSrc}
              alt={profile?.homepage_image_url ? '' : `${dailyArtwork.title} by ${dailyArtwork.artist}`}
              referrerPolicy="no-referrer"
              className="absolute inset-0 h-full w-full object-cover"
              onError={(event) => { event.currentTarget.src = monetPainting; }}
            />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent to-background/30" />
            <button
              type="button"
              onClick={() => setPage('settings')}
              aria-label={zh ? '设置' : 'Settings'}
              className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-background/75 text-foreground backdrop-blur-md"
            >
              <Settings size={17} />
            </button>
          </div>
          <div className="px-5 pb-5">
            <div className="relative -mt-8 flex items-end gap-3">
              <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-full border-[3px] border-background bg-secondary">
                {profile?.avatar_url ? (
                  <StorageImage src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-[28px]">🌱</span>
                )}
              </div>
            </div>
            <h1 className="mt-2 truncate text-[24px] font-semibold tracking-[-0.03em] text-foreground">{displayTitle}</h1>

            <div className="mt-4 grid grid-cols-3 divide-x divide-border/55 rounded-2xl bg-card/70 py-3">
              <Stat value={formatDuration(todayFocusSeconds, lang)} label={zh ? '今天专注' : 'Focused today'} />
              <Stat value={String(evidenceStats.proofToday)} label={zh ? '今天记录' : 'Logged today'} />
              <Stat value={String(evidenceStats.daysRecorded)} label={zh ? '记录天数' : 'Days logged'} />
            </div>
          </div>
        </section>

        {recentPhotos.length > 0 && (
          <Section
            title={zh ? '照片' : 'Photos'}
            action={
              <button type="button" onClick={() => setAlbumOpen(true)} className="inline-flex items-center gap-0.5 text-[14px] text-primary">
                {zh ? `全部 ${recentPhotos.length}` : `All ${recentPhotos.length}`} <ChevronRight size={15} />
              </button>
            }
          >
            <div className="-mx-4 overflow-x-auto px-4 no-scrollbar sm:-mx-5 sm:px-5">
              <div className="flex gap-2">
                {recentPhotos.slice(0, 20).map(photo => (
                  <button
                    key={photo.url}
                    type="button"
                    onClick={() => setLightboxPhoto(photo.url)}
                    title={`${shortDate(photo.date)}${photo.momentText ? ' · ' + photo.momentText : ''}`}
                    className="relative h-24 w-24 flex-shrink-0 overflow-hidden rounded-2xl bg-secondary/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  >
                    <StorageImage src={photo.url} alt="" loading="lazy" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
          </Section>
        )}

        <Section
          title={zh ? '活跃日历' : 'Activity'}
          action={
            <button type="button" onClick={() => setPage('calendar')} className="inline-flex items-center gap-0.5 text-[14px] text-primary">
              {zh ? '全年' : 'Year'} <ChevronRight size={15} />
            </button>
          }
        >
          <LifeHeatmap allMoments={moments} showHeader={false} />
        </Section>

        {upcomingDues.length > 0 && (
          <Section title={zh ? '快到期' : 'Coming up'}>
            <div className="divide-y divide-border/50">
              {upcomingDues.map(due => (
                <div key={due.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] text-foreground">{due.title}</p>
                    {due.steps?.length > 0 && (
                      <p className="text-[12px] text-muted-foreground">
                        {due.steps.filter(s => s.is_completed).length}/{due.steps.length} {zh ? '步' : 'steps'}
                      </p>
                    )}
                  </div>
                  <span className="flex-shrink-0 text-[13px] tabular-nums text-muted-foreground">
                    {due.due_date ? shortDate(due.due_date) : ''}
                  </span>
                </div>
              ))}
            </div>
          </Section>
        )}

        <Section title={zh ? '最近记录' : 'Recent'}>
          {recentEvidence.length > 0 ? (
            <>
              <div className="divide-y divide-border/50">
                {visibleEvidence.map(memory => {
                  const displayTags = getMomentDisplayTags(memory.tags);
                  return (
                    <div key={memory.id} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                      <div className="min-w-0 flex-1">
                        <p className="text-[12px] tabular-nums text-muted-foreground">
                          {shortDate(memory.createdAt || memory.date)}
                          {displayTags[0] && <span> · {TAG_CATEGORY_ICONS[displayTags[0]] || ''} {displayTags[0]}</span>}
                        </p>
                        <p className="mt-0.5 line-clamp-2 text-[15px] leading-snug text-foreground">
                          {memory.emoji && <span className="mr-1">{memory.emoji}</span>}
                          {memory.text?.split('---DETAIL---')[0] || (zh ? '一条记录' : 'A moment')}
                        </p>
                      </div>
                      {memory.photos.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setLightboxPhoto(memory.photos[0])}
                          className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-xl bg-secondary/40"
                        >
                          <StorageImage src={memory.photos[0]} alt="" loading="lazy" className="h-full w-full object-cover" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              {recentEvidence.length > 3 && (
                <button
                  type="button"
                  onClick={() => setShowAllEvidence(v => !v)}
                  className="mt-3 w-full rounded-full bg-secondary/50 py-2 text-[14px] text-foreground/80"
                >
                  {showAllEvidence ? (zh ? '收起' : 'Show less') : (zh ? `再看 ${Math.min(recentEvidence.length, 24) - 3} 条` : `Show ${Math.min(recentEvidence.length, 24) - 3} more`)}
                </button>
              )}
            </>
          ) : (
            <EmptyState
              variant="inline"
              title={zh ? '记下第一条 moment，这里就会有内容。' : 'Log a moment and it shows up here.'}
              className="py-6"
            />
          )}
        </Section>

        <Section
          title={zh ? '回顾' : 'Look back'}
          action={
            <button type="button" onClick={generateLifeReplay} disabled={replayLoading} className="inline-flex items-center gap-1 text-[14px] text-primary disabled:opacity-50">
              <RefreshCw size={13} className={replayLoading ? 'animate-spin' : ''} />
              {zh ? '讲讲今天' : 'Replay today'}
            </button>
          }
        >
          {lifeReplay || replayLoading ? (
            <p className="text-[15px] leading-7 text-foreground/85">
              {replayLoading ? (zh ? '正在整理…' : 'Putting it together…') : lifeReplay}
            </p>
          ) : randomMemory ? (
            <div>
              <p className="text-[12px] tabular-nums text-muted-foreground">{t('profile.memory')} · {randomMemory.date}</p>
              <p className="mt-1 text-[15px] leading-relaxed text-foreground/85">
                {randomMemory.emoji && <span className="mr-1.5">{randomMemory.emoji}</span>}
                {randomMemory.text?.split('---DETAIL---')[0] || ''}
              </p>
            </div>
          ) : (
            <p className="text-[14px] text-muted-foreground">
              {zh ? '把今天的记录连成一小段话。' : 'Turn today\'s moments into a short paragraph.'}
            </p>
          )}
        </Section>
      </div>

      {lightboxPhoto && (
        <div className="fixed inset-0 z-[260] flex items-center justify-center bg-background/95 backdrop-blur-sm animate-fade-in" onClick={() => setLightboxPhoto(null)}>
          <button onClick={() => setLightboxPhoto(null)} aria-label={zh ? '关闭' : 'Close'} className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] z-10 p-2 text-muted-foreground hover:text-foreground">
            <X size={24} />
          </button>
          <StorageImage src={lightboxPhoto} alt="" className="max-h-[85vh] max-w-[90vw] rounded-lg object-contain" onClick={e => e.stopPropagation()} />
        </div>
      )}

      {albumOpen && (
        <div className="fixed inset-0 z-[250] flex flex-col bg-background pt-[env(safe-area-inset-top)] animate-fade-in">
          <div className="flex items-center justify-between border-b border-border/45 px-4 py-3">
            <h2 className="text-[17px] font-semibold text-foreground">
              {zh ? `照片 · ${recentPhotos.length}` : `Photos · ${recentPhotos.length}`}
            </h2>
            <button
              type="button"
              onClick={() => setAlbumOpen(false)}
              aria-label={zh ? '关闭' : 'Close'}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary/60 text-foreground"
            >
              <X size={18} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-1">
            <div className="grid grid-cols-3 gap-1 sm:grid-cols-4 md:grid-cols-6">
              {recentPhotos.map(photo => (
                <button
                  key={photo.url}
                  type="button"
                  onClick={() => setLightboxPhoto(photo.url)}
                  title={`${shortDate(photo.date)}${photo.momentText ? ' · ' + photo.momentText : ''}`}
                  className="aspect-square overflow-hidden bg-secondary/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                >
                  <StorageImage src={photo.url} alt="" loading="lazy" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="min-w-0 rounded-3xl border border-border/60 bg-background p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-foreground">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="min-w-0 px-2 text-center">
      <p className="truncate text-[18px] font-semibold tabular-nums tracking-[-0.02em] text-foreground">{value}</p>
      <p className="mt-0.5 truncate text-[12px] text-muted-foreground">{label}</p>
    </div>
  );
}
