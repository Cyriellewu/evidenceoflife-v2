import { useState, useMemo } from 'react';
import { format, parseISO } from 'date-fns';
import { X, MapPin, Pencil, Trash2, Check, Bell, Link, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/hooks/useLanguage';
import { useReminders } from '@/hooks/useReminders';
import { useWorkTypes } from '@/hooks/useWorkTypes';
import { WorkType, WORK_TYPE_META } from '@/lib/workType';
import { StorageImage } from "@/components/StorageImage";

export interface CalendarEvent {
  id: string;
  title: string;
  startHour: number;
  startMinute: number;
  durationMinutes: number;
  type: 'moment' | 'todo' | 'imported';
  emoji?: string;
  photos?: string[];
  location?: string;
  description?: string;
  tags?: string[];
}

interface EventDetailPopupProps {
  event: CalendarEvent;
  eventDate?: string; // 'yyyy-MM-dd' — needed for absolute reminder times
  onClose: () => void;
  onDelete?: (id: string, type: 'moment' | 'todo' | 'imported') => void;
  onRename?: (id: string, type: 'moment' | 'todo' | 'imported', newTitle: string) => void;
}

function isUrl(s: string) {
  return /^https?:\/\//i.test(s.trim());
}

const REMINDER_PRESETS = [
  { label: '10m', minutes: 10 },
  { label: '30m', minutes: 30 },
  { label: '1h', minutes: 60 },
  { label: '3h', minutes: 180 },
];

export function EventDetailPopup({ event, eventDate, onClose, onDelete, onRename }: EventDetailPopupProps) {
  const { lang } = useLanguage();
  const { reminders, addReminderAt, deleteReminder } = useReminders();
  const { getWorkType, setWorkType } = useWorkTypes();
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(event.title);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showWorkTypeMenu, setShowWorkTypeMenu] = useState(false);
  const [showReminderPanel, setShowReminderPanel] = useState(false);
  const [customMinutes, setCustomMinutes] = useState('');
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);

  const startTime = format(new Date(2000, 0, 1, event.startHour, event.startMinute), 'h:mm a');
  const endMin = event.startHour * 60 + event.startMinute + event.durationMinutes;
  const endTime = event.durationMinutes > 0
    ? format(new Date(2000, 0, 1, Math.floor(endMin / 60) % 24, endMin % 60), 'h:mm a')
    : null;

  const workType = event.type === 'imported'
    ? null
    : getWorkType({ entity: event.type, id: event.id, title: event.title, tags: event.tags });

  // Reminders associated with this event (by title)
  const eventReminders = useMemo(
    () => reminders.filter(r => r.title === event.title && r.is_active),
    [reminders, event.title]
  );

  const handleSave = () => {
    if (editTitle.trim() && editTitle.trim() !== event.title) {
      onRename?.(event.id, event.type, editTitle.trim());
    }
    setIsEditing(false);
  };

  const handleDelete = () => {
    onDelete?.(event.id, event.type);
    onClose();
  };

  const addReminderMinutesBefore = async (minutes: number) => {
    if (!eventDate) return;
    const eventStart = new Date(`${eventDate}T${String(event.startHour).padStart(2, '0')}:${String(event.startMinute).padStart(2, '0')}:00`);
    const at = new Date(eventStart.getTime() - minutes * 60 * 1000);
    if (at < new Date()) return; // already in the past
    await addReminderAt(event.title, at, `${minutes < 60 ? `${minutes}m` : `${minutes / 60}h`} before event`, 'browser');
  };

  const handleCustomAdd = async () => {
    const mins = parseInt(customMinutes, 10);
    if (!isNaN(mins) && mins > 0) {
      await addReminderMinutesBefore(mins);
      setCustomMinutes('');
    }
  };

  // Render description: if it looks like a URL, show as clickable link
  const renderDescription = (desc: string) => {
    const parts = desc.split(/(\s+)/);
    return parts.map((part, i) =>
      isUrl(part) ? (
        <a
          key={i}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline underline-offset-2 break-all hover:opacity-80 transition-opacity"
          onClick={e => e.stopPropagation()}
        >
          {part}
        </a>
      ) : part
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center animate-fade-in" onClick={onClose}>
      <div className="w-[360px] max-w-[90vw] bg-card border border-border rounded-2xl p-5 shadow-xl space-y-3" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {event.emoji && <span className="text-xl">{event.emoji}</span>}
            <span className={cn(
              "text-xs px-2 py-0.5 rounded-full font-medium",
              event.type === 'todo' ? "bg-primary/15 text-primary" : event.type === 'imported' ? "bg-accent text-accent-foreground" : "bg-primary/10 text-primary/80"
            )}>
              {event.type === 'todo' ? 'Task' : event.type === 'imported' ? 'Calendar' : 'Moment'}
            </span>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1 text-muted-foreground hover:text-foreground transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Title */}
        {isEditing ? (
          <div className="flex items-center gap-2">
            <input
              value={editTitle}
              onChange={e => setEditTitle(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleSave();
                if (e.key === 'Escape') { setIsEditing(false); setEditTitle(event.title); }
              }}
              className="flex-1 text-base font-medium bg-secondary/50 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary/30"
              autoFocus
            />
            <button onClick={handleSave} aria-label="Save" className="p-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
              <Check size={14} />
            </button>
          </div>
        ) : (
          <p className="text-base font-medium cursor-pointer hover:text-primary/80 transition-colors" onClick={() => { if (onRename) { setIsEditing(true); setEditTitle(event.title); } }}>
            {event.title}
          </p>
        )}

        {/* Time */}
        <p className="text-sm text-muted-foreground font-mono">
          {startTime}{endTime && ` – ${endTime}`}
        </p>

        {workType && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowWorkTypeMenu(prev => !prev)}
              className="rounded-full px-3 py-1 text-xs font-medium transition-colors hover:brightness-[0.98]"
              style={{ color: WORK_TYPE_META[workType].color, backgroundColor: WORK_TYPE_META[workType].bg }}
            >
              {WORK_TYPE_META[workType].label}
            </button>
            {showWorkTypeMenu && (
              <div className="absolute left-0 top-full mt-2 z-20 min-w-[180px] rounded-2xl border border-border bg-card p-2 shadow-xl">
                <p className="px-2 pb-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground/55">Task Type</p>
                <div className="space-y-1">
                  {(['deep', 'shallow', 'admin', 'errand', 'recovery'] as WorkType[]).map((type) => {
                    const meta = WORK_TYPE_META[type];
                    const active = workType === type;
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => { setWorkType(event.type as 'todo' | 'moment', event.id, type); setShowWorkTypeMenu(false); }}
                        className={cn('flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs transition-colors', active ? 'bg-secondary/70' : 'hover:bg-secondary/50')}
                      >
                        <span className="font-medium" style={{ color: meta.color }}>{meta.label}</span>
                        {active && <Check size={12} className="text-muted-foreground" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Location */}
        {event.location && (
          <p className="text-sm text-muted-foreground flex items-center gap-1">
            <MapPin size={12} />{event.location}
          </p>
        )}

        {/* Description / links */}
        {event.description && (
          <div className="text-sm text-muted-foreground leading-relaxed">
            {renderDescription(event.description)}
          </div>
        )}

        {/* Photos */}
        {event.photos && event.photos.length > 0 && (
          <div className="grid grid-cols-3 gap-1.5">
            {event.photos.map((photo, i) => (
              <button key={i} type="button" onClick={() => setSelectedPhoto(photo)} className="overflow-hidden rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30">
                <StorageImage src={photo} alt="" className="w-full aspect-square object-cover rounded-lg transition-transform hover:scale-[1.03]" />
              </button>
            ))}
          </div>
        )}

        {/* Reminders panel */}
        {showReminderPanel && (
          <div className="rounded-xl border border-border/60 bg-secondary/30 p-3 space-y-2.5">
            <p className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wider">
              {lang === 'zh' ? '提醒' : 'Reminders'}
            </p>

            {/* Existing reminders */}
            {eventReminders.length > 0 && (
              <div className="space-y-1.5">
                {eventReminders.map(r => (
                  <div key={r.id} className="flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-1.5 text-foreground/70 min-w-0">
                      <Bell size={10} className="flex-shrink-0 text-primary/60" />
                      <span className="truncate">{format(parseISO(r.next_reminder_at), 'MMM d, h:mm a')}</span>
                      {r.description && <span className="text-muted-foreground/50 truncate">· {r.description}</span>}
                    </div>
                    <button
                      onClick={() => deleteReminder(r.id)}
                      className="flex-shrink-0 p-0.5 rounded text-muted-foreground/50 hover:text-destructive transition-colors"
                    >
                      <X size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add presets */}
            {eventDate ? (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-1.5">
                  {REMINDER_PRESETS.map(p => (
                    <button
                      key={p.minutes}
                      onClick={() => addReminderMinutesBefore(p.minutes)}
                      className="px-2.5 py-1 rounded-lg text-xs bg-card border border-border hover:bg-secondary transition-colors"
                    >
                      {p.label} {lang === 'zh' ? '前' : 'before'}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min="1"
                    placeholder={lang === 'zh' ? '自定义分钟' : 'custom min'}
                    value={customMinutes}
                    onChange={e => setCustomMinutes(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleCustomAdd(); }}
                    className="flex-1 text-xs px-2.5 py-1.5 rounded-lg bg-card border border-border focus:outline-none focus:ring-1 focus:ring-primary/30 min-w-0"
                  />
                  <button
                    onClick={handleCustomAdd}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs bg-primary/10 text-primary hover:bg-primary/20 transition-colors flex-shrink-0"
                  >
                    <Plus size={11} />
                    {lang === 'zh' ? '添加' : 'Add'}
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground/50">{lang === 'zh' ? '无法确定事件日期' : 'Event date unknown — open from calendar view'}</p>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-2 pt-2 border-t border-border/30 flex-wrap">
          {onRename && !isEditing && (
            <button
              onClick={() => { setIsEditing(true); setEditTitle(event.title); }}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
            >
              <Pencil size={12} />
              {lang === 'zh' ? '编辑' : 'Edit'}
            </button>
          )}

          {/* Reminder toggle */}
          <button
            onClick={() => setShowReminderPanel(p => !p)}
            className={cn(
              "flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors",
              (showReminderPanel || eventReminders.length > 0)
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            )}
          >
            <Bell size={12} />
            {eventReminders.length > 0
              ? `${eventReminders.length} ${lang === 'zh' ? '个提醒' : 'reminder' + (eventReminders.length > 1 ? 's' : '')}`
              : (lang === 'zh' ? '提醒' : 'Remind')}
          </button>

          {/* Open link shortcut */}
          {event.description && isUrl(event.description.split(/\s/)[0]) && (
            <a
              href={event.description.split(/\s/)[0]}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
            >
              <Link size={12} />
              {lang === 'zh' ? '打开链接' : 'Open link'}
            </a>
          )}

          {onDelete && (
            showDeleteConfirm ? (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-destructive">{lang === 'zh' ? '确认删除？' : 'Delete?'}</span>
                <button onClick={handleDelete} className="text-xs px-2 py-1 rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors">
                  {lang === 'zh' ? '确认' : 'Yes'}
                </button>
                <button onClick={() => setShowDeleteConfirm(false)} className="text-xs px-2 py-1 rounded-md text-muted-foreground hover:bg-secondary transition-colors">
                  {lang === 'zh' ? '取消' : 'No'}
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg text-destructive/70 hover:bg-destructive/10 hover:text-destructive transition-colors"
              >
                <Trash2 size={12} />
                {lang === 'zh' ? '删除' : 'Delete'}
              </button>
            )
          )}
        </div>
      </div>

      {selectedPhoto && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/72 p-6" onClick={() => setSelectedPhoto(null)}>
          <button type="button" onClick={() => setSelectedPhoto(null)} aria-label="Close photo" className="absolute right-5 top-5 rounded-full bg-white/12 p-2 text-white/90 transition-colors hover:bg-white/20">
            <X size={18} />
          </button>
          <StorageImage src={selectedPhoto} alt="" className="max-h-[88vh] max-w-[88vw] rounded-2xl object-contain shadow-2xl" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}
