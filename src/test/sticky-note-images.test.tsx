import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { uploadPhotos, inserts, updates, auth } = vi.hoisted(() => ({
  uploadPhotos: vi.fn(),
  inserts: [] as Record<string, unknown>[],
  updates: [] as Record<string, unknown>[],
  auth: { user: { id: 'u1' } as { id: string } | null, isDemo: false, authReady: true },
}));

vi.mock('@/hooks/moments/data', () => ({ uploadPhotos }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => auth }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const NOTE_ID = 'n1';
vi.mock('@/integrations/supabase/client', () => {
  const rows: Record<string, unknown[]> = {
    sticky_notes: [{ id: 'n1', category: 'reminder', title: 'T', sort_order: 0, created_at: '2026-01-01' }],
    sticky_note_items: [{ id: 'i1', note_id: 'n1', text: 'x', done: false, links: [], images: [], sort_order: 0 }],
  };
  const from = (table: string) => {
    const chain: Record<string, unknown> = {};
    const thenable = (value: unknown) => Object.assign(Promise.resolve(value), chain);
    chain.select = () => chain;
    chain.eq = () => thenable({ data: rows[table] ?? [], error: null });
    chain.insert = (payload: Record<string, unknown>) => {
      inserts.push(payload);
      return { select: () => ({ single: () => Promise.resolve({ data: { ...payload, links: [] }, error: null }) }) };
    };
    chain.update = (payload: Record<string, unknown>) => {
      updates.push(payload);
      return { eq: () => ({ eq: () => Promise.resolve({ error: null }) }) };
    };
    return chain;
  };
  return { supabase: { from } };
});

import { useStickyNotes } from '@/hooks/useStickyNotes';

const DATA = 'data:image/png;base64,AAAA';
const hasInline = (list: unknown) => (list as string[]).some(s => s.startsWith('data:') || s.startsWith('blob:'));

beforeEach(() => {
  localStorage.clear();
  uploadPhotos.mockReset();
  inserts.length = 0;
  updates.length = 0;
  auth.user = { id: 'u1' };
  auth.isDemo = false;
});

async function mountLoaded() {
  const hook = renderHook(() => useStickyNotes());
  await waitFor(() => expect(hook.result.current.notes.length).toBe(1));
  return hook;
}

describe('sticky note images (signed in)', () => {
  it('uploads a pasted image and stores only the storage path', async () => {
    uploadPhotos.mockResolvedValue(['u1/sticky/1-a.webp']);
    const { result } = await mountLoaded();
    await act(() => result.current.addItem(NOTE_ID, 'pic', { images: [DATA] }));
    expect(uploadPhotos).toHaveBeenCalledWith('u1', [DATA], 'sticky');
    expect(inserts[0].images).toEqual(['u1/sticky/1-a.webp']);
  });

  it('never writes a data: URL when the upload fails', async () => {
    uploadPhotos.mockResolvedValue([]);
    const { result } = await mountLoaded();
    await act(() => result.current.addItem(NOTE_ID, 'pic', { images: [DATA] }));
    expect(hasInline(inserts[0].images)).toBe(false);
  });

  it('attaches an uploaded path to an existing item', async () => {
    uploadPhotos.mockResolvedValue(['u1/sticky/2-b.webp']);
    const { result } = await mountLoaded();
    await act(() => result.current.attachItemImage(NOTE_ID, 'i1', DATA));
    expect(updates[0].images).toEqual(['u1/sticky/2-b.webp']);
  });

  it('skips the write entirely when attaching fails', async () => {
    uploadPhotos.mockResolvedValue([]);
    const { result } = await mountLoaded();
    await act(() => result.current.attachItemImage(NOTE_ID, 'i1', DATA));
    expect(updates).toHaveLength(0);
  });
});

describe('sticky note images (demo)', () => {
  it('keeps data: images in memory and makes no upload', async () => {
    auth.isDemo = true;
    localStorage.setItem('sticky-notes-v2', JSON.stringify([
      { id: 'local', category: 'reminder', title: 'L', items: [], created_at: '2026-01-01' },
    ]));
    const { result } = renderHook(() => useStickyNotes());
    await waitFor(() => expect(result.current.notes.length).toBe(1));
    await act(() => result.current.addItem('local', 'pic', { images: [DATA] }));
    expect(result.current.notes[0].items[0].images).toEqual([DATA]);
    expect(uploadPhotos).not.toHaveBeenCalled();
    expect(inserts).toHaveLength(0);
  });
});
