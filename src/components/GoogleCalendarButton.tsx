import { CalendarDays, Loader2, Unlink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useGoogleCalendar } from '@/hooks/useGoogleCalendar';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useState } from 'react';

/** Compact Google Calendar connect/status button for the top nav */
export function GoogleCalendarButton() {
  const [open, setOpen] = useState(false);
  const gcal = useGoogleCalendar({ loadCalendars: open });

  if (gcal.loading) return null;

  if (!gcal.connected) {
    return (
      <Button
        type="button"
        onClick={gcal.connect}
        variant="ghost"
        disabled={gcal.syncing}
        className="h-11 rounded-full border border-border/70 bg-secondary/35 px-4 text-[14px] font-medium gap-2 text-muted-foreground hover:bg-secondary/55 hover:text-foreground disabled:opacity-60"
      >
        {gcal.syncing ? <Loader2 size={15} className="animate-spin" /> : <CalendarDays size={15} />}
        <span>GCal</span>
      </Button>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="h-11 rounded-full border border-border/70 bg-secondary/35 px-4 text-[14px] font-medium gap-2 text-foreground hover:bg-secondary/55"
        >
          <CalendarDays size={15} />
          {gcal.syncing && <Loader2 size={11} className="animate-spin" />}
          <span>GCal</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium">Google Calendar</span>
          <button onClick={gcal.disconnect} className="text-[10px] text-muted-foreground hover:text-destructive flex items-center gap-1">
            <Unlink size={10} /> Disconnect
          </button>
        </div>
        {/* Toggle: whether to mix GCal events into the app */}
        <div className="flex items-center justify-between mt-1">
          <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <input
              type="checkbox"
              className="rounded border-border/40"
              checked={gcal.showInApp}
              onChange={e => gcal.setShowInApp(e.target.checked)}
            />
            <span>Show in app</span>
          </label>
        </div>

        {/* Calendar selector */}
        {gcal.calendars.length > 0 && (
          <div className="mt-1">
            <label className="block text-[10px] text-muted-foreground/60 mb-0.5">Calendar</label>
            <select
              className="w-full border border-border/40 rounded-md bg-background text-[11px] px-1.5 py-1"
              value={gcal.selectedCalendarId || ''}
              onChange={e => gcal.setSelectedCalendarId(e.target.value)}
            >
              {gcal.calendars.map(cal => (
                <option key={cal.id} value={cal.id}>
                  {cal.summary}{cal.primary ? ' (primary)' : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        {gcal.events.length > 0 ? (
          <div className="space-y-1">
            {gcal.events.slice(0, 5).map(event => (
              <div key={event.id} className="flex items-center gap-2 py-1">
                <div className="w-1.5 h-1.5 rounded-full bg-primary/60 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs truncate">{event.title}</p>
                  <p className="text-[10px] text-muted-foreground font-mono">
                    {event.allDay ? 'All day' : `${format(new Date(event.start), 'HH:mm')} – ${format(new Date(event.end), 'HH:mm')}`}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No events today</p>
        )}
      </PopoverContent>
    </Popover>
  );
}
