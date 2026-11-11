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
              'px-3.5 py-1 rounded-md text-[13px] font-medium transition-all',
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
          'flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[15px] transition-all',
          savedDefault === viewMode
            ? 'text-primary bg-primary/10'
            : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
        )}
        title={savedDefault === viewMode ? 'Default view' : 'Set as default view'}
        aria-label={savedDefault === viewMode ? 'Default view' : 'Set as default view'}
      >
        {/* A quiet star; the tooltip says what it does. */}
        {showSaved ? <Check size={14} /> : savedDefault === viewMode ? '★' : '☆'}
      </button>
    </div>
  );
}
