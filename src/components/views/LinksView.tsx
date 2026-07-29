import { useState, useRef, KeyboardEvent, useCallback } from 'react';
import { ChevronDown, ExternalLink, Link2, Loader2, Plus, X, Camera, Pencil, GripVertical, FolderPlus } from 'lucide-react';
import { useLinks, LinkGroup, LinkSection, LinkItem } from '@/hooks/useLinks';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/hooks/useLanguage';
import { toast } from 'sonner';
import { cn, isEnterSubmit } from '@/lib/utils';
import { normalizeUrl, isUrlLike as isUrl, getDomain, getFaviconUrl } from '@/lib/linkUtils';
import { showUndoToast } from '@/lib/undoToast';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { SheetHeader, SheetEmptyState } from '@/components/sheet/SheetShell';
import { SheetComposer } from '@/components/sheet/SheetComposer';
import { StorageImage } from "@/components/StorageImage";

/**
 * Each card cycles through one of these accent palettes for visual
 * differentiation. Light-mode values are warm pastel surfaces with
 * mid-tone accent text — they read correctly against the cream
 * canvas. The `dark:` halves keep the same hue identity but invert
 * the lightness contract:
 *   - shell bg becomes a dark, hue-tinted surface (~5% L of the hue)
 *   - chip / soft surfaces use the accent at low alpha as a tint
 *   - chip / soft text switches to a LIGHT version of the accent
 *     (so text contrasts against the now-dark card)
 *   - title text stays as `text-foreground` and naturally reads as
 *     near-white against the new dark card surface
 */
const ACCENT_STYLES = [
  {
    // Peach
    shell: 'border-[#EBCFBE] bg-[#FCF7F3] dark:border-[#EBCFBE]/22 dark:bg-[#3A2A22]/55',
    chip: 'border-[#E6C2AE] bg-[#F6E7DC] text-[#B66A47] dark:border-[#E6C2AE]/35 dark:bg-[#E6C2AE]/[0.10] dark:text-[#F0CCB4]',
    soft: 'bg-[#F7ECE4] text-[#B66A47] dark:bg-[#E6C2AE]/[0.10] dark:text-[#F0CCB4]',
    line: 'bg-[#E6C2AE] dark:bg-[#E6C2AE]/30',
  },
  {
    // Sage
    shell: 'border-[#CFE2D8] bg-[#F5FBF7] dark:border-[#CFE2D8]/22 dark:bg-[#1F2D26]/55',
    chip: 'border-[#BCD9CA] bg-[#E5F4EA] text-[#4E8B6A] dark:border-[#BCD9CA]/35 dark:bg-[#BCD9CA]/[0.10] dark:text-[#B8DDC6]',
    soft: 'bg-[#EAF5EF] text-[#4E8B6A] dark:bg-[#BCD9CA]/[0.10] dark:text-[#B8DDC6]',
    line: 'bg-[#BCD9CA] dark:bg-[#BCD9CA]/30',
  },
  {
    // Lavender
    shell: 'border-[#D8D5EC] bg-[#F8F7FD] dark:border-[#D8D5EC]/22 dark:bg-[#26243A]/55',
    chip: 'border-[#C9C2E9] bg-[#EEEAFB] text-[#7565B3] dark:border-[#C9C2E9]/35 dark:bg-[#C9C2E9]/[0.10] dark:text-[#CFC8EE]',
    soft: 'bg-[#F0ECFB] text-[#7565B3] dark:bg-[#C9C2E9]/[0.10] dark:text-[#CFC8EE]',
    line: 'bg-[#C9C2E9] dark:bg-[#C9C2E9]/30',
  },
  {
    // Cream
    shell: 'border-[#E6DDC6] bg-[#FFFCF4] dark:border-[#E6DDC6]/22 dark:bg-[#3A341F]/55',
    chip: 'border-[#DDD0A7] bg-[#F7F0D9] text-[#A8852F] dark:border-[#DDD0A7]/35 dark:bg-[#DDD0A7]/[0.10] dark:text-[#EAD89A]',
    soft: 'bg-[#F8F2DE] text-[#A8852F] dark:bg-[#DDD0A7]/[0.10] dark:text-[#EAD89A]',
    line: 'bg-[#DDD0A7] dark:bg-[#DDD0A7]/30',
  },
];

