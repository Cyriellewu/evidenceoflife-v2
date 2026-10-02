import { useState } from 'react';
import { Calendar, Clock3, Link2, MapPin, MoreHorizontal, Pin, Repeat, StickyNote, User, X } from 'lucide-react';
import { TabType } from '@/types';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/hooks/useLanguage';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

type SheetKey = 'notes' | 'dues' | 'habits' | 'links';

interface MobileBottomNavProps {
  activeTab: TabType;
  activeSheet?: SheetKey | null;
  onTabChange: (tab: TabType) => void;
}

const primaryTabs: { id: TabType; icon: typeof Clock3; labelKey: string }[] = [
  { id: 'today', icon: Clock3, labelKey: 'nav.today' },
  { id: 'calendar', icon: Calendar, labelKey: 'nav.calendar' },
  { id: 'map', icon: MapPin, labelKey: 'nav.places' },
];

const moreItems: { id: TabType; icon: typeof Clock3; label: string; labelZh: string }[] = [
  { id: 'notes', icon: StickyNote, label: 'Notes', labelZh: '便签' },
  { id: 'linkup', icon: Link2, label: 'Links', labelZh: '链接' },
  { id: 'dues', icon: Pin, label: 'Deadlines', labelZh: '截止' },
  { id: 'habits', icon: Repeat, label: 'Habits', labelZh: '习惯' },
  { id: 'profile', icon: User, label: 'Profile', labelZh: '我的' },
];

const SHEET_TABS: TabType[] = ['notes', 'linkup', 'dues', 'habits'];

/**
 * Phone chrome: primary tabs live in a bottom bar so the permanent SideNav
 * rail can leave the layout entirely (full-width content).
 */
export function MobileBottomNav({ activeTab, activeSheet, onTabChange }: MobileBottomNavProps) {
  const { t, lang } = useLanguage();
  const [moreOpen, setMoreOpen] = useState(false);

  const moreActive =
    activeTab === 'profile' ||
    (activeSheet != null) ||
    SHEET_TABS.includes(activeTab);

  const handlePrimary = (id: TabType) => {
    setMoreOpen(false);
    onTabChange(id);
  };

  const handleMoreItem = (id: TabType) => {
    setMoreOpen(false);
    onTabChange(id);
  };

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-[60] border-t border-border/50 bg-[hsl(var(--background)/0.94)] pb-[max(0.35rem,env(safe-area-inset-bottom))] backdrop-blur-xl md:hidden"
        aria-label={lang === 'zh' ? '主导航' : 'Primary navigation'}
      >
        <div className="mx-auto flex h-14 max-w-lg items-stretch justify-around px-1">
          {primaryTabs.map(({ id, icon: Icon, labelKey }) => {
            const isActive = activeTab === id && !activeSheet && !moreOpen;
            return (
              <button
                key={id}
                type="button"
                onClick={() => handlePrimary(id)}
                className={cn(
                  'flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[10px] font-medium transition-colors',
                  isActive ? 'text-primary' : 'text-muted-foreground',
                )}
              >
                <Icon size={20} strokeWidth={isActive ? 2.25 : 1.85} />
                <span className="truncate">{t(labelKey)}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className={cn(
              'flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[10px] font-medium transition-colors',
              moreActive || moreOpen ? 'text-primary' : 'text-muted-foreground',
            )}
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
          >
            <MoreHorizontal size={20} strokeWidth={moreActive || moreOpen ? 2.25 : 1.85} />
            <span>{lang === 'zh' ? '更多' : 'More'}</span>
          </button>
        </div>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent
          side="bottom"
          expandable={false}
          className="gap-0 rounded-t-[22px] border-border/60 p-0 pb-[max(1rem,env(safe-area-inset-bottom))] sm:max-w-none"
        >
          <SheetHeader className="flex flex-row items-center justify-between border-b border-border/50 px-5 py-3.5 text-left">
            <SheetTitle className="text-[15px] font-semibold">
              {lang === 'zh' ? '更多' : 'More'}
            </SheetTitle>
            <button
              type="button"
              onClick={() => setMoreOpen(false)}
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-[hsl(var(--surface-soft))] hover:text-foreground"
              aria-label={lang === 'zh' ? '关闭' : 'Close'}
            >
              <X size={16} />
            </button>
          </SheetHeader>
          <div className="grid grid-cols-3 gap-2 px-4 py-4">
            {moreItems.map(({ id, icon: Icon, label, labelZh }) => {
              const isActive =
                id === 'profile'
                  ? activeTab === 'profile'
                  : activeSheet === (id === 'linkup' ? 'links' : id === 'notes' ? 'notes' : id === 'dues' ? 'dues' : 'habits')
                    || activeTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => handleMoreItem(id)}
                  className={cn(
                    'flex flex-col items-center gap-2 rounded-2xl border px-2 py-3.5 text-center transition-colors',
                    isActive
                      ? 'border-primary/35 bg-primary/10 text-primary'
                      : 'border-border/45 bg-[hsl(var(--surface-soft))] text-foreground hover:border-border',
                  )}
                >
                  <Icon size={20} strokeWidth={isActive ? 2.1 : 1.8} />
                  <span className="text-[12px] font-medium">{lang === 'zh' ? labelZh : label}</span>
                </button>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
