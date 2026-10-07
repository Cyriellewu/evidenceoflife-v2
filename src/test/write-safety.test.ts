import { describe, expect, it } from 'vitest';
import { stableWriteUuid, withExclusiveWrite } from '@/lib/writeSafety';

describe('database write safety', () => {
  it('builds the same valid UUID for the same logical write', async () => {
    const first = await stableWriteUuid('recurring-clone', 'user-1', 'source-1', '2026-10-07');
    const retry = await stableWriteUuid('recurring-clone', 'user-1', 'source-1', '2026-10-07');
    const nextDay = await stableWriteUuid('recurring-clone', 'user-1', 'source-1', '2026-10-08');

    expect(retry).toBe(first);
    expect(nextDay).not.toBe(first);
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('serializes writes that target the same logical resource', async () => {
    const events: string[] = [];
    let releaseFirst!: () => void;
    const firstCanFinish = new Promise<void>(resolve => { releaseFirst = resolve; });

    const first = withExclusiveWrite('profile:user-1', async () => {
      events.push('first:start');
      await firstCanFinish;
      events.push('first:end');
    });
    const second = withExclusiveWrite('profile:user-1', async () => {
      events.push('second:start');
      events.push('second:end');
    });

    await Promise.resolve();
    expect(events).toEqual(['first:start']);
    releaseFirst();
    await Promise.all([first, second]);
    expect(events).toEqual(['first:start', 'first:end', 'second:start', 'second:end']);
  });
});