function getAccentStyle(index: number) {
  return ACCENT_STYLES[index % ACCENT_STYLES.length];
}

async function fetchPreview(url: string) {
  const domain = getDomain(url);
  try {
    const { data, error } = await supabase.functions.invoke('link-preview', { body: { url } });
    if (!error && data) {
      return { title: data.title || domain, description: data.description, siteName: data.siteName || domain, previewImage: data.image };
    }
  } catch {
    return { title: domain, siteName: domain };
  }
  return { title: domain, siteName: domain };
}

async function uploadPhoto(file: File, userId: string): Promise<string | null> {
  const { uploadMomentPhotoObject } = await import('@/lib/momentPhotos');
  const ext = file.type.split('/')[1] || 'jpg';
  return uploadMomentPhotoObject(userId, file, file.type || `image/${ext}`, ext);
}

type DragState = { groupId: string; sectionId: string; linkId: string } | null;
type GroupDragState = { groupId: string } | null;

function InlineEditableText({
  value, onSave, className, inputClassName, placeholder,
}: {
  value: string; onSave: (v: string) => void;
  className: string; inputClassName: string; placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const submit = () => {
    const next = draft.trim();
    if (next && next !== value) onSave(next);
    else setDraft(value);
    setEditing(false);
  };
  if (editing) {
    return (
      <input autoFocus value={draft} placeholder={placeholder}
        onChange={e => setDraft(e.target.value)}
        onBlur={submit}
        onKeyDown={e => { if (isEnterSubmit(e)) submit(); if (e.key === 'Escape') { setDraft(value); setEditing(false); } }}
        className={inputClassName}
      />
    );
  }
  return (
    <button type="button" onClick={() => { setDraft(value); setEditing(true); }} className={className}>
      {value}
    </button>
  );
}

function LinkRow({ link, onRemove, onRename, onDragStart, onDragEnd }: {
  link: LinkItem; onRemove: () => void; onRename: (t: string) => void;
  onDragStart: () => void; onDragEnd: () => void;
}) {
  const [faviconError, setFaviconError] = useState(false);
  return (
    <div
      draggable
      onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; onDragStart(); }}
      onDragEnd={onDragEnd}
      className="group/lk flex h-[26px] w-full items-center gap-1.5 rounded-[6px] px-1.5 transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.05]"
    >
      <div className="flex-shrink-0 cursor-grab text-muted-foreground/20 opacity-0 group-hover/lk:opacity-100 transition-opacity active:cursor-grabbing">
        <GripVertical size={11} />
      </div>
      {faviconError ? (
        <div className="flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded-[3px] bg-muted/60">
          <Link2 size={8} className="text-muted-foreground/50" />
        </div>
      ) : (
        <img src={getFaviconUrl(link.url, 64)} alt="" onError={() => setFaviconError(true)}
          className="h-3.5 w-3.5 flex-shrink-0 rounded-[3px] bg-white/80 object-cover dark:bg-white/35" />
      )}
      <a href={link.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate">
        <InlineEditableText
          value={link.title} onSave={onRename}
          className="block w-full truncate text-left text-[12px] font-medium text-foreground/85 hover:text-primary transition-colors"
          inputClassName="w-full bg-transparent text-[12px] font-medium text-foreground border-b border-primary/40 focus:outline-none"
        />
      </a>
      <span className="flex-shrink-0 text-[10px] text-muted-foreground/30 max-w-[56px] truncate hidden group-hover/lk:inline">
        {getDomain(link.url)}
      </span>
      <div className="flex flex-shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/lk:opacity-100">
        <a href={link.url} target="_blank" rel="noopener noreferrer"
          aria-label="Open link in new tab"
          className="rounded p-1 text-muted-foreground/40 transition-colors hover:text-foreground" onClick={e => e.stopPropagation()}>
          <ExternalLink size={10} />
        </a>
        <button onClick={onRemove} aria-label="Remove link" className="rounded p-1 text-muted-foreground/30 transition-colors hover:text-destructive/70">
          <X size={10} />
        </button>
      </div>
    </div>
  );
}

