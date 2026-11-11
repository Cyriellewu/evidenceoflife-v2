import { ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer';

/**
 * The composer's "+": one button, one menu, the same everywhere.
 * Phone → a bottom sheet with large rows (thumb reach, nothing floating over
 * the keyboard, the composer stays where it is). Desktop → a popover above
 * the button. Hosts pass their rows as children.
 */
export function ComposerPlusMenu({
  open,
  onOpenChange,
  active,
  label,
  title,
  children,
  width = 'w-72',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Something chosen in the menu is in effect (tint the button). */
  active?: boolean;
  label: string;
  /** Sheet title on phones (screen readers too). */
  title?: string;
  children: ReactNode;
  width?: string;
}) {
  const isMobile = useIsMobile();
  const button = (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-expanded={open}
      onClick={isMobile ? () => onOpenChange(!open) : undefined}
      className={cn(
        'flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full transition-colors',
        open || active
          ? 'bg-[hsl(var(--surface-inset))] text-foreground'
          : 'text-muted-foreground hover:bg-[hsl(var(--surface-soft-hover))] hover:text-foreground',
      )}
    >
      <Plus size={19} />
    </button>
  );

  if (isMobile) {
    return (
      <>
        {button}
        <Drawer open={open} onOpenChange={onOpenChange} shouldScaleBackground={false}>
          <DrawerContent
            className="z-[200] max-h-[85dvh] rounded-t-[22px] border-border/60 bg-[hsl(var(--toolbar-background))] pb-[max(1rem,env(safe-area-inset-bottom))]"
            overlayClassName="z-[190] bg-black/50"
          >
            <DrawerTitle className="sr-only">{title ?? label}</DrawerTitle>
            <div className="overflow-y-auto px-2 pt-2 text-[16px]">{children}</div>
          </DrawerContent>
        </Drawer>
      </>
    );
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{button}</PopoverTrigger>
      <PopoverContent className={cn('z-[70] p-0', width)} align="start" side="top" sideOffset={10}>
        {children}
      </PopoverContent>
    </Popover>
  );
}
