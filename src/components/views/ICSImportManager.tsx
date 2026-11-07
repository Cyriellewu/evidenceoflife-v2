import { useState, useRef } from 'react';
import { Upload, Trash2, Search, X, CheckSquare, Square, FileText, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ImportedEvent, ImportBatch } from '@/hooks/useImportedEvents';
import { format, parseISO } from 'date-fns';
import { cn, isImeEnter } from '@/lib/utils';
import { parseDateFromText } from '@/lib/parseDateFromText';
import { toast } from 'sonner';
import { useLanguage } from '@/hooks/useLanguage';

interface ICSImportManagerProps {
  events: ImportedEvent[];
  batches: ImportBatch[];
  loading: boolean;
  onImport: (file: File) => Promise<boolean> | boolean;
  onDeleteBatch: (batchId: string) => void;
  onDeleteSelected: (ids: string[]) => void;
  onSearchEvents: (query: string) => ImportedEvent[];
  onClose: () => void;
  onAddManualEvent?: (input: { title: string; startISO: string; endISO: string }) => Promise<boolean>;
}

export function ICSImportManager({ events, batches, loading, onImport, onDeleteBatch, onDeleteSelected, onSearchEvents, onClose, onAddManualEvent }: ICSImportManagerProps) {
  const { lang } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [view, setView] = useState<'events' | 'batches'>('events');
  const [quickInput, setQuickInput] = useState('');

  const displayedEvents = searchQuery.trim() ? onSearchEvents(searchQuery) : events;

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === displayedEvents.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(displayedEvents.map(e => e.id)));
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const ok = await onImport(file);
      if (ok) onClose();
    }
    e.target.value = '';
  };

  const handleQuickAdd = async () => {
    const text = quickInput.trim();
    if (!text || !onAddManualEvent) return;

    const { cleanTitle, parsedDate, hasTime } = parseDateFromText(text);
    const title = cleanTitle || text;

    if (parsedDate) {
      const startISO = new Date(parsedDate).toISOString();
      const endDate = new Date(parsedDate);
      if (hasTime) {
        endDate.setHours(endDate.getHours() + 1);
      } else {
        endDate.setHours(23, 59, 0);
      }
      const endISO = endDate.toISOString();
      const ok = await onAddManualEvent({ title, startISO, endISO });
      if (ok) setQuickInput('');
    } else {
      toast.error(lang === 'zh' ? '未识别到日期，请输入日期信息（如 3/15 14:00）' : 'No date found. Please include a date (e.g. 3/15 14:00)');
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">{lang === 'zh' ? '导入日程' : 'Import Events'}</h3>
        <button onClick={onClose} aria-label="Close" className="text-muted-foreground hover:text-foreground">
          <X size={16} />
        </button>
      </div>

      {/* Quick text input */}
      {onAddManualEvent && (
        <div className="flex items-center gap-2">
          <input
            value={quickInput}
            onChange={e => setQuickInput(e.target.value)}
            onKeyDown={e => (e.key === 'Enter' && !isImeEnter(e.nativeEvent)) && handleQuickAdd()}
            placeholder={lang === 'zh' ? '输入日程，如 "开会 3/15 14:00"' : 'e.g. "Meeting Mar 15 14:00"'}
            className="flex-1 bg-secondary rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/30 placeholder:text-muted-foreground/40"
          />
          <Button
            onClick={handleQuickAdd}
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0 rounded-lg"
            disabled={!quickInput.trim()}
          >
            <Plus size={16} />
          </Button>
        </div>
      )}

      {/* Upload button */}
      <input ref={fileInputRef} type="file" accept=".ics,.ical" onChange={handleFileChange} className="hidden" />
      <Button onClick={() => fileInputRef.current?.click()} variant="outline" size="sm" className="w-full rounded-xl" disabled={loading}>
        <Upload size={14} className="mr-2" />
        {loading ? 'Importing...' : lang === 'zh' ? '上传 .ics 文件' : 'Upload .ics file'}
      </Button>

      {/* Tabs: events / batches */}
      <div className="flex gap-1">
        <button onClick={() => setView('events')} className={cn("px-3 py-1 rounded-full text-xs font-medium transition-colors", view === 'events' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>
          Events ({events.length})
        </button>
        {view === 'events' && events.length > 0 && (
          <div className="flex items-center gap-1 bg-secondary rounded-full px-2 py-0.5 ml-auto">
            <Search size={10} className="text-muted-foreground" />
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={lang === 'zh' ? '过滤...' : 'Filter...'}
              className="bg-transparent text-[11px] w-20 focus:outline-none placeholder:text-muted-foreground/40"
            />
            {searchQuery && <button onClick={() => setSearchQuery('')}><X size={10} className="text-muted-foreground" /></button>}
          </div>
        )}
        <button onClick={() => setView('batches')} className={cn("px-3 py-1 rounded-full text-xs font-medium transition-colors", view === 'batches' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>
          Files ({batches.length})
        </button>
      </div>

      {view === 'events' && events.length > 0 && (
        <>
          {/* Select all + delete */}
          <div className="flex items-center justify-between">
            <button onClick={selectAll} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
              {selectedIds.size === displayedEvents.length && displayedEvents.length > 0 ? <CheckSquare size={12} /> : <Square size={12} />}
              {selectedIds.size > 0 ? `${selectedIds.size} selected` : 'Select all'}
            </button>
            {selectedIds.size > 0 && (
              <Button variant="destructive" size="sm" className="h-7 text-xs rounded-lg" onClick={() => { onDeleteSelected(Array.from(selectedIds)); setSelectedIds(new Set()); }}>
                <Trash2 size={12} className="mr-1" />Delete selected
              </Button>
            )}
          </div>

          {/* Event list */}
          <div className="max-h-60 overflow-y-auto space-y-1">
            {displayedEvents.map(ev => (
              <div
                key={ev.id}
                className={cn("flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs cursor-pointer transition-colors", selectedIds.has(ev.id) ? 'bg-primary/10' : 'hover:bg-secondary')}
                onClick={() => toggleSelect(ev.id)}
              >
                {selectedIds.has(ev.id) ? <CheckSquare size={12} className="text-primary flex-shrink-0" /> : <Square size={12} className="text-muted-foreground/40 flex-shrink-0" />}
                <div className="flex-1 min-w-0">
                  <p className="truncate font-medium">{ev.title}</p>
                  <p className="text-[10px] text-muted-foreground font-mono">{format(parseISO(ev.start_time), 'yyyy-MM-dd HH:mm')}</p>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {view === 'batches' && batches.length > 0 && (
        <div className="space-y-1.5">
          {batches.map(b => (
            <div key={b.batch_id} className="flex items-center justify-between px-2 py-2 bg-secondary/50 rounded-lg">
              <div className="flex items-center gap-2 min-w-0">
                <FileText size={14} className="text-muted-foreground flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-medium truncate">{b.source_file}</p>
                  <p className="text-[10px] text-muted-foreground">{b.count} events</p>
                </div>
              </div>
              <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:text-destructive" onClick={() => onDeleteBatch(b.batch_id)}>
                <Trash2 size={12} />
              </Button>
            </div>
          ))}
        </div>
      )}

      {events.length === 0 && !quickInput && (
        <p className="text-xs text-muted-foreground/50 text-center py-4">
          {lang === 'zh' ? '暂无导入的日程' : 'No imported events yet'}
        </p>
      )}
    </div>
  );
}
