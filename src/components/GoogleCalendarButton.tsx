import { CalendarDays, Loader2, Unlink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useGoogleCalendar } from '@/hooks/useGoogleCalendar';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

/** Compact Google Calendar connect/status button for the top nav */
export function GoogleCalendarButton() {
  const gcal = useGoogleCalendar();

  if (gcal.loading) return null;

  if (!gcal.connected) {
    return (
      <Button
        type="button"
        onClick={gcal.connect}
        title={gcal.connectionError ? 'Google Calendar needs to be reconnected' : undefined}
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
    <Popover>
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
      <PopoverContent align="end" className="w-72 space-y-3 p-4">
        <div className="flex items-center justify-between">
          <span className="text-[14px] font-semibold">Google Calendar</span>
          <button onClick={gcal.disconnect} className="flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground hover:text-destructive">
            <Unlink size={12} /> Disconnect
          </button>
        </div>
        {/* Toggle: whether to mix GCal events into the app */}
        <div className="flex items-center justify-between mt-1">
          <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
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
            <label className="mb-1.5 block text-[12px] font-medium text-muted-foreground">Calendar</label>
            <select
              className="min-h-10 w-full rounded-xl border border-border/65 bg-background px-3 py-2 text-[14px] text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
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
                  <p className="truncate text-[13px] font-medium">{event.title}</p>
                  <p className="font-mono text-[12px] text-muted-foreground">
                    {event.allDay ? 'All day' : `${format(new Date(event.start), 'HH:mm')} – ${format(new Date(event.end), 'HH:mm')}`}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[13px] text-muted-foreground">No events today</p>
        )}
      </PopoverContent>
    </Popover>
  );
}
