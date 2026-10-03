import { KeyboardEvent, useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronUp, Link2, Plus, X } from 'lucide-react';
import { useStickyNotes, StickyCategory, StickyNote } from '@/hooks/useStickyNotes';
import { useLanguage } from '@/hooks/useLanguage';
import { cn, isEnterSubmit } from '@/lib/utils';
import { normalizeUrl, extractFirstUrl, getDomain as getSiteFallback } from '@/lib/linkUtils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { MomentLinkPreview } from '@/types';
import { validatePhotoFile } from '@/lib/photoValidation';
import { useProfile } from '@/hooks/useProfile';
import { showUndoToast } from '@/lib/undoToast';
import { SheetHeader, SheetEmptyState } from '@/components/sheet/SheetShell';

// Card palettes now reference tokens.css (--surface-<hue>-*), so each hue
// gets a real light + dark variant instead of the previous light-only hex.
// The hue itself still gives users a visual filing system (peach vs sage vs
// cream…), but saturation stays warm-editorial and light/dark parity is
// automatic — no more cream cards floating on pure-black canvas.
const COLOR_PALETTES = [
  {
    bg: 'bg-[hsl(var(--surface-peach-shell-sticky))] dark:bg-[hsl(var(--surface-peach-shell-dark))]',
    border: 'border-[hsl(var(--surface-peach-border))] dark:border-[hsl(var(--surface-peach-accent-dark)/0.22)]',
    header: 'bg-[hsl(var(--surface-peach-header))] dark:bg-[hsl(var(--surface-peach-accent-dark)/0.18)]',
    text: 'text-[hsl(var(--surface-peach-accent))] dark:text-[hsl(var(--surface-peach-accent-dark))]',
  },
  {
    bg: 'bg-[hsl(var(--surface-sage-shell-sticky))] dark:bg-[hsl(var(--surface-sage-shell-dark))]',
    border: 'border-[hsl(var(--surface-sage-border))] dark:border-[hsl(var(--surface-sage-accent-dark)/0.22)]',
    header: 'bg-[hsl(var(--surface-sage-header))] dark:bg-[hsl(var(--surface-sage-accent-dark)/0.18)]',
    text: 'text-[hsl(var(--surface-sage-accent))] dark:text-[hsl(var(--surface-sage-accent-dark))]',
  },
  {
    bg: 'bg-[hsl(var(--surface-cream-shell-sticky))] dark:bg-[hsl(var(--surface-cream-shell-dark))]',
    border: 'border-[hsl(var(--surface-cream-border))] dark:border-[hsl(var(--surface-cream-accent-dark)/0.22)]',
    header: 'bg-[hsl(var(--surface-cream-header))] dark:bg-[hsl(var(--surface-cream-accent-dark)/0.18)]',
    text: 'text-[hsl(var(--surface-cream-accent))] dark:text-[hsl(var(--surface-cream-accent-dark))]',
  },
  {
    bg: 'bg-[hsl(var(--surface-rose-shell-sticky))] dark:bg-[hsl(var(--surface-rose-shell-dark))]',
    border: 'border-[hsl(var(--surface-rose-border))] dark:border-[hsl(var(--surface-rose-accent-dark)/0.22)]',
    header: 'bg-[hsl(var(--surface-rose-header))] dark:bg-[hsl(var(--surface-rose-accent-dark)/0.18)]',
    text: 'text-[hsl(var(--surface-rose-accent))] dark:text-[hsl(var(--surface-rose-accent-dark))]',
  },
  {
    bg: 'bg-[hsl(var(--surface-lavender-shell-sticky))] dark:bg-[hsl(var(--surface-lavender-shell-dark))]',
    border: 'border-[hsl(var(--surface-lavender-border))] dark:border-[hsl(var(--surface-lavender-accent-dark)/0.22)]',
    header: 'bg-[hsl(var(--surface-lavender-header))] dark:bg-[hsl(var(--surface-lavender-accent-dark)/0.18)]',
    text: 'text-[hsl(var(--surface-lavender-accent))] dark:text-[hsl(var(--surface-lavender-accent-dark))]',
  },
  {
    bg: 'bg-[hsl(var(--surface-dusty-blue-shell))] dark:bg-[hsl(var(--surface-dusty-blue-shell-dark))]',
    border: 'border-[hsl(var(--surface-dusty-blue-border))] dark:border-[hsl(var(--surface-dusty-blue-accent-dark)/0.22)]',
    header: 'bg-[hsl(var(--surface-dusty-blue-header))] dark:bg-[hsl(var(--surface-dusty-blue-accent-dark)/0.18)]',
    text: 'text-[hsl(var(--surface-dusty-blue-accent))] dark:text-[hsl(var(--surface-dusty-blue-accent-dark))]',
  },
];

