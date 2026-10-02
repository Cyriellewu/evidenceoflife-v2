import { useState, useMemo, useCallback } from 'react';
import { Plus, MapPin, Bell, X, Image, Clock, Link2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { EmojiGrid } from '@/components/today/EmojiGrid';
import { LocationPopover } from '@/components/LocationPopover';
import { useLanguage } from '@/hooks/useLanguage';

// Auto-tag detection keywords
const AUTO_TAG_RULES: { keywords: string[]; tag: string }[] = [
  { keywords: ['gym', 'workout', 'exercise', '健身', '运动', '锻炼', '跑步'], tag: '🏋️ Gym' },
  { keywords: ['study', 'learn', '学习', '看书', '读书', '复习'], tag: '📚 Study' },
  { keywords: ['cook', 'dinner', 'lunch', 'breakfast', '做饭', '吃饭', '晚餐', '午餐', '早餐', 'dine'], tag: '🍳 Dine' },
  { keywords: ['coffee', 'café', 'cafe', '咖啡'], tag: '☕ Coffee' },
  { keywords: ['walk', 'hike', '散步', '徒步'], tag: '🚶 Walk' },
  { keywords: ['clean', 'laundry', '打扫', '洗衣', '清洁', '床单'], tag: '🧹 Clean' },
  { keywords: ['shop', 'grocery', 'buy', '购物', '买', '超市'], tag: '🛒 Shop' },
  { keywords: ['meeting', 'interview', '开会', '面试', '会议'], tag: '💼 Work' },
  { keywords: ['code', 'program', '编程', '写代码', '开发'], tag: '💻 Code' },
  { keywords: ['paint', 'draw', 'art', '画画', '绘画', '艺术'], tag: '🎨 Art' },
  { keywords: ['call', 'phone', '打电话', '电话'], tag: '📞 Call' },
  { keywords: ['toothbrush', 'filter', '牙刷', '滤芯', '更换'], tag: '🔄 Replace' },
];

export function detectAutoTags(text: string): string[] {
  const lower = text.toLowerCase();
  const detected: string[] = [];
  AUTO_TAG_RULES.forEach(rule => {
    if (rule.keywords.some(kw => lower.includes(kw))) {
      detected.push(rule.tag);
    }
  });
  return detected;
}

interface ReminderConfig {
  enabled: boolean;
  intervalDays: number;
}

const REMINDER_PRESETS = [
  { label: '7天', days: 7 },
  { label: '14天', days: 14 },
  { label: '30天', days: 30 },
  { label: '60天', days: 60 },
  { label: '90天', days: 90 },
];

interface InputPlusMenuProps {
  // Emoji
  emojis: string[];
  selectedEmoji: string | null;
  onEmojiChange: (emoji: string | null) => void;
  // Location
  selectedLocation: { name: string; lat: number; lng: number; category: 'restaurant' | 'coffee' | 'grocery' | 'park' | 'museum' | 'other' } | null;
  onLocationChange: (loc: { name: string; lat: number; lng: number; category: 'restaurant' | 'coffee' | 'grocery' | 'park' | 'museum' | 'other' }) => void;
  // Tags
  availableTags: { key: string; label: string }[];
  selectedTags: string[];
  onTagsChange: (tags: string[]) => void;
  autoDetectedTags?: string[];
  // Photos
  onPhotoClick?: () => void;
  photoCount?: number;
  // Links
  onAddLink?: (url: string) => Promise<boolean> | boolean;
  linkCount?: number;
  // Reminder
  reminderConfig?: ReminderConfig;
  onReminderChange?: (config: ReminderConfig) => void;
  showReminder?: boolean;
  // Time (for recap)
  showTime?: boolean;
  startTime?: string;
  endTime?: string;
  onStartTimeChange?: (v: string) => void;
  onEndTimeChange?: (v: string) => void;
}

export function InputPlusMenu({
  emojis, selectedEmoji, onEmojiChange,
  selectedLocation, onLocationChange,
  availableTags, selectedTags, onTagsChange,
  autoDetectedTags = [],
  onPhotoClick, photoCount = 0,
  onAddLink, linkCount = 0,
  reminderConfig, onReminderChange, showReminder = true,
  showTime = false, startTime, endTime, onStartTimeChange, onEndTimeChange,
}: InputPlusMenuProps) {
  const { lang } = useLanguage();
  const [menuOpen, setMenuOpen] = useState(false);
  const [activePanel, setActivePanel] = useState<'main' | 'location' | 'reminder' | 'time' | 'link'>('main');
  const [locationAutoLocateToken, setLocationAutoLocateToken] = useState<number | undefined>(undefined);
  const [linkUrl, setLinkUrl] = useState('');
  const [addingLink, setAddingLink] = useState(false);

  // Merge auto-detected with manually selected
  const allSuggestedTags = useMemo(() => {
    const set = new Set([...autoDetectedTags, ...selectedTags]);
    return Array.from(set);
  }, [autoDetectedTags, selectedTags]);

  const toggleTag = (tag: string) => {
    onTagsChange(selectedTags.includes(tag) ? selectedTags.filter(t => t !== tag) : [...selectedTags, tag]);
  };

  const handleOpenPanel = (panel: typeof activePanel) => {
    setActivePanel(panel);
  };

  return (
    <Popover open={menuOpen} onOpenChange={(open) => { setMenuOpen(open); if (open) setActivePanel('main'); }}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-colors",
            (selectedEmoji || selectedLocation || selectedTags.length > 0 || (reminderConfig?.enabled))
              ? "bg-primary/10 text-primary"
              : "bg-secondary/50 hover:bg-secondary text-muted-foreground hover:text-foreground"
          )}
        >
          <Plus size={18} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0 bg-popover text-popover-foreground z-50" align="start" side="top">
        {activePanel === 'main' && (
          <div className="p-2 space-y-0.5">
            {/* Photo */}
            {onPhotoClick && (
              <button onClick={() => { onPhotoClick(); setMenuOpen(false); }} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-secondary transition-colors text-left">
                <Image size={16} className="text-muted-foreground flex-shrink-0" />
                <span className="text-sm flex-1">{lang === 'zh' ? '照片' : 'Photo'}</span>
                {photoCount > 0 && <span className="text-xs text-primary">{photoCount}</span>}
              </button>
            )}
            {onAddLink && (
              <button onClick={() => handleOpenPanel('link')} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-secondary transition-colors text-left">
                <Link2 size={16} className="text-muted-foreground flex-shrink-0" />
                <span className="text-sm flex-1">{lang === 'zh' ? '链接' : 'Link'}</span>
                {linkCount > 0 && <span className="text-xs text-primary">{linkCount}</span>}
              </button>
            )}
            {/* Time */}
            {showTime && (
              <button onClick={() => handleOpenPanel('time')} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-secondary transition-colors text-left">
                <Clock size={16} className="text-muted-foreground flex-shrink-0" />
                <span className="text-sm flex-1">{lang === 'zh' ? '时间' : 'Time'}</span>
                {startTime && <span className="text-xs text-muted-foreground font-mono">{startTime}</span>}
              </button>
            )}
            {/* Reminder */}
            {showReminder && onReminderChange && (
              <button onClick={() => handleOpenPanel('reminder')} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-secondary transition-colors text-left">
                <Bell size={16} className="text-muted-foreground flex-shrink-0" />
                <span className="text-sm flex-1">{lang === 'zh' ? '提醒' : 'Reminder'}</span>
                {reminderConfig?.enabled && <span className="text-xs text-primary">{reminderConfig.intervalDays}{lang === 'zh' ? '天' : 'd'}</span>}
              </button>
            )}
            {/* Location - at bottom */}
            <button
              onClick={() => {
                setLocationAutoLocateToken(Date.now());
                handleOpenPanel('location');
              }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-secondary transition-colors text-left"
            >
              <MapPin size={16} className="text-muted-foreground flex-shrink-0" />
              <span className="text-sm flex-1">{lang === 'zh' ? '位置' : 'Location'}</span>
              {selectedLocation && <span className="text-xs text-primary truncate max-w-[100px]">{selectedLocation.name}</span>}
            </button>
          </div>
        )}

        {activePanel === 'link' && onAddLink && (
          <div className="p-3">
            <div className="mb-3 flex items-center gap-2">
              <button onClick={() => setActivePanel('main')} className="rounded p-1 hover:bg-secondary"><X size={14} /></button>
              <span className="text-sm font-medium">{lang === 'zh' ? '添加链接' : 'Add Link'}</span>
            </div>
            <div className="space-y-2">
              <input
                type="url"
                value={linkUrl}
                onChange={e => setLinkUrl(e.target.value)}
                placeholder="https://..."
                className="w-full rounded-2xl bg-secondary px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <button
                disabled={!linkUrl.trim() || addingLink}
                onClick={async () => {
                  const nextUrl = linkUrl.trim();
                  if (!nextUrl) return;
                  setAddingLink(true);
                  try {
                    const added = await onAddLink(nextUrl);
                    if (added) {
                      setLinkUrl('');
                      setActivePanel('main');
                      setMenuOpen(false);
                    }
                  } finally {
                    setAddingLink(false);
                  }
                }}
                className={cn(
                  "w-full rounded-2xl px-3 py-2 text-sm font-medium transition-colors",
                  !linkUrl.trim() || addingLink
                    ? "bg-secondary text-muted-foreground"
                    : "bg-primary text-primary-foreground hover:opacity-90"
                )}
              >
                {addingLink ? (lang === 'zh' ? '识别中...' : 'Loading...') : (lang === 'zh' ? '生成预览' : 'Create Preview')}
              </button>
            </div>
          </div>
        )}


        {activePanel === 'location' && (
          <div className="p-2">
            <div className="flex items-center gap-2 mb-2">
              <button onClick={() => setActivePanel('main')} className="p-1 hover:bg-secondary rounded"><X size={14} /></button>
              <span className="text-sm font-medium">{lang === 'zh' ? '选择位置' : 'Location'}</span>
              {selectedLocation && (
                <button onClick={() => { onLocationChange(null); setActivePanel('main'); }} className="ml-auto text-xs text-destructive hover:text-destructive/80">{lang === 'zh' ? '清除' : 'Clear'}</button>
              )}
            </div>
            <LocationPopover
              presentation="popover"
              autoLocateToken={locationAutoLocateToken}
              onSelect={(loc) => { onLocationChange(loc); setActivePanel('main'); setMenuOpen(false); }}
              onClose={() => setActivePanel('main')}
            />
          </div>
        )}


        {activePanel === 'time' && (
          <div className="p-3">
            <div className="flex items-center gap-2 mb-3">
              <button onClick={() => setActivePanel('main')} className="p-1 hover:bg-secondary rounded"><X size={14} /></button>
              <span className="text-sm font-medium">{lang === 'zh' ? '设置时间' : 'Set Time'}</span>
            </div>
            <div className="flex items-center gap-2">
              <input type="time" value={startTime || ''} onChange={e => onStartTimeChange?.(e.target.value)} className="bg-secondary rounded-lg px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary flex-1" />
              <span className="text-muted-foreground">→</span>
              <input type="time" value={endTime || ''} onChange={e => onEndTimeChange?.(e.target.value)} className="bg-secondary rounded-lg px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary flex-1" />
            </div>
          </div>
        )}

        {activePanel === 'reminder' && reminderConfig && onReminderChange && (
          <div className="p-3">
            <div className="flex items-center gap-2 mb-3">
              <button onClick={() => setActivePanel('main')} className="p-1 hover:bg-secondary rounded"><X size={14} /></button>
              <span className="text-sm font-medium">{lang === 'zh' ? '设置提醒' : 'Set Reminder'}</span>
              {reminderConfig.enabled && (
                <button onClick={() => { onReminderChange({ enabled: false, intervalDays: 30 }); setActivePanel('main'); }}
                  className="ml-auto text-xs text-destructive hover:text-destructive/80">{lang === 'zh' ? '取消提醒' : 'Remove'}</button>
              )}
            </div>
            <p className="text-xs text-muted-foreground mb-2">{lang === 'zh' ? '提交后，系统会在指定天数后发送邮件提醒' : 'After submitting, you\'ll get an email reminder after the specified days'}</p>
            <div className="flex flex-wrap gap-1.5">
              {REMINDER_PRESETS.map(preset => (
                <button key={preset.days} onClick={() => onReminderChange({ enabled: true, intervalDays: preset.days })}
                  className={cn("px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                    reminderConfig.enabled && reminderConfig.intervalDays === preset.days
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-muted-foreground hover:bg-secondary/80 hover:text-foreground"
                  )}>{preset.label}</button>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{lang === 'zh' ? '自定义' : 'Custom'}:</span>
              <input type="number" min={1} max={365} value={reminderConfig.intervalDays}
                onChange={e => onReminderChange({ enabled: true, intervalDays: Math.max(1, parseInt(e.target.value) || 30) })}
                className="w-16 bg-secondary rounded px-2 py-1 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary" />
              <span className="text-xs text-muted-foreground">{lang === 'zh' ? '天' : 'days'}</span>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
