import { describe, it, expect, vi } from 'vitest';
import { clearPauseState, getPauseState, onPauseChange, pauseStates, setPauseState } from '@/lib/pauseStore';

describe('shared pause store', () => {
  it('one Map: a pause written through the API is what every reader sees, and it persists', () => {
    setPauseState('t1', { pausedAt: 1000, totalPausedMs: 0 });
    expect(pauseStates.get('t1')).toEqual({ pausedAt: 1000, totalPausedMs: 0 });
    expect(getPauseState('t1')?.pausedAt).toBe(1000);
    expect(JSON.parse(localStorage.getItem('plan-pause-states') || '{}').t1.pausedAt).toBe(1000);
  });

  it('an all-zero state removes the entry; clear removes it too', () => {
    setPauseState('t2', { pausedAt: null, totalPausedMs: 0 });
    expect(pauseStates.has('t2')).toBe(false);
    setPauseState('t3', { pausedAt: null, totalPausedMs: 5000 });
    clearPauseState('t3');
    expect(pauseStates.has('t3')).toBe(false);
  });

  it('notifies subscribers so other views re-render', () => {
    const listener = vi.fn();
    const off = onPauseChange(listener);
    setPauseState('t4', { pausedAt: 2000, totalPausedMs: 0 });
    expect(listener).toHaveBeenCalledTimes(1);
    off();
    setPauseState('t4', { pausedAt: null, totalPausedMs: 0 });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
