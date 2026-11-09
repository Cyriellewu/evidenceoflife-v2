import { useEffect, type ReactNode } from 'react';
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
 * - Light panel with brand logo, dense nav; swipe from the left edge to open
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

  // Swipe right from the left edge opens the drawer (phones only; the chrome is md:hidden).
  useEffect(() => {
    if (open) return;
    let startX = 0;
    let startY = 0;
    let tracking = false;
    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      tracking = e.touches.length === 1 && t.clientX <= 24 && window.innerWidth < 768;
      startX = t.clientX;
      startY = t.clientY;
    };
    const onMove = (e: TouchEvent) => {
      if (!tracking) return;
      const t = e.touches[0];
      const dx = t.clientX - startX;
      const dy = Math.abs(t.clientY - startY);
      if (dy > 40) { tracking = false; return; }
      if (dx > 56 && dx > dy * 1.5) {
        tracking = false;
        onOpenChange(true);
      }
    };
    const onEnd = () => { tracking = false; };
    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: true });
    document.addEventListener('touchend', onEnd, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
    };
  }, [open, onOpenChange]);

  return (
    <>
      <div
        className={cn(
          // Opaque: a translucent bar let scrolled text ghost through it.
          'sticky top-0 -mx-2 mb-1 border-b border-border/35 bg-background px-2 md:hidden sm:-mx-3 sm:px-3',
          'pt-[env(safe-area-inset-top)]',
          open ? 'z-[40]' : 'z-[130]',
        )}
      >
        <div className="grid h-10 grid-cols-[2.25rem_1fr_2.25rem] items-center">
          {/* A sub-page (e.g. a Map city) may portal a back button into
              #mobile-nav-leading; it covers the menu button, iOS-style. The
              drawer still opens with the left-edge swipe. */}
          <div className="relative h-8 w-8">
            <button
              type="button"
              onClick={() => onOpenChange(true)}
              className="flex h-8 w-8 items-center justify-center rounded-full text-foreground/85 transition-colors hover:bg-[hsl(var(--surface-soft))]"
              aria-label={lang === 'zh' ? '打开菜单' : 'Open menu'}
              aria-haspopup="dialog"
              aria-expanded={open}
            >
              <Menu size={18} strokeWidth={1.9} />
            </button>
            <div id="mobile-nav-leading" className="absolute inset-y-0 left-0 flex w-max items-center empty:pointer-events-none" />
          </div>
          {/* Pages without a centerSlot (e.g. Map) may portal a compact title here. */}
          <div id="mobile-nav-center" className="flex min-w-0 items-center justify-center">
            {centerSlot}
          </div>
          <div aria-hidden className="h-8 w-8" />
        </div>
      </div>

      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="left"
          expandable={false}
          overlayClassName="!z-[210]"
          className={cn(
            '!z-[220] w-[min(74vw,260px)] gap-0 border-r border-border/50 p-0 shadow-[12px_0_40px_-20px_hsl(var(--foreground)/0.25)] sm:max-w-[260px] sm:rounded-none',
            // Plain app background, like an iOS sidebar — light, not a heavy wash.
            'bg-background',
            '[&>div.absolute]:hidden',
          )}
        >
          <SheetTitle className="sr-only">
            {lang === 'zh' ? '导航' : 'Navigation'}
          </SheetTitle>
          <div className="flex h-full flex-col">
            <div className="relative px-3 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="absolute right-2 top-[max(0.55rem,env(safe-area-inset-top))] flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
                aria-label={lang === 'zh' ? '关闭' : 'Close'}
              >
                <X size={16} />
              </button>
              <div className="flex min-w-0 items-center gap-2 pr-8">
                <BrandLogo
                  variant="mark"
                  alt="Evidence of life"
                  className="h-9 w-9 flex-shrink-0"
                />
                <span className="font-brand min-w-0 flex-1 truncate text-[19px] font-medium leading-none tracking-tight text-foreground">
                  Evidence of life
                </span>
              </div>
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
