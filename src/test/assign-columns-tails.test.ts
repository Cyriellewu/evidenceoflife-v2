import { describe, expect, it } from 'vitest';
import { assignColumns, MAX_VISIBLE_COLS, type TimeBlock } from '@/components/views/planTimeline/planTimelinePrimitives';

const block = (over: Partial<TimeBlock> & Pick<TimeBlock, 'id' | 'startMin' | 'endMin'>): TimeBlock => ({
  title: over.id,
  type: 'plan',
  source: 'todo',
  ...over,
});

describe('assignColumns — carryover tails render side-by-side (并排), not stacked', () => {
  it('reserves a readable lane for very short back-to-back blocks', () => {
    const blocks: TimeBlock[] = [
      block({ id: 'short-a', startMin: 600, endMin: 601 }),
      block({ id: 'short-b', startMin: 607, endMin: 608 }),
    ];

    const positioned = assignColumns(blocks);

    expect(positioned.every(p => p.totalCols === 2)).toBe(true);
    expect(new Set(positioned.map(p => p.col)).size).toBe(2);
  });

  it('splits overlapping prev-day tails into parallel columns', () => {
    // Three carryover tails that all overlap at the top of the day (00:00-ish).
    const blocks: TimeBlock[] = [
      block({ id: 'tail-a', startMin: 0, endMin: 90, continuedFromPrevDay: true, readOnly: true }),
      block({ id: 'tail-b', startMin: 0, endMin: 40, continuedFromPrevDay: true, readOnly: true }),
      block({ id: 'tail-c', startMin: 0, endMin: 20, continuedFromPrevDay: true, readOnly: true }),
    ];
    const positioned = assignColumns(blocks);
    const cols = positioned.map(p => p.col).sort((a, b) => a - b);
    // Each overlapping tail gets its own column — no two share the same column.
    expect(new Set(cols).size).toBe(3);
    // They are laid out as columns, not a single full-width vertical stack.
    expect(positioned.every(p => p.totalCols === 3)).toBe(true);
    // The stale vertical-stack signal must stay off.
    expect(positioned.every(p => (p.tailRowIndex ?? 0) === 0)).toBe(true);
  });

  it('does not let a tail inflate the columns of a non-overlapping today block', () => {
    const blocks: TimeBlock[] = [
      block({ id: 'tail-a', startMin: 0, endMin: 30, continuedFromPrevDay: true, readOnly: true }),
      block({ id: 'today-morning', startMin: 600, endMin: 660 }), // 10:00-11:00, no overlap
    ];
    const positioned = assignColumns(blocks);
    const today = positioned.find(p => p.block.id === 'today-morning')!;
    expect(today.totalCols).toBe(1);
    expect(today.col).toBe(0);
  });

  it('a tail overlapping a live today block shares the same overlap group side-by-side', () => {
    const blocks: TimeBlock[] = [
      block({ id: 'tail-a', startMin: 0, endMin: 60, continuedFromPrevDay: true, readOnly: true }),
      block({ id: 'today-early', startMin: 10, endMin: 50 }),
    ];
    const positioned = assignColumns(blocks);
    // Both in one 2-column group, occupying distinct columns.
    expect(positioned.every(p => p.totalCols === 2)).toBe(true);
    expect(new Set(positioned.map(p => p.col)).size).toBe(2);
  });

  it('shows all overlapping tails side-by-side without folding into a +N badge', () => {
    const count = MAX_VISIBLE_COLS + 2; // more than any realistic day, still no fold
    const blocks: TimeBlock[] = Array.from({ length: 6 }, (_, i) =>
      block({ id: `tail-${i}`, startMin: 0, endMin: 60, continuedFromPrevDay: true, readOnly: true }),
    );
    const positioned = assignColumns(blocks);
    // Every block gets its own visible column — nothing is hidden.
    expect(positioned.every(p => p.totalCols === 6)).toBe(true);
    expect(positioned.every(p => p.visibleCols === 6)).toBe(true);
    expect(new Set(positioned.map(p => p.col)).size).toBe(6);
    expect(positioned.every(p => p.hiddenSiblingIds.length === 0)).toBe(true);
    // MAX_VISIBLE_COLS is a large safety valve, not a real fold threshold.
    expect(count).toBeGreaterThan(6);
  });
});
