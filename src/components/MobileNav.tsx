import { useState } from 'react';
import {
  Calendar,
  Clock3,
  Link2,
  MapPin,
  MoreHorizontal,
  Pin,
  Repeat,
  StickyNote,
  User,
} from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useLanguage } from '@/hooks/useLanguage';
import { cn } from '@/lib/utils';
import { TabType } from '@/types';

type SheetKey = 'notes' | 'dues' | 'habits' | 'links';

interface MobileNavProps {
  activeTab: TabType;
  activeSheet?: SheetKey | null;
  onTabChange: (tab: TabType) => void;
}

const primaryItems = [
  { id: 'today' as const, icon: Clock3, labelKey: 'nav.today' },
  { id: 'calendar' as const, icon: Calendar, labelKey: 'nav.calendar' },
  { id: 'map' as const, icon: MapPin, labelKey: 'nav.places' },
];

export function MobileNav({ activeTab, activeSheet, onTabChange }: MobileNavProps) {
  const { t, lang } = useLanguage();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreIsActive = Boolean(activeSheet) || activeTab === 'profile';
  const secondaryItems = [
    { id: 'notes' as const, icon: StickyNote, label: t('nav.notes') },
    { id: 'linkup' as const, icon: Link2, label: t('nav.links') },
    { id: 'dues' as const, icon: Pin, label: t('nav.dues') },
    { id: 'habits' as const, icon: Repeat, label: lang === 'zh' ? '习惯' : 'Habits' },
    { id: 'profile' as const, icon: User, label: t('nav.profile') },
  ];

  const select = (tab: TabType) => {
    setMoreOpen(false);
    onTabChange(tab);
  };

  return (
    <>
      <nav
        aria-label={lang === 'zh' ? '主要导航' : 'Primary navigation'}
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-background/94 backdrop-blur-xl md:hidden"
      >
        <div
          className="grid grid-cols-4 px-2 pt-1.5"
          style={{ paddingBottom: 'max(0.375rem, env(safe-area-inset-bottom))' }}
        >
          {primaryItems.map(({ id, icon: Icon, labelKey }) => {
            const selected = activeTab === id && !activeSheet;
            return (
              <button
                key={id}
                type="button"
                onClick={() => select(id)}
                aria-current={selected ? 'page' : undefined}
                className={cn(
                  'flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[11px] font-medium transition-colors active:bg-[hsl(var(--surface-soft-hover))]',
                  selected ? 'text-primary' : 'text-muted-foreground',
                )}
              >
                <Icon size={21} strokeWidth={selected ? 2.2 : 1.8} />
                <span>{t(labelKey)}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-expanded={moreOpen}
            className={cn(
              'flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[11px] font-medium transition-colors active:bg-[hsl(var(--surface-soft-hover))]',
              moreIsActive || moreOpen ? 'text-primary' : 'text-muted-foreground',
            )}
          >
            <MoreHorizontal size={22} strokeWidth={moreIsActive || moreOpen ? 2.2 : 1.8} />
            <span>{lang === 'zh' ? '更多' : 'More'}</span>
          </button>
        </div>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent
          side="bottom"
          expandable={false}
          className="bottom-sheet max-h-[72dvh] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 md:hidden"
        >
          <SheetHeader className="px-2 pb-3 text-left">
            <SheetTitle>{lang === 'zh' ? '更多' : 'More'}</SheetTitle>
            <SheetDescription className="sr-only">
              {lang === 'zh' ? '打开辅助页面和个人设置' : 'Open supporting pages and profile settings'}
            </SheetDescription>
          </SheetHeader>
          <div className="grid grid-cols-2 gap-2">
            {secondaryItems.map(({ id, icon: Icon, label }) => {
              const selected =
                id === 'profile' ? activeTab === id : activeSheet === (id === 'linkup' ? 'links' : id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => select(id)}
                  aria-current={selected ? 'page' : undefined}
                  className={cn(
                    'flex min-h-14 items-center gap-3 rounded-2xl border px-4 text-left text-sm font-semibold transition-colors active:scale-[0.99]',
                    selected
                      ? 'border-primary/25 bg-primary/10 text-primary'
                      : 'border-border/70 bg-[hsl(var(--surface-soft))] text-foreground',
                  )}
                >
                  <Icon size={20} strokeWidth={selected ? 2.2 : 1.8} />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
