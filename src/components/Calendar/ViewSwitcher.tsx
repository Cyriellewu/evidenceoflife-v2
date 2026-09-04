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
              'min-h-9 px-2.5 py-1 rounded-md text-xs font-medium transition-all sm:min-h-0 sm:px-3',
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
          'hidden text-[10px] px-2 py-1 rounded-full transition-all sm:inline-flex',
          savedDefault === viewMode
            ? 'text-primary bg-primary/10'
            : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
        )}
        title="Set as default view"
      >
        {showSaved ? (
          <span className="flex items-center gap-0.5"><Check size={10} /> Saved</span>
        ) : savedDefault === viewMode ? '★ Default' : '☆ Set default'}
      </button>
    </div>
  );
}
