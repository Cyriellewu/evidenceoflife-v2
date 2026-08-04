import { useEffect, useRef, useState } from 'react';
import { Calendar, ChevronRight, Clock3, Link2, LogOut, MapPin, Pin, Repeat, StickyNote, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { TabType } from '@/types';
import { cn } from '@/lib/utils';
import { BrandLogo } from '@/components/BrandLogo';
import { useLanguage } from '@/hooks/useLanguage';
import { useProfile } from '@/hooks/useProfile';
import { useDues } from '@/hooks/useDues';
import { useAuth } from '@/hooks/useAuth';
import { format } from 'date-fns';

type SheetKey = 'notes' | 'dues' | 'habits' | 'links';

interface SideNavProps {
  activeTab: TabType;
  activeSheet?: SheetKey | null;
  onTabChange: (tab: TabType) => void;
}

// Maps a sheet-opener tab id to the Index activeSheet key.
const SHEET_KEY_BY_TAB: Partial<Record<TabType, SheetKey>> = {
  dues: 'dues',
  habits: 'habits',
  notes: 'notes',
  linkup: 'links',
};

// Primary navigation tabs (full-page views)
const tabConfig: { id: TabType; icon: typeof Clock3; labelKey: string }[] = [
  { id: 'today', icon: Clock3, labelKey: 'nav.today' },
  { id: 'calendar', icon: Calendar, labelKey: 'nav.calendar' },
  { id: 'map', icon: MapPin, labelKey: 'nav.places' },
];

// Sheet-opener quick-access buttons, grouped by the role each plays in the
// Plan → Live → Capture → Revisit loop. "Evidence" holds the material that
// proves a day actually happened; "Obligations" holds what keeps life moving.
type SheetItem = { id: TabType; icon: typeof Clock3; shortLabel: string; hint: string };
const sheetGroups: { labelKey: string; items: SheetItem[] }[] = [
  {
    labelKey: 'sidenav.evidence',
    items: [
      { id: 'notes', icon: StickyNote, shortLabel: 'Notes', hint: 'Lists, images, reminders' },
      { id: 'linkup', icon: Link2, shortLabel: 'Links', hint: 'Collections & references' },
    ],
  },
  {
    labelKey: 'sidenav.obligations',
    items: [
      { id: 'dues', icon: Pin, shortLabel: 'Deadlines', hint: 'Due dates & urgent work' },
      { id: 'habits', icon: Repeat, shortLabel: 'Habits', hint: 'Repeatable routines' },
    ],
  },
];
const TAB_ORDER_KEY = 'side-nav-tab-order';

// Shared sidebar state styles. Kept together so the three call sites
// (primary tabs, sheet openers, profile) can't drift apart again.
//
// ROUTE_ACTIVE: the currently selected full-page route (Today / Calendar / Map /
// Profile). Strongest signal — only one at a time. Paired with a left rail.
// SHEET_OPEN: a sheet-opener whose sheet is currently open. Intentionally quieter
// than ROUTE_ACTIVE so the sidebar never shows two things as "selected" at once
// when e.g. Today is the route and Links is the open sheet.
// HOVER: shared hover for every interactive row.
const ROUTE_ACTIVE_CLS = 'bg-primary/12 text-primary';
const SHEET_OPEN_CLS = 'bg-[hsl(var(--surface-soft))] text-foreground';
const HOVER_CLS = 'hover:bg-[hsl(var(--surface-soft-hover))] hover:text-foreground';

export function SideNav({ activeTab, activeSheet, onTabChange }: SideNavProps) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { profile } = useProfile();
  const { dues } = useDues();
  const { signOut } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [logoVisible, setLogoVisible] = useState(true);
  const [showProfileHoverCard, setShowProfileHoverCard] = useState(false);
  const [draggedTab, setDraggedTab] = useState<TabType | null>(null);
  const [tabOrder, setTabOrder] = useState<TabType[]>(() => {
    try {
      const raw = localStorage.getItem(TAB_ORDER_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      const validIds = tabConfig.map((tab) => tab.id);
      if (Array.isArray(parsed) && validIds.every((id) => parsed.includes(id))) {
        return parsed as TabType[];
      }
    } catch {
      return tabConfig.map((tab) => tab.id);
    }
    return tabConfig.map((tab) => tab.id);
  });
  const hoverTimeoutMs = 200;
  const profileHoverTimeoutRef = useRef<number | null>(null);
  const sideNavRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!expanded) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (sideNavRef.current && !sideNavRef.current.contains(e.target as Node)) {
        setExpanded(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [expanded]);
  const displayName = profile?.display_name?.trim() || 'Demo User';
  const validTimedDues = dues.filter((due) => {
    if (due.is_completed || !due.due_date) return false;
    const parsed = new Date(due.due_date).getTime();
    return Number.isFinite(parsed);
  });
  const nextDue = validTimedDues
    .sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime())[0];

  useEffect(() => {
    return () => {
      if (profileHoverTimeoutRef.current !== null) {
        window.clearTimeout(profileHoverTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(TAB_ORDER_KEY, JSON.stringify(tabOrder));
  }, [tabOrder]);

  const clearProfileHoverTimeout = () => {
    if (profileHoverTimeoutRef.current !== null) {
      window.clearTimeout(profileHoverTimeoutRef.current);
      profileHoverTimeoutRef.current = null;
    }
  };

  const openProfileHoverCardWithDelay = () => {
    clearProfileHoverTimeout();
    profileHoverTimeoutRef.current = window.setTimeout(() => {
      setShowProfileHoverCard(true);
      profileHoverTimeoutRef.current = null;
    }, hoverTimeoutMs);
  };

  const closeProfileHoverCardWithDelay = () => {
    clearProfileHoverTimeout();
    profileHoverTimeoutRef.current = window.setTimeout(() => {
      setShowProfileHoverCard(false);
      profileHoverTimeoutRef.current = null;
    }, hoverTimeoutMs);
  };

  const nextDueDateLabel = nextDue?.due_date
    ? (() => {
        const parsed = new Date(nextDue.due_date);
        if (!Number.isFinite(parsed.getTime())) return null;
        return `${format(parsed, 'MMM d')} · ${format(parsed, 'h:mma').toLowerCase()}`;
      })()
    : null;
  const nextDueRemainingLabel = nextDue?.due_date
    ? (() => {
        const parsed = new Date(nextDue.due_date);
        if (!Number.isFinite(parsed.getTime())) return null;
        const diffMs = parsed.getTime() - Date.now();
        if (diffMs <= 0) return 'due now';
        const diffMin = Math.ceil(diffMs / 60000);
        const days = Math.floor(diffMin / 1440);
        const hours = Math.floor((diffMin % 1440) / 60);
        if (days >= 1) return `${days}${days === 1 ? ' day' : ' days'} left`;
        if (hours >= 1) return `${hours}h left`;
        return `${diffMin}m left`;
      })()
    : null;
  const orderedTabs = tabOrder
    .map((id) => tabConfig.find((tab) => tab.id === id))
    .filter((tab): tab is (typeof tabConfig)[number] => Boolean(tab));

  return (
    <aside
      ref={sideNavRef}
      className={cn(
        'flex-shrink-0 border-r border-border bg-[hsl(var(--surface-contrast))] transition-[width] duration-200 ease-out',
        expanded ? 'w-[236px]' : 'w-[52px]'
      )}
    >
      <div className="sticky top-0 flex h-screen flex-col py-2.5">
        <div className={cn(expanded ? 'px-1.5' : 'px-2')}>
          <button
            onClick={() => setExpanded((prev) => !prev)}
            className={cn(
              'flex h-10 w-full items-center rounded-[12px] transition-colors',
              expanded ? `justify-between gap-2 px-2 ${HOVER_CLS}` : 'justify-center'
            )}
            title={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            <span className={cn(
              'flex items-center justify-center rounded-[10px]',
              expanded ? 'h-10 w-10' : 'h-11 w-11'
            )}>
              {logoVisible ? (
                <span onError={() => setLogoVisible(false) as never}>
                  <BrandLogo
                    alt="Evidence of life"
                    className={cn(expanded ? 'h-9 w-9' : 'h-10 w-10')}
                  />
                </span>
              ) : (
                <span className="text-[12px] leading-none text-[hsl(var(--text-soft))]">◌</span>
              )}
            </span>
            {expanded && (
              <span className="flex min-w-0 flex-1 items-center justify-between gap-1.5">
                <span
                  className="font-brand min-w-0 flex-1 text-[19px] text-foreground leading-none truncate"
                >
                  Evidence of life
                </span>
                <ChevronRight size={14} className="text-muted-foreground" />
              </span>
            )}
          </button>
        </div>

        <nav className={cn('mt-3 flex flex-col gap-1', expanded ? 'px-1.5' : 'px-2')}>
          {/* Daily loop: full-page core surfaces (plan → live → capture → revisit) */}
          {expanded && (
            <span className="mb-0.5 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/45">
              {t('sidenav.dailyLoop')}
            </span>
          )}
          {/* Primary nav tabs */}
          {orderedTabs.map(({ id, icon: Icon, labelKey }) => (
            <button
              key={id}
              draggable={expanded}
              onClick={() => onTabChange(id)}
              onDragStart={() => setDraggedTab(id)}
              onDragOver={(e) => {
                if (!expanded) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (!draggedTab || draggedTab === id) return;
                setTabOrder((prev) => {
                  const sourceIndex = prev.indexOf(draggedTab);
                  const targetIndex = prev.indexOf(id);
                  if (sourceIndex < 0 || targetIndex < 0) return prev;
                  const next = [...prev];
                  const [moved] = next.splice(sourceIndex, 1);
                  next.splice(targetIndex, 0, moved);
                  return next;
                });
                setDraggedTab(null);
              }}
              onDragEnd={() => setDraggedTab(null)}
              title={t(labelKey)}
              className={cn(
                'relative flex h-10 items-center rounded-[10px] transition-colors',
                expanded ? 'w-full justify-start gap-2.5 px-3' : 'w-10 justify-center self-center',
                expanded && 'cursor-grab active:cursor-grabbing',
                draggedTab === id && 'opacity-60',
                activeTab === id
                  ? ROUTE_ACTIVE_CLS
                  : `text-muted-foreground ${HOVER_CLS}`
              )}
            >
              {activeTab === id && (
                <span
                  aria-hidden
                  className={cn(
                    'absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-primary',
                    !expanded && '-translate-x-1.5'
                  )}
                />
              )}
              <Icon size={20} strokeWidth={activeTab === id ? 2.2 : 1.85} />
              {expanded && (
                <span className="text-[16px] font-medium text-inherit">
                  {t(labelKey)}
                </span>
              )}
            </button>
          ))}

          {/* Utility library: sheet openers grouped by role (Evidence / Obligations) */}
          {expanded ? (
            <div className="mt-4 space-y-3 border-t border-border/45 pt-3">
              {sheetGroups.map((group) => (
                <div key={group.labelKey}>
                  <span className="mb-1 block px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/45">
                    {t(group.labelKey)}
                  </span>
                  <div className="space-y-0.5">
                    {group.items.map(({ id, icon: Icon, shortLabel, hint }) => {
                      const isOpen = activeSheet != null && SHEET_KEY_BY_TAB[id] === activeSheet;
                      return (
                      <button
                        key={id}
                        onClick={() => onTabChange(id)}
                        title={`${shortLabel} · ${hint}`}
                        aria-label={`${shortLabel}: ${hint}`}
                        aria-current={isOpen ? 'true' : undefined}
                        className={cn(
                          "group/lib flex h-9 w-full items-center gap-2.5 rounded-[10px] px-3 text-left transition-colors",
                          isOpen
                            ? SHEET_OPEN_CLS
                            : `text-[hsl(var(--text-soft))] ${HOVER_CLS}`
                        )}
                      >
                        <Icon size={17} strokeWidth={isOpen ? 2 : 1.6} className="flex-shrink-0" />
                        <span className="truncate text-[14px] font-medium leading-tight text-inherit">
                          {shortLabel}
                        </span>
                      </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-3 flex flex-col gap-0.5 border-t border-border/45 pt-3">
              {sheetGroups.flatMap((group) =>
                group.items.map(({ id, icon: Icon, shortLabel, hint }) => {
                  const isOpen = activeSheet != null && SHEET_KEY_BY_TAB[id] === activeSheet;
                  return (
                    <button
                      key={id}
                      onClick={() => onTabChange(id)}
                      title={`${shortLabel} · ${hint}`}
                      aria-label={`${shortLabel}: ${hint}`}
                      aria-current={isOpen ? 'true' : undefined}
                      className={cn(
                        "relative flex h-10 w-10 items-center justify-center self-center rounded-[10px] transition-colors",
                        isOpen
                          ? SHEET_OPEN_CLS
                          : `text-muted-foreground ${HOVER_CLS}`
                      )}
                    >
                      <Icon size={19} strokeWidth={isOpen ? 2 : 1.85} />
                    </button>
                  );
                })
              )}
            </div>
          )}
        </nav>

        {expanded && nextDue && (
          <div className="mt-4 px-1.5">
            <button
              onClick={() => {
                window.dispatchEvent(new CustomEvent('navigate-to-dues', { detail: { dueId: nextDue.id } }));
              }}
              className="w-full rounded-[14px] border border-border bg-card px-4 py-3.5 text-left transition-colors hover:bg-[hsl(var(--surface-soft-hover))]"
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/50 font-medium">
                  {t('plan.comingUp')}
                </span>
                <ChevronRight size={12} className="text-muted-foreground/40" />
              </div>
              <p className="text-[12px] font-semibold leading-snug text-foreground truncate">
                {nextDue.title}
              </p>
              <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                {nextDueDateLabel && (
                  <span className="text-[11px] text-muted-foreground/70">{nextDueDateLabel}</span>
                )}
                {nextDueRemainingLabel && (
                  <span className="text-[11px] font-medium text-primary/80">{nextDueRemainingLabel}</span>
                )}
              </div>
              {nextDue.links?.[0] && (
                <p className="mt-1.5 truncate text-[11px] text-primary/70">
                  {nextDue.links[0].label || nextDue.links[0].url?.replace(/^https?:\/\//, '')}
                </p>
              )}
            </button>
          </div>
        )}

        <div
          className={cn('relative mt-auto pt-3.5', expanded ? 'px-1.5' : 'px-2')}
          onMouseEnter={openProfileHoverCardWithDelay}
          onMouseLeave={closeProfileHoverCardWithDelay}
        >
          <button
            onClick={() => onTabChange('profile')}
            title={displayName}
            className={cn(
              'flex h-9 items-center rounded-[10px] transition-colors overflow-hidden',
              expanded ? 'w-full justify-start gap-2 px-3' : 'w-9 justify-center self-center',
              activeTab === 'profile'
                ? ROUTE_ACTIVE_CLS
                : HOVER_CLS
            )}
          >
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="" className={cn(expanded ? 'h-8 w-8' : 'h-9 w-9', 'rounded-full object-cover')} />
            ) : (
              <User size={18} className="text-[hsl(var(--text-soft))]" />
            )}
            {expanded && (
              <span className="text-[16px] font-medium text-foreground">
                {displayName}
              </span>
            )}
          </button>
          {showProfileHoverCard && (
            <div
              onMouseEnter={() => {
                clearProfileHoverTimeout();
                setShowProfileHoverCard(true);
              }}
              onMouseLeave={closeProfileHoverCardWithDelay}
              className={cn(
                'absolute bottom-full z-30 mb-2 rounded-[14px] border border-border bg-background/95 p-2 shadow-[0_12px_28px_hsl(var(--foreground)/0.12)] backdrop-blur-sm',
                expanded ? 'left-1.5 w-[170px]' : 'left-10 w-[150px]'
              )}
            >
              <button
                onClick={async (e) => {
                  e.stopPropagation();
                  setShowProfileHoverCard(false);
                  await signOut();
                  navigate('/', { replace: true });
                }}
                className="flex w-full items-center gap-2 rounded-[10px] px-2 py-2 text-left text-[13px] font-medium text-foreground transition-colors hover:bg-[hsl(var(--surface-soft-hover))]"
              >
                <LogOut size={14} className="text-[hsl(var(--text-soft))]" />
                <span>Log out</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
