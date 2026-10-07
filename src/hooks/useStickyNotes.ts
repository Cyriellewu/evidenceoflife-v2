import { useState, useCallback, useEffect, useRef } from 'react';
import { MomentLinkPreview } from '@/types';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { useAuth } from '@/hooks/useAuth';

export type StickyCategory = string;

export interface StickyNoteItem {
  id: string;
  text: string;
  done: boolean;
  links?: MomentLinkPreview[];
  images?: string[];
}

export interface StickyNote {
  id: string;
  category: StickyCategory;
  title: string;
  items: StickyNoteItem[];
  created_at: string;
}

const STORAGE_KEY = 'sticky-notes-v2';
const LEGACY_STORAGE_KEYS = ['sticky-notes', 'sticky-notes-v1'];

type RawStickyNoteItem = StickyNoteItem & {
  link?: MomentLinkPreview;
  image?: string;
};

type RawStickyNote = StickyNote & {
  category?: string;
  items?: RawStickyNoteItem[];
};

function normalizeCategory(category: unknown): StickyCategory {
  const value = String(category || '').trim();
  return value || 'reminder';
}

function normalizeNotes(parsed: unknown): StickyNote[] {
  if (!Array.isArray(parsed)) return [];

  return parsed.map((note, noteIndex) => {
    const rawNote = (note || {}) as RawStickyNote;
    const items: RawStickyNoteItem[] = Array.isArray(rawNote.items) ? rawNote.items : [];

    return {
      id: rawNote.id || `sticky-note-${noteIndex}`,
      category: normalizeCategory(rawNote.category),
      title: typeof rawNote.title === 'string' ? rawNote.title : '',
      created_at: typeof rawNote.created_at === 'string' ? rawNote.created_at : new Date().toISOString(),
      items: items.map((item, itemIndex) => ({
        id: item.id || `sticky-item-${noteIndex}-${itemIndex}`,
        text: typeof item.text === 'string' ? item.text : '',
        done: Boolean(item.done),
        links: item.links ?? (item.link ? [item.link] : []),
        images: item.images ?? (item.image ? [item.image] : []),
      })),
    };
  });
}

function loadLocalNotes(): StickyNote[] {
  const candidateKeys = [STORAGE_KEY, ...LEGACY_STORAGE_KEYS];
  let firstParsedNotes: StickyNote[] = [];

  try {
    for (const key of candidateKeys) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;

      const normalized = normalizeNotes(JSON.parse(raw));
      if (normalized.length > 0) {
        return normalized;
      }

      if (firstParsedNotes.length === 0) {
        firstParsedNotes = normalized;
      }
    }

    return firstParsedNotes;
  } catch {
    return [];
  }
}

