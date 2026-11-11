import { ReactNode, createContext, useContext } from 'react';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';

/**
 * True when the page's title is already shown in the phone top bar (Index
 * renders these views as pages and puts the Deadlines / Habits switcher
 * there). The in-page title and subtitle then hide; secondary rows stay.
 */
export const PageTitleInTopBarContext = createContext(false);

export function SheetHeader({
  title,
  subtitle,
  right,
  secondaryRow,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  secondaryRow?: ReactNode;
  className?: string;
}) {
  const titleInTopBar = useContext(PageTitleInTopBarContext);
  if (titleInTopBar) {
    return secondaryRow || right ? (
      <div className="flex items-center gap-2 px-4 pb-1 pt-2">
        <div className="min-w-0 flex-1">{secondaryRow}</div>
        {right}
      </div>
    ) : null;
  }
  return (
    <PageHeader
      variant="sheet"
      title={title}
      subtitle={subtitle}
      right={right}
      secondaryRow={secondaryRow}
      className={className}
    />
  );
}

export function SheetEmptyState({
  icon,
  title,
  hint,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  hint?: ReactNode;
  className?: string;
}) {
  return <EmptyState variant="centered" icon={icon} title={title} hint={hint} className={className} />;
}
