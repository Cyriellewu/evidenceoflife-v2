/**
 * The title/note marker ("---DETAIL---") must never show up as text.
 * Seen on the Plan timeline: "到seattle啦 ---DETAIL--- 有点阴天 …".
 */
import { describe, it, expect } from 'vitest';
import { DETAIL_SEPARATOR, momentTitle, parseSubtitleDetail } from '@/components/views/today/todayHelpers';
import { buildPlanBlocks } from '@/components/views/planTimeline/buildPlanBlocks';
import type { Moment } from '@/types';

describe('detail marker', () => {
  it('splits the stored form and the space-only form', () => {
    expect(parseSubtitleDetail(`到seattle啦${DETAIL_SEPARATOR}有点阴天`)).toEqual({ subtitle: '到seattle啦', detail: '有点阴天' });
    expect(parseSubtitleDetail('到seattle啦 ---DETAIL--- 有点阴天')).toEqual({ subtitle: '到seattle啦', detail: '有点阴天' });
    expect(parseSubtitleDetail('just a title')).toEqual({ subtitle: 'just a title', detail: null });
  });

  it('momentTitle drops the marker and the note', () => {
    expect(momentTitle('到seattle啦 ---DETAIL--- 有点阴天')).toBe('到seattle啦');
    expect(momentTitle(null)).toBe('');
  });

  it('Plan timeline moment blocks show only the title and keep the note for renames', () => {
    const m = {
      id: 'm1', text: '到seattle啦 ---DETAIL--- 有点阴天', emoji: undefined, photos: [], tags: [],
      date: '2026-11-14', createdAt: '2026-11-14T18:00:00.000Z',
      timer_started_at: '2026-11-14T18:00:00.000Z', timer_ended_at: '2026-11-14T18:05:00.000Z',
    } as unknown as Moment;
    const blocks = buildPlanBlocks([], [], [m], new Set(), undefined, undefined, '2026-11-14');
    const block = blocks.find(b => b.id === 'moment-m1');
    expect(block?.title).toBe('到seattle啦');
    expect(block?.note).toBe('有点阴天');
  });
});
