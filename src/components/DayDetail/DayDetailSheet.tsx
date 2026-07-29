import { useState, useRef, ChangeEvent } from 'react';
import { format, parseISO } from 'date-fns';
import { useDateLocale } from '@/hooks/useDateLocale';
import { MapPin, Clock, Plus, X, Image, Send, Smile, CalendarDays } from 'lucide-react';
import { Moment } from '@/types';
import { ImportedEvent } from '@/hooks/useImportedEvents';
import { Button } from '@/components/ui/button';
import { cn, isImeComposing } from '@/lib/utils';
import { validatePhotoFile, canAddMorePhotos } from '@/lib/photoValidation';
import { LocationPopover } from '@/components/LocationPopover';
import { EmojiGrid } from '@/components/today/EmojiGrid';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { StorageImage } from "@/components/StorageImage";

interface DayDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: Date | null;
  moments: Moment[];
  importedEvents?: ImportedEvent[];
  onAddMoment?: (data: {
    date: string;
    text?: string;
    emoji?: string;
    photos: string[];
    links?: import('@/types').MomentLinkPreview[];
    location?: { name: string; lat: number; lng: number; category: 'restaurant' | 'coffee' | 'grocery' | 'park' | 'museum' | 'other' };
  }) => void;
}

const emojis = ['🛒', '🍜', '☕', '💻', '🏃', '✈️', '🎬', '🎵', '📚', '🌳', '✨'];