function SectionCard({
  groupIndex, groupId, section, isSoleSection,
  onRename, onDelete, onToggle, onAddLink, onRenameLink, onRemoveLink,
  onAddPhoto, onRemovePhoto, onMoveLink, draggingLink, setDraggingLink,
}: {
  groupIndex: number; groupId: string; section: LinkSection; isSoleSection?: boolean;
  onRename: (t: string) => void; onDelete: () => void; onToggle: () => void;
  onAddLink: (l: Omit<LinkItem, 'id'>) => void; onRenameLink: (id: string, t: string) => void;
  onRemoveLink: (id: string) => void; onAddPhoto: (p: string) => void; onRemovePhoto: (p: string) => void;
  onMoveLink: (fg: string, fs: string, tg: string, ts: string, lid: string) => void;
  draggingLink: DragState; setDraggingLink: (v: DragState) => void;
}) {
  const accent = getAccentStyle(groupIndex);
  const { user } = useAuth();
  const [linkDraft, setLinkDraft] = useState('');
  const [fetchingLink, setFetchingLink] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);
  const isDropTarget = !!draggingLink && (draggingLink.groupId !== groupId || draggingLink.sectionId !== section.id);

  const handleAddLink = async (rawUrl?: string) => {
    const url = normalizeUrl(rawUrl ?? linkDraft);
    if (!url) { toast.error('Invalid URL'); return; }
    setFetchingLink(true); setLinkDraft('');
    try { const preview = await fetchPreview(url); onAddLink({ url, ...preview }); }
    finally { setFetchingLink(false); }
  };

  const handlePaste = async (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text');
    if (isUrl(text)) { e.preventDefault(); void handleAddLink(text.trim()); return; }
    const imgItem = Array.from(e.clipboardData.items).find(item => item.type.startsWith('image/'));
    if (imgItem) {
      e.preventDefault();
      const file = imgItem.getAsFile();
      if (!file) return;
      if (user) {
        const localUrl = URL.createObjectURL(file);
        onAddPhoto(localUrl);
        const uploaded = await uploadPhoto(file, user.id);
        if (uploaded) { onRemovePhoto(localUrl); onAddPhoto(uploaded); URL.revokeObjectURL(localUrl); }
        else onRemovePhoto(localUrl);
      } else {
        const reader = new FileReader();
        reader.onload = () => { if (typeof reader.result === 'string') onAddPhoto(reader.result); };
        reader.readAsDataURL(file);
      }
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    const localUrl = URL.createObjectURL(file);
    onAddPhoto(localUrl);
    const uploaded = await uploadPhoto(file, user.id);
    if (uploaded) { onRemovePhoto(localUrl); onAddPhoto(uploaded); URL.revokeObjectURL(localUrl); }
    else onRemovePhoto(localUrl);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div
      onDragOver={e => { if (!draggingLink) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
      onDrop={e => { if (!draggingLink) return; e.preventDefault(); onMoveLink(draggingLink.groupId, draggingLink.sectionId, groupId, section.id, draggingLink.linkId); setDraggingLink(null); }}
      className={cn(!isSoleSection && 'rounded-[10px] border border-border/30 bg-black/[0.018] dark:bg-white/[0.025]', isDropTarget && 'ring-1 ring-primary/20')}
    >
      {/* Section header — only when multiple sections */}
      {!isSoleSection && (
        <div className="flex items-center gap-1 px-2 py-1">
          <button onClick={onToggle} aria-label={section.collapsed ? 'Expand section' : 'Collapse section'} className="flex h-4 w-4 flex-shrink-0 items-center justify-center text-muted-foreground/35 hover:text-foreground transition-colors">
            <ChevronDown size={11} className={cn("transition-transform", section.collapsed && "-rotate-90")} />
          </button>
          <InlineEditableText
            value={section.title} onSave={onRename}
            className="flex-1 truncate text-left text-[11px] font-semibold text-foreground/70"
            inputClassName="flex-1 bg-transparent border-b border-primary/40 text-[11px] font-semibold focus:outline-none"
            placeholder="Section name"
          />
          <button
            onClick={() => { if (confirmDelete) onDelete(); else { setConfirmDelete(true); setTimeout(() => setConfirmDelete(false), 2500); } }}
            aria-label={confirmDelete ? 'Confirm delete section' : 'Delete section'}
            className={cn('text-[9px] transition-colors', confirmDelete ? 'text-destructive font-semibold' : 'text-muted-foreground/20 hover:text-muted-foreground/55')}
          >
            {confirmDelete ? 'Delete?' : <X size={10} />}
          </button>
        </div>
      )}

      {(isSoleSection || !section.collapsed) && (
        <div className={cn(!isSoleSection && 'px-2 pb-1.5')}>
          {/* Links */}
          {section.links.length > 0 && (
            <div className="flex flex-col">
              {section.links.map(link => (
                <LinkRow key={link.id} link={link}
                  onRename={t => onRenameLink(link.id, t)}
                  onRemove={() => onRemoveLink(link.id)}
                  onDragStart={() => setDraggingLink({ groupId, sectionId: section.id, linkId: link.id })}
                  onDragEnd={() => setDraggingLink(null)}
                />
              ))}
            </div>
          )}

          {/* Photos — compact inline thumbnails */}
          {section.photos.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1 px-1">
              {section.photos.map((photo, i) => (
                <div key={i} className="group/ph relative h-7 w-7 flex-shrink-0 overflow-hidden rounded-[5px]">
                  <button type="button" onClick={() => setPreviewPhoto(photo)} className="h-full w-full">
                    <StorageImage src={photo} alt="" className="h-full w-full object-cover" />
                  </button>
                  <button onClick={() => onRemovePhoto(photo)} aria-label="Remove photo"
                    className="absolute inset-0 flex items-center justify-center bg-black/50 text-white opacity-0 transition-opacity group-hover/ph:opacity-100">
                    <X size={8} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Paste input — hidden until card hover */}
          <div className={cn(
            "mt-0.5 flex items-center gap-1.5 rounded-[7px] px-1.5 py-[3px] text-muted-foreground/35 transition-all",
            "opacity-0 group-hover/card:opacity-100 hover:bg-black/[0.03] dark:hover:bg-white/[0.04]",
            linkDraft.trim() && "opacity-100"
          )}>
            <Link2 size={10} className="flex-shrink-0" />
            <input
              value={linkDraft}
              onChange={e => setLinkDraft(e.target.value)}
              onKeyDown={e => { if (isEnterSubmit(e) && linkDraft.trim()) void handleAddLink(); }}
              onPaste={handlePaste}
              placeholder="Paste a link..."
              className="flex-1 bg-transparent text-[10.5px] text-foreground focus:outline-none placeholder:text-muted-foreground/35"
            />
            {fetchingLink ? (
              <Loader2 size={10} className="flex-shrink-0 animate-spin" />
            ) : linkDraft.trim() ? (
              <button onClick={() => void handleAddLink()} className="flex-shrink-0 text-muted-foreground/50 hover:text-primary transition-colors">
                <Plus size={12} />
              </button>
            ) : (
              <button onClick={() => fileInputRef.current?.click()} className="flex-shrink-0 hover:text-muted-foreground/60 transition-colors">
                <Camera size={10} />
              </button>
            )}
          </div>
        </div>
      )}

      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />

      <Dialog open={!!previewPhoto} onOpenChange={open => { if (!open) setPreviewPhoto(null); }}>
        <DialogContent className="max-w-4xl border-border/60 bg-background/95 p-2 shadow-2xl">
          {previewPhoto && <StorageImage src={previewPhoto} alt="" className="max-h-[80vh] w-full rounded-[12px] object-contain" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function GroupCard({
  group, groupIndex, onRename, onDelete, onToggle, onAddSection,
  onRenameSection, onDeleteSection, onToggleSection,
  onAddLink, onRenameLink, onRemoveLink, onMoveLink,
  onAddPhoto, onRemovePhoto,
  onGroupDragStart, onGroupDragEnd, onGroupDrop, isGroupDropTarget,
  draggingLink, setDraggingLink,
}: {
  group: LinkGroup; groupIndex: number;
  onRename: (t: string) => void; onDelete: () => void; onToggle: () => void;
  onAddSection: (t: string) => void;
  onRenameSection: (id: string, t: string) => void; onDeleteSection: (id: string) => void; onToggleSection: (id: string) => void;
  onAddLink: (sid: string, l: Omit<LinkItem, 'id'>) => void;
  onRenameLink: (sid: string, lid: string, t: string) => void;
  onRemoveLink: (sid: string, lid: string) => void;
  onMoveLink: (fg: string, fs: string, tg: string, ts: string, lid: string) => void;
  onAddPhoto: (sid: string, p: string) => void; onRemovePhoto: (sid: string, p: string) => void;
  onGroupDragStart: () => void; onGroupDragEnd: () => void; onGroupDrop: () => void;
  isGroupDropTarget: boolean; draggingLink: DragState; setDraggingLink: (v: DragState) => void;
}) {
  const accent = getAccentStyle(groupIndex);
  const [addingSection, setAddingSection] = useState(false);
  const [sectionDraft, setSectionDraft] = useState('');

  const totalLinks = group.sections.reduce((s, sec) => s + sec.links.length, 0);
  const subtitle = group.sections.length === 1
    ? (totalLinks > 0 ? `${totalLinks} link${totalLinks !== 1 ? 's' : ''}` : '')
    : `${group.sections.length} sections`;

  const submitSection = () => {
    const next = sectionDraft.trim();
    if (next) onAddSection(next);
    setSectionDraft(''); setAddingSection(false);
  };

  return (
    <div
      onDragOver={e => { if (draggingLink) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
      onDrop={e => { if (draggingLink) return; e.preventDefault(); onGroupDrop(); }}
      className={cn(
        'group/card overflow-hidden rounded-2xl border shadow-[0_8px_24px_-18px_rgba(80,68,58,0.18)] transition-all',
        accent.shell,
        isGroupDropTarget ? 'ring-2 ring-primary/25' : ''
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 cursor-pointer select-none" onClick={onToggle}>
        {/* Drag handle */}
        <div
          draggable
          onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; e.stopPropagation(); onGroupDragStart(); }}
          onDragEnd={e => { e.stopPropagation(); onGroupDragEnd(); }}
          onClick={e => e.stopPropagation()}
          className="flex-shrink-0 cursor-grab text-muted-foreground/20 opacity-0 group-hover/card:opacity-100 transition-opacity hover:text-muted-foreground/55 active:cursor-grabbing"
        >
          <GripVertical size={12} />
        </div>

        {/* Number badge */}
        <div className={cn('flex h-[18px] min-w-[18px] flex-shrink-0 items-center justify-center rounded-full border px-1 text-[9px] font-bold tabular-nums', accent.chip)}>
          {groupIndex + 1}
        </div>

        {/* Title */}
        <div className="flex-1 min-w-0" onClick={e => e.stopPropagation()}>
          <InlineEditableText
            value={group.title} onSave={onRename}
            className="block w-full truncate text-left text-[13px] font-semibold text-foreground leading-snug"
            inputClassName="w-full bg-transparent border-b border-primary/40 text-[13px] font-semibold text-foreground focus:outline-none"
            placeholder="Collection name"
          />
        </div>

        {/* Subtitle pill */}
        {subtitle && (
          <div className={cn('flex-shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium whitespace-nowrap', accent.soft)}>
            {subtitle}
          </div>
        )}

        {/* Delete */}
        <button
          onClick={e => { e.stopPropagation(); onDelete(); }}
          aria-label="Delete collection"
          className={cn('flex-shrink-0 text-[10px] transition-all opacity-0 group-hover/card:opacity-100', 'text-muted-foreground/35 hover:text-muted-foreground/70')}
        >
          <X size={12} />
        </button>

        {/* Collapse arrow */}
        <ChevronDown size={12} className={cn('flex-shrink-0 text-muted-foreground/30 transition-transform duration-200', group.collapsed && '-rotate-90')} />
      </div>

      {/* Expanded content */}
      {!group.collapsed && (
        <div className="border-t border-border/20 px-2 pb-2 pt-1.5 space-y-1">
          {group.sections.map(section => (
            <SectionCard
              key={section.id}
              groupIndex={groupIndex} groupId={group.id} section={section}
              isSoleSection={group.sections.length === 1}
              onRename={t => onRenameSection(section.id, t)}
              onDelete={() => onDeleteSection(section.id)}
              onToggle={() => onToggleSection(section.id)}
              onAddLink={l => onAddLink(section.id, l)}
              onRenameLink={(lid, t) => onRenameLink(section.id, lid, t)}
              onRemoveLink={lid => onRemoveLink(section.id, lid)}
              onAddPhoto={p => onAddPhoto(section.id, p)}
              onRemovePhoto={p => onRemovePhoto(section.id, p)}
              onMoveLink={onMoveLink}
              draggingLink={draggingLink} setDraggingLink={setDraggingLink}
            />
          ))}

          {/* Add section — subtle, hover-only */}
          {addingSection ? (
            <div className="flex items-center gap-1.5 rounded-[8px] border border-dashed border-border/35 px-2 py-1">
              <input autoFocus value={sectionDraft} onChange={e => setSectionDraft(e.target.value)}
                onBlur={submitSection}
                onKeyDown={e => { if (isEnterSubmit(e)) submitSection(); if (e.key === 'Escape') { setSectionDraft(''); setAddingSection(false); } }}
                placeholder="Section name..."
                className="flex-1 bg-transparent text-[11px] text-foreground focus:outline-none placeholder:text-muted-foreground/35"
              />
            </div>
          ) : (
            <button
              onClick={() => setAddingSection(true)}
              className="flex w-full items-center gap-1 px-1 py-0.5 text-[10px] text-muted-foreground/30 hover:text-muted-foreground/60 transition-colors opacity-0 group-hover/card:opacity-100"
            >
              <Plus size={10} />
              <span>Add section</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function LinksView() {
  const {
    groups, addGroup, renameGroup, deleteGroup, restoreGroup, toggleCollapse, reorderGroups,
    addSection, renameSection, deleteSection, toggleSectionCollapse,
    addLink, renameLink, removeLink, moveLink, addPhoto, removePhoto,
  } = useLinks();
  const { user } = useAuth();
  const { lang } = useLanguage();

  const handleDeleteGroup = useCallback((id: string) => {
    const index = groups.findIndex(g => g.id === id);
    const snapshot = groups[index];
    deleteGroup(id);
    if (!snapshot) return;
    showUndoToast({
      description: `Deleted “${snapshot.title || 'collection'}”`,
      undoLabel: 'Undo',
      onUndo: () => { restoreGroup(snapshot, index); },
    });
  }, [groups, deleteGroup, restoreGroup]);
  const [draft, setDraft] = useState('');
  const [fetching, setFetching] = useState(false);
  const [draggingLink, setDraggingLink] = useState<DragState>(null);
  const [draggingGroup, setDraggingGroup] = useState<GroupDragState>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const createGroupFromUrl = useCallback(async (url: string) => {
    setFetching(true); setDraft('');
    try {
      const preview = await fetchPreview(url);
      const group = addGroup(preview.title || getDomain(url));
      const firstSection = group.sections[0];
      addLink(group.id, firstSection.id, { url, ...preview });
    } finally { setFetching(false); }
  }, [addGroup, addLink]);

  const handleAdd = useCallback(() => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    if (isUrl(trimmed)) { void createGroupFromUrl(normalizeUrl(trimmed)!); }
    else { addGroup(trimmed); setDraft(''); }
  }, [draft, createGroupFromUrl, addGroup]);

  const handlePaste = useCallback(async (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text');
    if (isUrl(text)) { e.preventDefault(); void createGroupFromUrl(normalizeUrl(text.trim())!); return; }
    const imgItem = Array.from(e.clipboardData.items).find(item => item.type.startsWith('image/'));
    if (imgItem && user) { e.preventDefault(); toast.info('Paste image inside a section'); }
  }, [createGroupFromUrl, user]);

  return (
    <div className="flex h-full flex-col bg-background">
      <SheetHeader
        title={lang === 'zh' ? '链接' : 'Links'}
        subtitle={lang === 'zh' ? '保存网址,自动归类成卡片。' : 'Save URLs and group them into collections.'}
      />

      {/* Groups grid */}
      <div className="flex-1 overflow-y-auto px-3 pt-3 pb-4">
        {groups.length === 0 ? (
          <SheetEmptyState
            icon={<Link2 size={20} />}
            title={lang === 'zh' ? '还没有链接' : 'No links yet'}
            hint={lang === 'zh' ? '在下方粘贴网址,或输入一个集合名。' : 'Paste a URL below, or type a collection name to start.'}
          />
        ) : (
          <div className="grid grid-cols-2 gap-1.5 items-start">
            {groups.map((group, groupIndex) => (
              <GroupCard
                key={group.id}
                group={group} groupIndex={groupIndex}
                onRename={t => renameGroup(group.id, t)}
                onDelete={() => handleDeleteGroup(group.id)}
                onToggle={() => toggleCollapse(group.id)}
                onGroupDragStart={() => setDraggingGroup({ groupId: group.id })}
                onGroupDragEnd={() => setDraggingGroup(null)}
                onGroupDrop={() => { if (!draggingGroup || draggingGroup.groupId === group.id) return; reorderGroups(draggingGroup.groupId, group.id); setDraggingGroup(null); }}
                isGroupDropTarget={!!draggingGroup && draggingGroup.groupId !== group.id}
                onAddSection={t => addSection(group.id, t)}
                onRenameSection={(sid, t) => renameSection(group.id, sid, t)}
                onDeleteSection={sid => deleteSection(group.id, sid)}
                onToggleSection={sid => toggleSectionCollapse(group.id, sid)}
                onAddLink={(sid, l) => addLink(group.id, sid, l)}
                onRenameLink={(sid, lid, t) => renameLink(group.id, sid, lid, t)}
                onRemoveLink={(sid, lid) => removeLink(group.id, sid, lid)}
                onMoveLink={moveLink}
                onAddPhoto={(sid, p) => addPhoto(group.id, sid, p)}
                onRemovePhoto={(sid, p) => removePhoto(group.id, sid, p)}
                draggingLink={draggingLink} setDraggingLink={setDraggingLink}
              />
            ))}
          </div>
        )}
      </div>

      {/* Bottom input */}
      <div className="flex-shrink-0 bg-gradient-to-t from-background via-background/95 to-background/0 px-4 pb-4 pt-3">
        <SheetComposer
          value={draft}
          onChange={setDraft}
          onSubmit={() => { if (draft.trim() && !fetching) handleAdd(); }}
          onPaste={handlePaste}
          placeholder="Add a link or collection…"
          loading={fetching}
          leading={
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[hsl(var(--surface-soft))] text-muted-foreground">
              <Link2 size={15} />
            </span>
          }
          trailing={
            fetching ? <Loader2 size={14} className="animate-spin text-muted-foreground/50" /> : null
          }
        />
      </div>

      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={() => { if (fileInputRef.current) fileInputRef.current.value = ''; }} />
    </div>
  );
}