type Tab = { id: string; name: string; colorIndex: number };

type StyleConfig = {
  bg: string; border: string; header: string; text: string;
  label: string; sublabel: string; notePlaceholder: string; addItem: string; confirmDelete: string;
};

const STICKY_TYPE = {
  noteTitle: 'text-sm font-semibold',
  itemBody: 'text-[13px] leading-snug',
  meta: 'text-xs',
  tabLabel: 'text-xs font-medium',
  tabCount: 'text-xs font-semibold',
  composer: 'text-sm font-medium',
} as const;

const DEFAULT_TABS: Tab[] = [
  { id: 'free-time', name: "When I'm Free", colorIndex: 0 },
  { id: 'reminder', name: 'Reminders', colorIndex: 1 },
];

const TABS_KEY = 'sticky-tabs-v1';

function loadTabs(): Tab[] {
  try {
    const raw = localStorage.getItem(TABS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed as Tab[];
    }
  } catch {
    return DEFAULT_TABS;
  }
  return DEFAULT_TABS;
}

function saveTabs(tabs: Tab[]) {
  localStorage.setItem(TABS_KEY, JSON.stringify(tabs));
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function getPastedImages(clipboardItems: DataTransferItemList): Promise<string[]> {
  const imageFiles = Array.from(clipboardItems)
    .filter(item => item.type.startsWith('image/'))
    .map(item => item.getAsFile())
    .filter((file): file is File => Boolean(file))
    .filter(file => validatePhotoFile(file));

  if (imageFiles.length === 0) return [];
  return Promise.all(imageFiles.map(fileToDataUrl));
}

function NoteCard({
  note,
  config,
  onAddItem,
  onRenameItem,
  onAttachItemLink,
  onRemoveItemLink,
  onAttachItemImage,
  onRemoveItemImage,
  onToggleItem,
  onDeleteItem,
  onDelete,
  onRename,
  onHandleDragStart,
}: {
  note: StickyNote;
  config: StyleConfig;
  onAddItem: (text: string, options?: { images?: string[]; links?: MomentLinkPreview[] }) => void;
  onRenameItem: (itemId: string, text: string) => void;
  onAttachItemLink: (itemId: string, link: MomentLinkPreview) => void;
  onRemoveItemLink: (itemId: string, linkUrl: string) => void;
  onAttachItemImage: (itemId: string, image: string) => void;
  onRemoveItemImage: (itemId: string, image: string) => void;
  onToggleItem: (itemId: string) => void;
  onDeleteItem: (itemId: string) => void;
  onDelete: () => void;
  onRename: (title: string) => void;
  onHandleDragStart: (e: React.DragEvent<HTMLDivElement>) => void;
}) {
  const [draft, setDraft] = useState('');
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(note.title);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [itemDraft, setItemDraft] = useState('');
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [linkDrafts, setLinkDrafts] = useState<Record<string, string>>({});
  const [addingLinkForId, setAddingLinkForId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current/35 focus-visible:ring-offset-1 focus-visible:ring-offset-transparent';
  const focusField = 'focus-visible:outline-none focus-visible:border-current/60';

  const buildLinkPreview = async (rawValue: string): Promise<MomentLinkPreview | null> => {
    const url = normalizeUrl(rawValue);
    if (!url) return null;
    const siteFallback = getSiteFallback(url);
    try {
      const { data, error } = await supabase.functions.invoke('link-preview', { body: { url } });
      if (!error && data) {
        return {
          url,
          title: typeof data.title === 'string' ? data.title : siteFallback,
          description: typeof data.description === 'string' ? data.description : undefined,
          image: typeof data.image === 'string' ? data.image : undefined,
          siteName: typeof data.siteName === 'string' ? data.siteName : siteFallback,
        };
      }
    } catch (err) {
      console.error('Sticky note link preview failed:', err);
    }
    return { url, title: siteFallback, siteName: siteFallback };
  };

  const addLinkAsItem = async (rawValue: string, fallbackText?: string) => {
    const preview = await buildLinkPreview(rawValue);
    if (!preview) return false;
    const label = fallbackText?.trim() || preview.title || preview.siteName || getSiteFallback(preview.url);
    onAddItem(label, { links: [preview] });
    setDraft('');
    inputRef.current?.focus();
    return true;
  };

  const submitItem = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    const pastedUrl = extractFirstUrl(trimmed);
    if (pastedUrl && pastedUrl === trimmed) {
      void addLinkAsItem(pastedUrl);
      return;
    }
    onAddItem(trimmed);
    setDraft('');
    inputRef.current?.focus();
  };

  const handleAddItemPaste = async (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pastedUrl = extractFirstUrl(e.clipboardData.getData('text'));
    if (pastedUrl) {
      e.preventDefault();
      const currentText = draft.trim();
      void addLinkAsItem(pastedUrl, currentText);
      return;
    }

    const images = await getPastedImages(e.clipboardData.items);
    if (images.length === 0) return;
    e.preventDefault();
    try {
      onAddItem(draft.trim() || 'Image', { images });
      setDraft('');
      toast.success(images.length > 1 ? `${images.length} images pasted` : 'Image pasted');
    } catch (err) {
      console.error('Failed to paste image into sticky note item:', err);
      toast.error('Could not paste image');
    }
  };

  const handleExpandedInputPaste = async (e: React.ClipboardEvent<HTMLInputElement>, itemId: string) => {
    const pastedUrl = extractFirstUrl(e.clipboardData.getData('text'));
    if (pastedUrl) {
      e.preventDefault();
      setLinkDrafts(prev => ({ ...prev, [itemId]: pastedUrl }));
      await submitItemLink(itemId, pastedUrl);
      return;
    }

    const images = await getPastedImages(e.clipboardData.items);
    if (images.length === 0) return;
    e.preventDefault();
    images.forEach(image => onAttachItemImage(itemId, image));
    setExpandedItemId(itemId);
    toast.success(images.length > 1 ? `${images.length} images pasted` : 'Image pasted');
  };

  const submitTitle = () => {
    if (titleDraft.trim()) onRename(titleDraft.trim());
    else setTitleDraft(note.title);
    setEditingTitle(false);
  };

  const submitItemEdit = (itemId: string, originalText: string) => {
    const trimmed = itemDraft.trim();
    if (trimmed && trimmed !== originalText) {
      onRenameItem(itemId, trimmed);
    } else {
      setItemDraft(originalText);
    }
    setEditingItemId(null);
  };

  const submitItemLink = async (itemId: string, rawValue?: string) => {
    const raw = rawValue ?? linkDrafts[itemId] ?? '';
    const url = normalizeUrl(raw);
    if (!url) {
      toast.error('Invalid link');
      return;
    }

    const targetItem = note.items.find(it => it.id === itemId);
    if (targetItem?.links?.some(link => link.url === url)) {
      setLinkDrafts(prev => ({ ...prev, [itemId]: '' }));
      toast.info('This link is already added');
      return;
    }

    setAddingLinkForId(itemId);
    try {
      const preview = await buildLinkPreview(url);
      if (!preview) throw new Error('Invalid link');

      onAttachItemLink(itemId, preview);
      setExpandedItemId(itemId);
      setLinkDrafts(prev => ({ ...prev, [itemId]: '' }));
    } catch (err) {
      console.error('Sticky note link preview failed:', err);
      toast.warning('Preview unavailable, but the link can still be saved');
      onAttachItemLink(itemId, {
        url,
        title: getSiteFallback(url),
        siteName: getSiteFallback(url),
      });
      setExpandedItemId(itemId);
      setLinkDrafts(prev => ({ ...prev, [itemId]: '' }));
    } finally {
      setAddingLinkForId(null);
    }
  };

  const activeItems = note.items.filter(it => !it.done);
  const doneItems = note.items.filter(it => it.done);

  return (
    <div
      className={cn(
        'group/card relative flex flex-col gap-2 rounded-lg shadow-sm p-3 transition-shadow duration-200 hover:shadow-md focus-within:ring-2 focus-within:ring-current/15',
        config.bg, config.border, 'border',
      )}
    >
      {/* Drag handle — a slim strip along the top edge, replaces the
          skeuomorphic tape. Reads as a UI affordance, not a physical prop. */}
      <div
        draggable
        onDragStart={onHandleDragStart}
        className={cn(
          'absolute inset-x-3 top-0 h-1 rounded-full opacity-0 group-hover/card:opacity-60 hover:!opacity-100 cursor-grab active:cursor-grabbing transition-opacity',
          config.header,
        )}
        title="Drag to reorder"
        aria-label="Drag to reorder"
      />

      {/* Title */}
      <div className="flex items-start gap-1 pt-1">
        {editingTitle ? (
          <input
            autoFocus
            value={titleDraft}
            onChange={e => setTitleDraft(e.target.value)}
            onBlur={submitTitle}
            onKeyDown={e => {
              if (isEnterSubmit(e)) submitTitle();
              if (e.key === 'Escape') { setTitleDraft(note.title); setEditingTitle(false); }
            }}
            className={cn('flex-1 bg-transparent border-b border-current/30', STICKY_TYPE.noteTitle, focusField, config.text)}
          />
        ) : (
          <button
            onClick={() => { setEditingTitle(true); setTitleDraft(note.title); }}
            className={cn('flex-1 rounded-sm px-0.5 text-left leading-snug', STICKY_TYPE.noteTitle, focusRing, config.text)}
          >
            {note.title}
          </button>
        )}
        <button
          onClick={() => onDelete()}
          aria-label="Delete note"
          className={cn(
            'flex-shrink-0 -mr-1 -mt-1 p-2 rounded-full transition-colors',
            focusRing,
            'text-current/40 hover:text-current hover:bg-current/10',
            config.text,
          )}
        >
          <X size={14} />
        </button>
      </div>

      {/* Divider */}
      <div className="h-px bg-current/20" />

      {/* Active items */}
      <div className="flex flex-col gap-1">
        {activeItems.map(item => {
          const hasLinks = (item.links?.length || 0) > 0;
          const hasImages = (item.images?.length || 0) > 0;
          const hasAttachments = hasLinks || hasImages;
          const primaryLink = item.links?.[0];
          const isGenericLinkTitle = /^(link|links|url|链接)$/i.test(item.text.trim());
          const itemDisplayText = hasLinks && isGenericLinkTitle
            ? (primaryLink?.title || primaryLink?.siteName || item.text)
            : item.text;
          return (
            <div key={item.id} className="group/item">
              <div className="flex items-start gap-2">
                <button
                  onClick={() => onToggleItem(item.id)}
                  aria-label="Toggle item"
                  className={cn('mt-[2px] flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors hover:bg-current/10', focusRing, config.text, 'border-current/60')}
                />
                {editingItemId === item.id ? (
                  <input
                    autoFocus
                    value={itemDraft}
                    onChange={e => setItemDraft(e.target.value)}
                    onBlur={() => submitItemEdit(item.id, item.text)}
                    onKeyDown={e => {
                      if (isEnterSubmit(e)) submitItemEdit(item.id, item.text);
                      if (e.key === 'Escape') { setItemDraft(item.text); setEditingItemId(null); }
                    }}
                    className={cn('flex-1 bg-transparent border-b border-current/20', STICKY_TYPE.itemBody, focusField, config.text)}
                  />
                ) : (
                  <button
                    onClick={() => { setEditingItemId(item.id); setItemDraft(item.text); }}
                    className={cn('flex-1 rounded-sm px-0.5 text-left', STICKY_TYPE.itemBody, focusRing, config.text)}
                  >
                    {itemDisplayText}
                  </button>
                )}
                {/* Expand toggle: always visible if has attachments, hover-only otherwise.
                    sm: prefix keeps hover-only fade on pointer devices; on touch it stays
                    at opacity-40 so the affordance is discoverable without hover. */}
                <button
                  onClick={() => setExpandedItemId(prev => prev === item.id ? null : item.id)}
                  aria-label="Links & images"
                  className={cn(
                    'flex-shrink-0 p-2 -m-2 rounded transition-[opacity,color] relative',
                    focusRing,
                    config.text,
                    hasAttachments
                      ? 'text-current/70 hover:text-current'
                      : 'text-current/45 sm:opacity-0 sm:group-hover/item:opacity-100 sm:group-focus-within/item:opacity-100 hover:!text-current/80'
                  )}
                  title="Links & images"
                >
                  {expandedItemId === item.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  {hasAttachments && expandedItemId !== item.id && (
                    <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-current/80" />
                  )}
                </button>
                <button
                  onClick={() => onDeleteItem(item.id)}
                  aria-label="Delete item"
                  className={cn(
                    'flex-shrink-0 p-2 -m-2 rounded transition-[opacity,color]',
                    focusRing,
                    'text-current/45 sm:opacity-0 sm:group-hover/item:opacity-100 sm:group-focus-within/item:opacity-100 hover:!text-destructive',
                    config.text,
                  )}
                >
                  <X size={14} />
                </button>
              </div>
              {expandedItemId === item.id && (
                <div className="ml-[26px] mt-1.5 space-y-1.5">
                  {hasAttachments && (
                    <div className="grid min-w-0 gap-1.5">
                      {(item.links || []).map(link => {
                        let domain = '';
                        try { domain = new URL(link.url).hostname.replace(/^www\./, ''); } catch { domain = ''; }
                        return (
                          <div key={link.url} className={cn('group/link flex min-w-0 max-w-full items-center gap-2 rounded-[11px] bg-current/[0.06] px-2 py-1.5 transition-colors hover:bg-current/[0.1]', config.text)}>
                            <img
                              src={`https://www.google.com/s2/favicons?domain=${domain}&sz=24`}
                              alt=""
                              loading="lazy"
                              onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }}
                              className="h-4 w-4 flex-shrink-0 rounded-[5px] bg-white/55 object-cover"
                            />
                            <a href={link.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 text-current/90 hover:text-current">
                              <span className={cn('block truncate font-medium leading-tight', STICKY_TYPE.meta)}>
                                {link.title || domain}
                              </span>
                              <span className={cn('mt-0.5 block truncate leading-tight text-current/55', STICKY_TYPE.meta)}>
                                {domain}
                              </span>
                            </a>
                            <button
                              onClick={() => onRemoveItemLink(item.id, link.url)}
                              aria-label="Remove link"
                              className={cn('flex-shrink-0 p-1.5 -m-1.5 rounded text-current/45 transition-colors hover:text-current', focusRing)}
                            >
                              <X size={12} />
                            </button>
                          </div>
                        );
                      })}
                      {(item.images || []).map((image, index) => (
                        <div key={`${item.id}-image-${index}`} className="group relative w-full overflow-hidden rounded-xl border border-black/10 dark:border-white/10">
                          <button
                            onClick={() => onRemoveItemImage(item.id, image)}
                            aria-label="Remove image"
                            className="absolute right-1.5 top-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/65"
                          >
                            <X size={12} />
                          </button>
                          <img src={image} alt="" loading="lazy" className="h-[100px] w-full object-cover" />
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex min-w-0 items-center gap-1.5 rounded-[10px] bg-current/[0.04] px-2 py-1.5">
                    <Link2 size={12} className={cn('flex-shrink-0 text-current/55', config.text)} />
                    <input
                      value={linkDrafts[item.id] || ''}
                      onChange={e => setLinkDrafts(prev => ({ ...prev, [item.id]: e.target.value }))}
                      onPaste={e => { void handleExpandedInputPaste(e, item.id); }}
                      onKeyDown={e => {
                        if (isEnterSubmit(e)) { e.preventDefault(); void submitItemLink(item.id); }
                      }}
                      placeholder={(item.links?.length || 0) > 0 ? 'Paste another link...' : 'Paste a link...'}
                      className={cn('min-w-0 flex-1 bg-transparent placeholder:text-current/40', STICKY_TYPE.meta, focusField, config.text)}
                    />
                    <button
                      onClick={() => void submitItemLink(item.id)}
                      disabled={addingLinkForId === item.id || !(linkDrafts[item.id] || '').trim()}
                      aria-label="Add link"
                      className={cn('p-1.5 -m-1.5 rounded text-current/55 disabled:text-current/25 hover:text-current/90 transition-colors', focusRing, config.text)}
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Done items */}
        {doneItems.map(item => (
          <div key={item.id} className="group/item">
            <div className="flex items-start gap-2">
              <button
                onClick={() => onToggleItem(item.id)}
                aria-label="Toggle item"
                className={cn('mt-[2px] flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border', focusRing, config.text, 'border-current/50 bg-current/10')}
              >
                <Check size={10} className={cn('text-current/75', config.text)} />
              </button>
              <button
                onClick={() => { setEditingItemId(item.id); setItemDraft(item.text); }}
                className={cn('flex-1 rounded-sm px-0.5 text-left line-through text-current/55 hover:text-current/70', STICKY_TYPE.itemBody, focusRing, config.text)}
              >
                {item.text}
              </button>
              <button
                onClick={() => onDeleteItem(item.id)}
                aria-label="Delete item"
                className={cn('flex-shrink-0 p-2 -m-2 rounded text-current/45 sm:opacity-0 sm:group-hover/item:opacity-100 sm:group-focus-within/item:opacity-100 transition-[opacity,color] hover:text-destructive', focusRing, config.text)}
              >
                <X size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Add item input */}
      <div className="flex items-center gap-1.5 mt-1">
        <input
          ref={inputRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => { if (isEnterSubmit(e)) submitItem(); }}
          onPaste={(e) => { void handleAddItemPaste(e); }}
          placeholder={config.addItem}
          className={cn('flex-1 bg-transparent placeholder:text-current/45', STICKY_TYPE.meta, focusField, config.text)}
        />
        <button
          onClick={submitItem}
          disabled={!draft.trim()}
          aria-label="Add item"
          className={cn('h-8 w-8 rounded-full flex items-center justify-center transition-all disabled:opacity-25', focusRing, config.header, config.text)}
        >
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
}

function loadStickyCategoryOrder(): string[] {
  try {
    const raw = localStorage.getItem('sticky-note-category-order');
    const parsed = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed) && parsed.length > 0) return parsed as string[];
  } catch {
    return [];
  }
  return [];
}

export function StickyNotesView() {
  const { notes, addNote, deleteNote, restoreNote, renameNote, reorderNote, addItem, renameItem, attachItemLink, removeItemLink, attachItemImage, removeItemImage, toggleItem, deleteItem } = useStickyNotes();
  const { t, lang } = useLanguage();

  const handleDeleteNote = (id: string) => {
    const index = notes.findIndex(n => n.id === id);
    const snapshot = notes[index];
    deleteNote(id);
    if (!snapshot) return;
    const label = snapshot.title?.trim() || (lang === 'zh' ? '这张便签' : 'this note');
    showUndoToast({
      description: lang === 'zh' ? `已删除“${label}”` : `Deleted “${label}”`,
      undoLabel: lang === 'zh' ? '撤销' : 'Undo',
      onUndo: () => { restoreNote(snapshot, index); },
    });
  };

  const [tabs, setTabs] = useState<Tab[]>(() => loadTabs());
  const [activeTabId, setActiveTabId] = useState<string>(() => loadTabs()[0]?.id || 'free-time');
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [tabDraft, setTabDraft] = useState('');
  const [newNoteTitle, setNewNoteTitle] = useState('');
  const [draggedNoteId, setDraggedNoteId] = useState<string | null>(null);
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null);
  const shellFocusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--surface-soft))]';

  // Migrate from old category order if needed
  useEffect(() => {
    const legacyOrder = loadStickyCategoryOrder();
    if (legacyOrder.length > 0 && localStorage.getItem(TABS_KEY) === null) {
      const migrated: Tab[] = legacyOrder.map((id, i) => {
        const existing = DEFAULT_TABS.find(t => t.id === id);
        return existing || { id, name: id, colorIndex: i % COLOR_PALETTES.length };
      });
      setTabs(migrated);
      setActiveTabId(migrated[0]?.id || 'free-time');
      saveTabs(migrated);
    }
  }, []);

  useEffect(() => { saveTabs(tabs); }, [tabs]);

  // Ensure activeTabId is valid
  useEffect(() => {
    if (!tabs.find(t => t.id === activeTabId) && tabs.length > 0) {
      setActiveTabId(tabs[0].id);
    }
  }, [tabs, activeTabId]);

  const activeTab = tabs.find(t => t.id === activeTabId) ?? tabs[0];
  const palette = activeTab ? COLOR_PALETTES[activeTab.colorIndex % COLOR_PALETTES.length] : COLOR_PALETTES[0];

  const config: StyleConfig = {
    ...palette,
    label: activeTab?.name ?? '',
    sublabel: '',
    notePlaceholder: `New note in ${activeTab?.name ?? 'this tab'}…`,
    addItem: t('notes.addItem'),
    confirmDelete: t('notes.confirmDelete'),
  };

  const filtered = notes.filter(n => n.category === (activeTab?.id ?? ''));

  const handleAddNote = () => {
    if (!newNoteTitle.trim() || !activeTab) return;
    addNote(newNoteTitle.trim(), activeTab.id);
    setNewNoteTitle('');
  };

  const handleAddTab = () => {
    const newTab: Tab = {
      id: crypto.randomUUID(),
      name: 'New Tab',
      colorIndex: tabs.length % COLOR_PALETTES.length,
    };
    const next = [...tabs, newTab];
    setTabs(next);
    setActiveTabId(newTab.id);
    setEditingTabId(newTab.id);
    setTabDraft('New Tab');
  };

  const handleRenameTab = (id: string) => {
    if (!tabDraft.trim()) return;
    setTabs(prev => prev.map(t => t.id === id ? { ...t, name: tabDraft.trim() } : t));
    setEditingTabId(null);
  };

  const handleDeleteTab = (id: string) => {
    const next = tabs.filter(t => t.id !== id);
    setTabs(next);
    if (activeTabId === id) setActiveTabId(next[0]?.id ?? '');
  };

  const handleCycleColor = (id: string) => {
    setTabs(prev => prev.map(t => t.id === id ? { ...t, colorIndex: (t.colorIndex + 1) % COLOR_PALETTES.length } : t));
  };

  return (
    <div className="flex h-full flex-col bg-[hsl(var(--surface-soft))]">
      <SheetHeader
        title={t('notes.header')}
        subtitle={lang === 'zh' ? '小清单、图片和需要记住的事。' : 'Small lists, images, and things to remember.'}
        secondaryRow={
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/55 bg-card/60 px-2 py-1.5 dark:border-border/60 dark:bg-card/45">
            {tabs.map(tab => {
              const pal = COLOR_PALETTES[tab.colorIndex % COLOR_PALETTES.length];
              const count = notes.filter(n => n.category === tab.id).reduce((s, n) => s + n.items.filter(it => !it.done).length, 0);
              const isActive = activeTabId === tab.id;
              return (
                <div
                  key={tab.id}
                  draggable
                  onDragStart={() => setDraggedTabId(tab.id)}
                  onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                  onDrop={e => {
                    e.preventDefault();
                    if (!draggedTabId || draggedTabId === tab.id) return;
                    setTabs(prev => {
                      const from = prev.findIndex(t => t.id === draggedTabId);
                      const to = prev.findIndex(t => t.id === tab.id);
                      if (from < 0 || to < 0) return prev;
                      const next = [...prev];
                      const [moved] = next.splice(from, 1);
                      next.splice(to, 0, moved);
                      return next;
                    });
                    setDraggedTabId(null);
                  }}
                  onDragEnd={() => setDraggedTabId(null)}
                  className={cn(
                    'group/tab flex min-h-9 items-center gap-1.5 rounded-full border transition-all cursor-grab active:cursor-grabbing px-2.5 py-1',
                    isActive
                      ? cn(pal.bg, pal.border, pal.text, 'shadow-sm ring-1 ring-current/15')
                      : 'text-muted-foreground border-border/70 bg-background/70 hover:text-foreground hover:border-border',
                    draggedTabId === tab.id && 'opacity-50'
                  )}
                >
                  {/* Color dot — click to cycle color */}
                  <button
                    onClick={() => handleCycleColor(tab.id)}
                    className={cn('flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full hover:bg-current/10 transition-colors', shellFocusRing, pal.text)}
                    title={lang === 'zh' ? '点击切换颜色' : 'Click to change color'}
                    aria-label={lang === 'zh' ? '切换颜色' : 'Change color'}
                  >
                    <span className={cn('h-2.5 w-2.5 rounded-full', pal.header)} />
                  </button>
                  {/* Tab name — click to activate, double-click to rename */}
                  {editingTabId === tab.id ? (
                    <input
                      autoFocus
                      value={tabDraft}
                      onChange={e => setTabDraft(e.target.value)}
                      onBlur={() => handleRenameTab(tab.id)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleRenameTab(tab.id);
                        if (e.key === 'Escape') setEditingTabId(null);
                      }}
                      className={cn('w-20 border-b border-current/30 bg-transparent focus-visible:outline-none focus-visible:border-current/60', STICKY_TYPE.tabLabel, pal.text)}
                      onClick={e => e.stopPropagation()}
                    />
                  ) : (
                    <button
                      onClick={() => setActiveTabId(tab.id)}
                      onDoubleClick={() => { setEditingTabId(tab.id); setTabDraft(tab.name); }}
                      className={cn('rounded-sm px-0.5', STICKY_TYPE.tabLabel, shellFocusRing, isActive ? pal.text : '')}
                    >
                      {tab.name}
                    </button>
                  )}
                  {count > 0 && (
                    <span
                      className={cn(
                        'min-w-[18px] rounded-full px-1.5 py-0.5 text-center tabular-nums',
                        STICKY_TYPE.tabCount,
                        isActive ? 'bg-current/12 text-current' : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {count}
                    </span>
                  )}
                  {/* Delete tab — show on hover on pointer devices, always visible on touch */}
                  {tabs.length > 1 && (
                    <button
                      onClick={e => { e.stopPropagation(); handleDeleteTab(tab.id); }}
                      className={cn('p-1.5 -m-1.5 rounded transition-[opacity,color] flex-shrink-0 text-current/45 sm:opacity-0 sm:group-hover/tab:opacity-100 sm:group-focus-within/tab:opacity-100 hover:text-current/80', shellFocusRing, isActive ? pal.text : 'text-muted-foreground')}
                      title={lang === 'zh' ? '删除标签' : 'Delete tab'}
                      aria-label={lang === 'zh' ? '删除标签' : 'Delete tab'}
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              );
            })}
            {/* Add tab */}
            <button
              onClick={handleAddTab}
              className={cn('flex min-h-9 items-center gap-1 rounded-full border border-dashed border-border/85 px-2.5 py-1 text-muted-foreground/70 transition-colors hover:text-foreground hover:border-border', STICKY_TYPE.tabLabel, shellFocusRing)}
              aria-label={lang === 'zh' ? '新建标签' : 'New tab'}
            >
              <Plus size={12} />
            </button>
          </div>
        }
      />

      {/* Board — extra bottom padding so last cards clear the composer */}
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-3 pb-2">
        {/* Cards — masonry columns, each card sizes to its own content */}
        {filtered.length === 0 ? (
          <SheetEmptyState
            icon={<Plus size={20} />}
            title={t('notes.empty')}
            hint={lang === 'zh' ? '在下方输入便签名,按 Enter 创建。' : 'Type a note name below and press Enter to create one.'}
          />
        ) : (
          <div className="[column-gap:1.25rem] [column-width:260px]">
            {filtered.map(note => {
              return (
                <div
                  key={note.id}
                  onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                  onDrop={e => {
                    e.preventDefault();
                    if (draggedNoteId && draggedNoteId !== note.id) reorderNote(draggedNoteId, note.id);
                    setDraggedNoteId(null);
                  }}
                  className={cn('mb-5 break-inside-avoid transition-opacity', draggedNoteId === note.id && 'opacity-60')}
                >
                  <NoteCard
                    note={note}
                    config={config}
                    onAddItem={(text, opts) => addItem(note.id, text, opts)}
                    onRenameItem={(itemId, text) => renameItem(note.id, itemId, text)}
                    onAttachItemLink={(itemId, link) => attachItemLink(note.id, itemId, link)}
                    onRemoveItemLink={(itemId, linkUrl) => removeItemLink(note.id, itemId, linkUrl)}
                    onAttachItemImage={(itemId, image) => attachItemImage(note.id, itemId, image)}
                    onRemoveItemImage={(itemId, image) => removeItemImage(note.id, itemId, image)}
                    onToggleItem={itemId => toggleItem(note.id, itemId)}
                    onDeleteItem={itemId => deleteItem(note.id, itemId)}
                    onDelete={() => handleDeleteNote(note.id)}
                    onRename={title => renameNote(note.id, title)}
                    onHandleDragStart={e => {
                      setDraggedNoteId(note.id);
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData('text/plain', note.id);
                    }}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex-shrink-0 bg-gradient-to-t from-[hsl(var(--surface-soft))] via-[hsl(var(--surface-soft)/0.96)] to-[hsl(var(--surface-soft)/0)] px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
        <div className="rounded-2xl bg-background/70 p-1 backdrop-blur-xl shadow-[0_18px_44px_hsl(var(--foreground)/0.1)]">
          <div className="flex min-h-[44px] items-center gap-2 rounded-[18px] border border-border bg-card px-3 py-2 transition-colors focus-within:border-foreground/20 focus-within:ring-2 focus-within:ring-foreground/12">
            <span className={cn('flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full', palette.header, palette.text)}>
              <Plus size={14} />
            </span>
            <input
              value={newNoteTitle}
              onChange={e => setNewNoteTitle(e.target.value)}
              onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => { if (isEnterSubmit(e)) handleAddNote(); }}
              placeholder={config.notePlaceholder}
              className={cn('min-w-0 flex-1 bg-transparent text-foreground focus-visible:outline-none placeholder:text-muted-foreground/70', STICKY_TYPE.composer)}
            />
            <button
              onClick={handleAddNote}
              disabled={!newNoteTitle.trim()}
              className={cn(
                'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full transition-all hover:brightness-95 disabled:opacity-30',
                shellFocusRing,
                palette.header,
                palette.text,
              )}
            >
              <Plus size={15} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
