import { describe, it, expect, vi, beforeEach } from 'vitest';

const upsert = vi.fn().mockResolvedValue({ error: null });
const del = { eq: vi.fn(), lt: vi.fn() };
del.eq.mockReturnValue(del);
del.lt.mockResolvedValue({ error: null });
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: () => ({ upsert, delete: () => del }) },
}));

import { mergeRoutePoints, uploadRoutePoints } from '@/lib/routeSync';
import { addRoutePoint } from '@/lib/routeRecorder';

describe('mergeRoutePoints', () => {
  it('dedupes by timestamp and sorts', () => {
    const a = { lat: 1, lng: 1, t: 2 };
    const b = { lat: 2, lng: 2, t: 1 };
    expect(mergeRoutePoints([a], [a, b]).map(p => p.t)).toEqual([1, 2]);
  });
});

describe('uploadRoutePoints', () => {
  beforeEach(() => { localStorage.clear(); upsert.mockClear(); });
  it('uploads only unsent points, ignoring duplicates, without reading rows back', async () => {
    const now = Date.now();
    addRoutePoint('u1', { lat: 40.8, lng: -73.96, t: now - 60_000, acc: 40000 });
    addRoutePoint('u1', { lat: 40.81, lng: -73.96, t: now, acc: 20 });
    await uploadRoutePoints('u1');
    expect(upsert).toHaveBeenCalledTimes(1);
    const [rows, opts] = upsert.mock.calls[0];
    expect(opts).toEqual({ onConflict: 'user_id,t', ignoreDuplicates: true });
    expect(rows).toHaveLength(1); // the 40 km fix was never stored
    await uploadRoutePoints('u1');
    expect(upsert).toHaveBeenCalledTimes(1); // nothing new to send
  });
});
