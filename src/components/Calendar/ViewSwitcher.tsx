import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';
import { useState } from 'react';

type CalendarViewMode = 'day' | 'week' | 'month' | 'year';

interface ViewSwitcherProps {
  viewMode: CalendarViewMode;
  onViewModeChange: (mode: CalendarViewMode) => void;
  onSetDefault?: (mode: CalendarViewMode) => void;
}

const views: { key: CalendarViewMode; label: string }[] = [
  { key: 'day', label: 'Day' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'year', label: 'Year' },
];

export function ViewSwitcher({ viewMode, onViewModeChange, onSetDefault }: ViewSwitcherProps) {
  const [savedDefault, setSavedDefault] = useState<string | null>(() => localStorage.getItem('calendar-default-view'));
  const [showSaved, setShowSaved] = useState(false);

  const handleSetDefault = () => {
    onSetDefault?.(viewMode);
    setSavedDefault(viewMode);
    setShowSaved(true);
    setTimeout(() => setShowSaved(false), 1500);
  };

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center bg-secondary/50 rounded-lg p-0.5 gap-0.5">
        {views.map(v => (
          <button
            key={v.key}
            onClick={() => onViewModeChange(v.key)}
            className={cn(
              'px-3 py-1 rounded-md text-xs font-medium transition-all',
              viewMode === v.key
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {v.label}
          </button>
        ))}
      </div>
      <button
        onClick={handleSetDefault}
        className={cn(
          'flex-shrink-0 text-[12px] sm:text-[10px] px-2 py-1 rounded-full transition-all',
          savedDefault === viewMode
            ? 'text-primary bg-primary/10'
            : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
        )}
        title="Set as default view"
        aria-label={savedDefault === viewMode ? 'Default view' : 'Set as default view'}
      >
        {/* Phones: just the star, so the row stays on one line. */}
        {showSaved ? (
          <span className="flex items-center gap-0.5"><Check size={10} /><span className="hidden sm:inline"> Saved</span></span>
        ) : savedDefault === viewMode
          ? <>★<span className="hidden sm:inline"> Default</span></>
          : <>☆<span className="hidden sm:inline"> Set default</span></>}
      </button>
    </div>
  );
}
