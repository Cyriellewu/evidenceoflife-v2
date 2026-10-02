import type { ReactNode } from 'react';
import { Menu } from 'lucide-react';
import { TabType } from '@/types';
import { useLanguage } from '@/hooks/useLanguage';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { SideNav } from '@/components/SideNav';

type SheetKey = 'notes' | 'dues' | 'habits' | 'links';

interface MobileNavChromeProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeTab: TabType;
  activeSheet?: SheetKey | null;
  onTabChange: (tab: TabType) => void;
  /** Optional center control (e.g. Tasks | Timeline), like Chat | Work in the reference. */
  centerSlot?: ReactNode;
}

/**
 * Phone chrome patterned after common full-bleed mobile apps:
 * - Sidebar is a left drawer, closed by default (no permanent rail)
 * - Top row: menu button + optional centered mode switcher
 * - Bottom stays free for the composer
 */
export function MobileNavChrome({
  open,
  onOpenChange,
  activeTab,
  activeSheet,
  onTabChange,
  centerSlot,
}: MobileNavChromeProps) {
  const { lang } = useLanguage();

  return (
    <>
      <div className="sticky top-0 z-[130] -mx-2 mb-1 border-b border-border/35 bg-[hsl(var(--background)/0.92)] px-2 backdrop-blur-xl md:hidden sm:-mx-3 sm:px-3">
        <div className="grid h-12 grid-cols-[2.25rem_1fr_2.25rem] items-center">
          <button
            type="button"
            onClick={() => onOpenChange(true)}
            className="flex h-9 w-9 items-center justify-center rounded-full text-foreground/85 transition-colors hover:bg-[hsl(var(--surface-soft))]"
            aria-label={lang === 'zh' ? '打开菜单' : 'Open menu'}
            aria-haspopup="dialog"
            aria-expanded={open}
          >
            <Menu size={20} strokeWidth={1.9} />
          </button>
          <div className="flex min-w-0 items-center justify-center">
            {centerSlot}
          </div>
          <div aria-hidden className="h-9 w-9" />
        </div>
      </div>

      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="left"
          expandable={false}
          className="w-[min(86vw,300px)] gap-0 border-border/55 bg-[hsl(var(--surface-contrast))] p-0 sm:max-w-[300px] sm:rounded-none"
        >
          <SheetTitle className="sr-only">
            {lang === 'zh' ? '导航' : 'Navigation'}
          </SheetTitle>
          <SideNav
            variant="panel"
            activeTab={activeTab}
            activeSheet={activeSheet}
            onTabChange={(tab) => {
              onTabChange(tab);
              onOpenChange(false);
            }}
          />
        </SheetContent>
      </Sheet>
    </>
  );
}