export function DayDetailSheet({ open, onOpenChange, date, moments, importedEvents, onAddMoment }: DayDetailSheetProps) {
  const { formatDate } = useDateLocale();
  const [showAddForm, setShowAddForm] = useState(false);
  const [text, setText] = useState('');
  const [selectedEmoji, setSelectedEmoji] = useState<string | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<{ name: string; lat: number; lng: number; category: 'restaurant' | 'coffee' | 'grocery' | 'park' | 'museum' | 'other' } | null>(null);
  const [selectedPhotos, setSelectedPhotos] = useState<string[]>([]);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!date) return null;

  const isEmpty = moments.length === 0 && (!importedEvents || importedEvents.length === 0);
  const sorted = [...moments].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  const shouldShowSampleTag = (moment: Moment) => {
    if (!moment.id.startsWith('sample-')) return false;
    return !(moment.text || '').includes('(sample)');
  };

  const handlePhotoClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const validFiles = Array.from(files).filter(f => validatePhotoFile(f));
    if (!canAddMorePhotos(selectedPhotos.length, validFiles.length)) return;
    
    validFiles.forEach(file => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        if (dataUrl) {
          setSelectedPhotos(prev => [...prev, dataUrl]);
        }
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const removePhoto = (index: number) => {
    setSelectedPhotos(prev => prev.filter((_, i) => i !== index));
  };

  const canSend = text.trim() || selectedLocation || selectedEmoji || selectedPhotos.length > 0;

  const handleSend = () => {
    if (!canSend || !onAddMoment || !date) return;
    
    onAddMoment({
      date: format(date, 'yyyy-MM-dd'),
      text: text.trim() || undefined,
      emoji: selectedEmoji || undefined,
      photos: selectedPhotos,
      location: selectedLocation || undefined,
    });

    // Reset form
    setText('');
    setSelectedEmoji(null);
    setSelectedLocation(null);
    setSelectedPhotos([]);
    setShowAddForm(false);
  };

  const resetAndClose = () => {
    setShowAddForm(false);
    setText('');
    setSelectedEmoji(null);
    setSelectedLocation(null);
    setSelectedPhotos([]);
  };

  return (
    <Sheet open={open} onOpenChange={(isOpen) => {
      if (!isOpen) resetAndClose();
      onOpenChange(isOpen);
    }}>
      <SheetContent 
        side="bottom" 
        className="bottom-sheet h-[70vh] overflow-hidden flex flex-col"
      >
        <SheetHeader className="px-1 pb-4 border-b border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <SheetTitle className="text-xl font-semibold">
                {formatDate(date, 'EEEE, MMMM d')}
              </SheetTitle>
              {onAddMoment && !showAddForm && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowAddForm(true)}
                  className="rounded-full h-8 px-3"
                >
                  Edit
                </Button>
              )}
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto py-4 space-y-4">
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileChange}
            className="hidden"
          />

          {/* Add form */}
          {showAddForm && onAddMoment && (
            <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden animate-fade-in">
              {/* Photo previews */}
              {selectedPhotos.length > 0 && (
                <div className="flex gap-2 p-3 border-b border-border/50 overflow-x-auto">
                  {selectedPhotos.map((photo, i) => (
                    <div key={i} className="relative flex-shrink-0">
                      <StorageImage src={photo} alt="" className="w-14 h-14 object-cover rounded-lg" />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removePhoto(i)}
                        className="absolute -top-1 -right-1 h-5 w-5 bg-foreground text-background hover:bg-foreground/90 hover:text-background rounded-full [&_svg]:size-3"
                      >
                        <X size={12} />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {/* Selected location badge */}
              {selectedLocation && (
                <div className="flex flex-wrap gap-2 px-4 pt-3">
                  <div className="flex items-center gap-1.5 px-2.5 py-1 bg-primary/10 rounded-full text-sm animate-fade-in">
                    <MapPin size={12} className="text-primary" />
                    <span className="truncate max-w-[150px]">{selectedLocation.name}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setSelectedLocation(null)}
                      className="h-auto w-auto p-0 text-muted-foreground hover:bg-transparent hover:text-foreground [&_svg]:size-3"
                    >
                      <X size={12} />
                    </Button>
                  </div>
                </div>
              )}

              {/* Main input */}
              <div className="flex items-center gap-3 px-4 py-3">
                <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className={cn(
                        'h-9 w-9 rounded-full flex-shrink-0',
                        selectedEmoji
                          ? 'bg-primary/10 hover:bg-primary/15'
                          : 'bg-secondary/50 hover:bg-secondary'
                      )}
                    >
                      {selectedEmoji ? (
                        <span className="text-base">{selectedEmoji}</span>
                      ) : (
                        <Smile size={18} className="text-muted-foreground" />
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-2 bg-popover z-50" align="start">
                    <EmojiGrid
                      emojis={emojis}
                      value={selectedEmoji}
                      onChange={setSelectedEmoji}
                      onPick={() => setEmojiOpen(false)}
                    />
                  </PopoverContent>
                </Popover>
                <input
                  type="text"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    const native = e.nativeEvent as KeyboardEvent;
                    const isComposing = isImeComposing(native);
                    if (e.key === 'Enter' && !isComposing) handleSend();
                  }}
                  onPaste={(e) => {
                    const items = e.clipboardData?.items;
                    if (!items) return;
                    for (const item of Array.from(items)) {
                      if (item.type.startsWith('image/')) {
                        e.preventDefault();
                        const file = item.getAsFile();
                        if (!file) continue;
                        if (!validatePhotoFile(file)) continue;
                        if (!canAddMorePhotos(selectedPhotos.length, 1)) return;
                        const reader = new FileReader();
                        reader.onload = (ev) => {
                          const dataUrl = ev.target?.result as string;
                          if (dataUrl) setSelectedPhotos(prev => [...prev, dataUrl]);
                        };
                        reader.readAsDataURL(file);
                      }
                    }
                  }}
                  placeholder="What did you do?"
                  className="flex-1 bg-transparent focus:outline-none text-foreground placeholder:text-muted-foreground text-sm"
                />
              </div>

              <div className="flex items-center justify-between px-3 py-2 border-t border-border/50">
                <div className="flex items-center gap-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={handlePhotoClick}
                    className="h-auto w-auto p-2 rounded-full hover:bg-secondary text-muted-foreground hover:text-foreground"
                  >
                    <Image size={16} />
                  </Button>

                  <Popover open={locationOpen} onOpenChange={setLocationOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className={cn(
                          "h-auto w-auto p-2 rounded-full",
                          selectedLocation ? "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary" : "hover:bg-secondary text-muted-foreground hover:text-foreground"
                        )}
                      >
                        <MapPin size={16} />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-72 p-3 bg-popover z-50" align="start">
                      <LocationPopover 
                        onSelect={setSelectedLocation} 
                        onClose={() => setLocationOpen(false)} 
                      />
                    </PopoverContent>
                  </Popover>

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={resetAndClose}
                    className="h-auto w-auto p-2 rounded-full hover:bg-secondary text-muted-foreground hover:text-foreground ml-1"
                  >
                    <X size={16} />
                  </Button>
                </div>

                <Button
                  onClick={handleSend}
                  disabled={!canSend}
                  size="sm"
                  className="h-8 px-3 rounded-full"
                >
                  <span className="mr-1">Add</span>
                  <Send size={12} />
                </Button>
              </div>
            </div>
          )}

          {isEmpty && !showAddForm ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-12">
              <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mb-4">
                <Clock size={28} className="text-muted-foreground" />
              </div>
              <p className="text-muted-foreground text-lg font-medium">
                Nothing recorded yet
              </p>
              <p className="text-muted-foreground text-sm mt-1">
                This day is still blank
              </p>
              {onAddMoment && (
                <Button
                  onClick={() => setShowAddForm(true)}
                  className="mt-4 rounded-full"
                >
                  <Plus size={16} className="mr-1" />
                  Add moment
                </Button>
              )}
            </div>
          ) : (
            sorted.map((moment, index) => (
              <article 
                key={moment.id} 
                className="moment-card animate-slide-up"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <div className="flex items-start gap-3">
                  {moment.emoji && (
                    <div className="w-10 h-10 rounded-full bg-secondary/50 flex items-center justify-center flex-shrink-0">
                      <span className="text-lg">{moment.emoji}</span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-muted-foreground font-medium">
                        #{index + 1}
                      </span>
                      <div className="text-xs text-muted-foreground">
                        {format(new Date(moment.createdAt), 'h:mm a')}
                      </div>
                    </div>
                    {moment.location && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5">
                        <MapPin size={12} />
                        <span className="truncate">{moment.location.name}</span>
                      </div>
                    )}
                    
                    {moment.text && (
                      <p className="text-foreground text-sm leading-relaxed">
                        <span>{moment.text}</span>
                        {shouldShowSampleTag(moment) && (
                          <span className="ml-1 text-xs text-muted-foreground font-sans">(sample)</span>
                        )}
                      </p>
                    )}

                    {moment.photos.length > 0 && (
                      <div className="mt-2 grid grid-cols-3 gap-1.5">
                        {moment.photos.map((photo, i) => (
                          <div 
                            key={i}
                            className="aspect-square rounded-lg bg-secondary overflow-hidden"
                          >
                            <img 
                              src={photo} 
                              alt="" 
                              className="w-full h-full object-cover"
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </article>
            ))
          )}

          {/* Imported calendar events */}
          {importedEvents && importedEvents.length > 0 && (
            <div className="space-y-2 mt-2">
              <h3 className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <CalendarDays size={12} />
                Calendar events
              </h3>
              {importedEvents.map(ev => (
                <div key={ev.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-accent/30 border border-border/50">
                  <CalendarDays size={14} className="text-primary flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{ev.title}</p>
                    <p className="text-xs text-muted-foreground font-mono">
                      {format(parseISO(ev.start_time), 'HH:mm')}
                      {ev.end_time && ` – ${format(parseISO(ev.end_time), 'HH:mm')}`}
                    </p>
                    {ev.location && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <MapPin size={10} />{ev.location}
                      </p>
                    )}
                    {ev.description && (
                      <p className="text-xs text-muted-foreground/70 mt-0.5 line-clamp-2">{ev.description}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
