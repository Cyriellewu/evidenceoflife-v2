import type { ReactNode } from 'react';
import { Menu, X } from 'lucide-react';
import { TabType } from '@/types';
import { useLanguage } from '@/hooks/useLanguage';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { SideNav } from '@/components/SideNav';
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
 * - Soft gray panel, dense nav, no empty white void
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
          // Stay under the drawer (z-210/220) so the hamburger never stacks on top of the menu.
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
          // z above Plan composers (z-55/70) so the input cannot float over the drawer.
          className={cn(
            '!z-[220] w-[min(64vw,220px)] gap-0 border-r border-black/5 p-0 shadow-[8px_0_32px_-12px_rgba(0,0,0,0.28)] sm:max-w-[220px] sm:rounded-none',
            // Soft warm gray like ChatGPT — not pure white surface-contrast.
            'bg-[#eceae6] dark:border-white/10 dark:bg-[hsl(220_8%_12%)]',
            // Hide the default sheet close chip; SideNav has its own header.
            '[&>div.absolute]:hidden',
          )}
        >
          <SheetTitle className="sr-only">
            {lang === 'zh' ? '导航' : 'Navigation'}
          </SheetTitle>
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between gap-2 px-3 pb-1 pt-3">
              <span className="font-brand text-[15px] font-medium tracking-tight text-foreground/90">
                Evidence of life
              </span>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-black/[0.05] hover:text-foreground dark:hover:bg-white/[0.06]"
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
