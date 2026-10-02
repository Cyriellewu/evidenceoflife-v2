import type { ReactNode } from 'react';
import { Menu, X } from 'lucide-react';
import { TabType } from '@/types';
import { useLanguage } from '@/hooks/useLanguage';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { SideNav } from '@/components/SideNav';
import { BrandLogo } from '@/components/BrandLogo';
import { cn } from '@/lib/utils';

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
 * Phone chrome patterned after ChatGPT / GenAI drawers:
 * - Narrow left drawer (not a near-full-screen white sheet)
 * - Soft gray panel with brand logo, dense nav
 * - Sits above composers so "Add a task" never floats on top of the menu
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
      <div
        className={cn(
          'sticky top-0 -mx-2 mb-1 border-b border-border/35 bg-[hsl(var(--background)/0.92)] px-2 backdrop-blur-xl md:hidden sm:-mx-3 sm:px-3',
          open ? 'z-[40]' : 'z-[130]',
        )}
      >
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
          overlayClassName="!z-[210]"
          className={cn(
            '!z-[220] w-[min(74vw,260px)] gap-0 border-r border-black/10 p-0 shadow-[8px_0_32px_-12px_rgba(0,0,0,0.32)] sm:max-w-[260px] sm:rounded-none',
            // Deeper warm gray — less blank white than surface-contrast / #eceae6.
            'bg-[#cfcbc4] dark:border-white/10 dark:bg-[hsl(220_9%_11%)]',
            '[&>div.absolute]:hidden',
          )}
        >
          <SheetTitle className="sr-only">
            {lang === 'zh' ? '导航' : 'Navigation'}
          </SheetTitle>
          <div className="flex h-full flex-col">
            <div className="flex items-center gap-2.5 border-b border-black/[0.06] px-3 pb-3 pt-3.5 dark:border-white/[0.08]">
              <BrandLogo alt="Evidence of life" className="h-10 w-10 flex-shrink-0" />
              <span className="font-brand min-w-0 flex-1 text-[22px] font-medium leading-[1.05] tracking-tight text-foreground/90">
                Evidence of life
              </span>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-black/[0.06] hover:text-foreground dark:hover:bg-white/[0.06]"
                aria-label={lang === 'zh' ? '关闭' : 'Close'}
              >
                <X size={16} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <SideNav
                variant="panel"
                activeTab={activeTab}
                activeSheet={activeSheet}
                onTabChange={(tab) => {
                  onTabChange(tab);
                  onOpenChange(false);
                }}
              />
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