function saveLocalNotes(notes: StickyNote[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
}

function clearLegacyLocalNotes() {
  for (const key of [STORAGE_KEY, ...LEGACY_STORAGE_KEYS]) {
    localStorage.removeItem(key);
  }
}

function sortNotes(notes: StickyNote[]) {
  return [...notes];
}

function mapRowsToNotes(
  noteRows: Array<{ id: string; category: string; title: string; sort_order: number; created_at: string }>,
  itemRows: Array<{ id: string; note_id: string; text: string; done: boolean; links: unknown; images: string[] | null; sort_order: number }>
): StickyNote[] {
  const itemsByNoteId = new Map<string, StickyNoteItem[]>();

  itemRows
    .sort((a, b) => a.sort_order - b.sort_order)
    .forEach(item => {
      const parsedLinks = Array.isArray(item.links) ? item.links as MomentLinkPreview[] : [];
      const mapped: StickyNoteItem = {
        id: item.id,
        text: item.text,
        done: item.done,
        links: parsedLinks,
        images: item.images || [],
      };
      const existing = itemsByNoteId.get(item.note_id) || [];
      existing.push(mapped);
      itemsByNoteId.set(item.note_id, existing);
    });

  return noteRows
    .sort((a, b) => b.sort_order - a.sort_order || new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .map(note => ({
      id: note.id,
      category: normalizeCategory(note.category),
      title: note.title,
      created_at: note.created_at,
      items: itemsByNoteId.get(note.id) || [],
    }));
}

export function useStickyNotes() {
  const { user, isDemo, authReady } = useAuth();
  const [notes, setNotes] = useState<StickyNote[]>(() => loadLocalNotes());
  const [loading, setLoading] = useState(true);
  const migratedLocalRef = useRef(false);

  const fetchNotes = useCallback(async () => {
    if (!authReady) {
      setLoading(true);
      return;
    }

    if (!user || isDemo) {
      setNotes(loadLocalNotes());
      setLoading(false);
      return;
    }

    try {
      const [{ data: noteRows, error: notesError }, { data: itemRows, error: itemsError }] = await Promise.all([
        supabase.from('sticky_notes').select('id, category, title, sort_order, created_at').eq('user_id', user.id),
        supabase.from('sticky_note_items').select('id, note_id, text, done, links, images, sort_order').eq('user_id', user.id),
      ]);

      if (notesError) throw notesError;
      if (itemsError) throw itemsError;

      setNotes(mapRowsToNotes(noteRows || [], itemRows || []));
    } catch (error) {
      console.error('Failed to fetch sticky notes:', error);
    } finally {
      setLoading(false);
    }
  }, [authReady, isDemo, user]);

  useEffect(() => {
    void fetchNotes();
  }, [fetchNotes]);

  useEffect(() => {
    if (!user || isDemo) {
      saveLocalNotes(notes);
    }
  }, [isDemo, notes, user]);

  const migrateLocalNotes = useCallback(async () => {
    if (!authReady || !user || isDemo || migratedLocalRef.current) return;
    migratedLocalRef.current = true;

    const localNotes = loadLocalNotes();
    if (localNotes.length === 0) return;

    try {
      const { data: remoteNotes, error: notesReadError } = await supabase
        .from('sticky_notes')
        .select('id')
        .eq('user_id', user.id);

      if (notesReadError) throw notesReadError;
      const localIds = new Set(localNotes.map(note => note.id));
      const remoteIds = new Set((remoteNotes || []).map(note => note.id));
      const isPartialPreviousMigration = [...remoteIds].some(id => localIds.has(id));
      // Preserve the old rule for an account that already has unrelated cloud
      // notes, but resume safely if a previous migration stopped midway.
      if (remoteIds.size > 0 && !isPartialPreviousMigration) return;

      const noteInserts = localNotes.map((note, index, all) => ({
        id: note.id,
        user_id: user.id,
        category: note.category,
        title: note.title,
        sort_order: all.length - index,
        created_at: note.created_at,
      }));

      const itemInserts = localNotes.flatMap(note =>
        note.items.map((item, index) => ({
          id: item.id,
          note_id: note.id,
          user_id: user.id,
          text: item.text,
          done: item.done,
          sort_order: index,
          links: (item.links || []) as unknown as Json,
          images: item.images || [],
        }))
      );

      const { error: notesInsertError } = await supabase
        .from('sticky_notes')
        .upsert(noteInserts, { onConflict: 'id', ignoreDuplicates: true });
      if (notesInsertError) throw notesInsertError;

      if (itemInserts.length > 0) {
        const { error: itemsInsertError } = await supabase
          .from('sticky_note_items')
          .upsert(itemInserts, { onConflict: 'id', ignoreDuplicates: true });
        if (itemsInsertError) throw itemsInsertError;
      }

      clearLegacyLocalNotes();
      await fetchNotes();
    } catch (error) {
      console.error('Failed to migrate sticky notes to cloud:', error);
    }
  }, [authReady, fetchNotes, isDemo, user]);

  useEffect(() => {
    void migrateLocalNotes();
  }, [migrateLocalNotes]);

  const addNote = useCallback(async (title: string, category: StickyCategory) => {
    const trimmed = title.trim();
    if (!trimmed) return;

    if (!user || isDemo) {
      const note: StickyNote = {
        id: crypto.randomUUID(),
        category,
        title: trimmed,
        items: [],
        created_at: new Date().toISOString(),
      };
      setNotes(prev => [note, ...prev]);
      return;
    }

    const nextSortOrder = notes.length + 1;
    const { data, error } = await supabase
      .from('sticky_notes')
      .insert({ user_id: user.id, category, title: trimmed, sort_order: nextSortOrder })
      .select('id, category, title, sort_order, created_at')
      .single();

    if (!error && data) {
      setNotes(prev => sortNotes([{ id: data.id, category: normalizeCategory(data.category), title: data.title, created_at: data.created_at, items: [] }, ...prev]));
    }
  }, [isDemo, notes.length, user]);

  const deleteNote = useCallback(async (id: string) => {
    if (!user || isDemo) {
      setNotes(prev => prev.filter(n => n.id !== id));
      return;
    }

    const { error } = await supabase.from('sticky_notes').delete().eq('id', id).eq('user_id', user.id);
    if (!error) {
      setNotes(prev => prev.filter(n => n.id !== id));
    }
  }, [isDemo, user]);

  // Undo a just-deleted note by re-inserting it (and its items) at its prior position.
  const restoreNote = useCallback(async (note: StickyNote, index: number) => {
    setNotes(prev => {
      if (prev.some(n => n.id === note.id)) return prev;
      const next = [...prev];
      next.splice(Math.min(Math.max(index, 0), next.length), 0, note);
      return next;
    });
    if (!user || isDemo) return;

    const total = notes.length + 1;
    const { error: noteError } = await supabase.from('sticky_notes').insert({
      id: note.id,
      user_id: user.id,
      category: note.category,
      title: note.title,
      sort_order: total - index,
      created_at: note.created_at,
    });
    if (noteError) {
      console.error('Failed to restore note:', noteError);
      setNotes(prev => prev.filter(n => n.id !== note.id));
      return;
    }

    if (note.items.length > 0) {
      const itemInserts = note.items.map((item, i) => ({
        id: item.id,
        note_id: note.id,
        user_id: user.id,
        text: item.text,
        done: item.done,
        sort_order: i,
        links: (item.links || []) as unknown as Json,
        images: item.images || [],
      }));
      const { error: itemsError } = await supabase.from('sticky_note_items').insert(itemInserts);
      if (itemsError) console.error('Failed to restore note items:', itemsError);
    }
  }, [isDemo, notes.length, user]);

  const renameNote = useCallback(async (id: string, title: string) => {
    const trimmed = title.trim();
    if (!trimmed) return;

    if (!user || isDemo) {
      setNotes(prev => prev.map(n => n.id === id ? { ...n, title: trimmed } : n));
      return;
    }

    const { error } = await supabase.from('sticky_notes').update({ title: trimmed }).eq('id', id).eq('user_id', user.id);
    if (!error) {
      setNotes(prev => prev.map(n => n.id === id ? { ...n, title: trimmed } : n));
    }
  }, [isDemo, user]);

  const reorderNote = useCallback(async (noteId: string, targetId: string) => {
    setNotes(prev => {
      const sourceIndex = prev.findIndex(n => n.id === noteId);
      const targetIndex = prev.findIndex(n => n.id === targetId);
      if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return prev;

      const next = [...prev];
      const [moved] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, moved);

      if (user && !isDemo) {
        void Promise.all(
          next.map((note, index, all) =>
            supabase
              .from('sticky_notes')
              .update({ sort_order: all.length - index })
              .eq('id', note.id)
              .eq('user_id', user.id)
          )
        );
      }

      return next;
    });
  }, [isDemo, user]);

  const addItem = useCallback(async (noteId: string, text: string, options?: { images?: string[]; links?: MomentLinkPreview[] }) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    const note = notes.find(n => n.id === noteId);
    const nextSortOrder = note?.items.length || 0;
    const nextItem: StickyNoteItem = {
      id: crypto.randomUUID(),
      text: trimmed,
      done: false,
      images: options?.images || [],
      links: options?.links || [],
    };

    if (!user || isDemo) {
      setNotes(prev => prev.map(n => n.id === noteId ? { ...n, items: [...n.items, nextItem] } : n));
      return;
    }

    const { data, error } = await supabase
      .from('sticky_note_items')
      .insert({
        id: nextItem.id,
        note_id: noteId,
        user_id: user.id,
        text: trimmed,
        done: false,
        sort_order: nextSortOrder,
        images: options?.images || [],
        links: (options?.links || []) as unknown as Json,
      })
      .select('id, text, done, images, links')
      .single();

    if (!error && data) {
      setNotes(prev => prev.map(n => n.id === noteId ? {
        ...n,
        items: [...n.items, {
          id: data.id,
          text: data.text,
          done: data.done,
          images: data.images || [],
          links: Array.isArray(data.links) ? data.links as unknown as MomentLinkPreview[] : [],
        }],
      } : n));
    }
  }, [isDemo, notes, user]);

  const renameItem = useCallback(async (noteId: string, itemId: string, text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    if (!user || isDemo) {
      setNotes(prev => prev.map(n =>
        n.id === noteId
          ? { ...n, items: n.items.map(it => it.id === itemId ? { ...it, text: trimmed } : it) }
          : n
      ));
      return;
    }

    const { error } = await supabase.from('sticky_note_items').update({ text: trimmed }).eq('id', itemId).eq('user_id', user.id);
    if (!error) {
      setNotes(prev => prev.map(n =>
        n.id === noteId
          ? { ...n, items: n.items.map(it => it.id === itemId ? { ...it, text: trimmed } : it) }
          : n
      ));
    }
  }, [isDemo, user]);

  const attachItemLink = useCallback(async (noteId: string, itemId: string, link: MomentLinkPreview) => {
    const item = notes.flatMap(note => note.items).find(it => it.id === itemId);
    const nextLinks = [...(item?.links || [])];
    if (nextLinks.some(existing => existing.url === link.url)) return;
    nextLinks.push(link);

    if (!user || isDemo) {
      setNotes(prev => prev.map(n =>
        n.id === noteId
          ? { ...n, items: n.items.map(it => it.id === itemId ? { ...it, links: nextLinks } : it) }
          : n
      ));
      return;
    }

    const { error } = await supabase.from('sticky_note_items').update({ links: nextLinks as unknown as Json }).eq('id', itemId).eq('user_id', user.id);
    if (!error) {
      setNotes(prev => prev.map(n =>
        n.id === noteId
          ? { ...n, items: n.items.map(it => it.id === itemId ? { ...it, links: nextLinks } : it) }
          : n
      ));
    }
  }, [isDemo, notes, user]);

  const removeItemLink = useCallback(async (noteId: string, itemId: string, linkUrl: string) => {
    const item = notes.flatMap(note => note.items).find(it => it.id === itemId);
    const nextLinks = (item?.links || []).filter(link => link.url !== linkUrl);

    if (!user || isDemo) {
      setNotes(prev => prev.map(n =>
        n.id === noteId
          ? { ...n, items: n.items.map(it => it.id === itemId ? { ...it, links: nextLinks } : it) }
          : n
      ));
      return;
    }

    const { error } = await supabase.from('sticky_note_items').update({ links: nextLinks as unknown as Json }).eq('id', itemId).eq('user_id', user.id);
    if (!error) {
      setNotes(prev => prev.map(n =>
        n.id === noteId
          ? { ...n, items: n.items.map(it => it.id === itemId ? { ...it, links: nextLinks } : it) }
          : n
      ));
    }
  }, [isDemo, notes, user]);

  const attachItemImage = useCallback(async (noteId: string, itemId: string, image: string) => {
    const item = notes.flatMap(note => note.items).find(it => it.id === itemId);
    const nextImages = [...(item?.images || [])];
    if (!nextImages.includes(image)) {
      nextImages.push(image);
    }

    if (!user || isDemo) {
      setNotes(prev => prev.map(n =>
        n.id === noteId
          ? { ...n, items: n.items.map(it => it.id === itemId ? { ...it, images: nextImages } : it) }
          : n
      ));
      return;
    }

    const { error } = await supabase.from('sticky_note_items').update({ images: nextImages }).eq('id', itemId).eq('user_id', user.id);
    if (!error) {
      setNotes(prev => prev.map(n =>
        n.id === noteId
          ? { ...n, items: n.items.map(it => it.id === itemId ? { ...it, images: nextImages } : it) }
          : n
      ));
    }
  }, [isDemo, notes, user]);

  const removeItemImage = useCallback(async (noteId: string, itemId: string, image: string) => {
    const item = notes.flatMap(note => note.items).find(it => it.id === itemId);
    const nextImages = (item?.images || []).filter(img => img !== image);

    if (!user || isDemo) {
      setNotes(prev => prev.map(n =>
        n.id === noteId
          ? { ...n, items: n.items.map(it => it.id === itemId ? { ...it, images: nextImages } : it) }
          : n
      ));
      return;
    }

    const { error } = await supabase.from('sticky_note_items').update({ images: nextImages }).eq('id', itemId).eq('user_id', user.id);
    if (!error) {
      setNotes(prev => prev.map(n =>
        n.id === noteId
          ? { ...n, items: n.items.map(it => it.id === itemId ? { ...it, images: nextImages } : it) }
          : n
      ));
    }
  }, [isDemo, notes, user]);

  const toggleItem = useCallback(async (noteId: string, itemId: string) => {
    const item = notes.flatMap(note => note.items).find(it => it.id === itemId);
    if (!item) return;
    const nextDone = !item.done;

    if (!user || isDemo) {
      setNotes(prev => prev.map(n =>
        n.id === noteId
          ? { ...n, items: n.items.map(it => it.id === itemId ? { ...it, done: nextDone } : it) }
          : n
      ));
      return;
    }

    const { error } = await supabase.from('sticky_note_items').update({ done: nextDone }).eq('id', itemId).eq('user_id', user.id);
    if (!error) {
      setNotes(prev => prev.map(n =>
        n.id === noteId
          ? { ...n, items: n.items.map(it => it.id === itemId ? { ...it, done: nextDone } : it) }
          : n
      ));
    }
  }, [isDemo, notes, user]);

  const deleteItem = useCallback(async (noteId: string, itemId: string) => {
    if (!user || isDemo) {
      setNotes(prev => prev.map(n =>
        n.id === noteId ? { ...n, items: n.items.filter(it => it.id !== itemId) } : n
      ));
      return;
    }

    const { error } = await supabase.from('sticky_note_items').delete().eq('id', itemId).eq('user_id', user.id);
    if (!error) {
      setNotes(prev => prev.map(n =>
        n.id === noteId ? { ...n, items: n.items.filter(it => it.id !== itemId) } : n
      ));
    }
  }, [isDemo, user]);

  return {
    notes,
    loading,
    addNote,
    deleteNote,
    restoreNote,
    renameNote,
    reorderNote,
    addItem,
    renameItem,
    attachItemLink,
    removeItemLink,
    attachItemImage,
    removeItemImage,
    toggleItem,
    deleteItem,
    refetch: fetchNotes,
  };
}
