/**
 * The one pause store for focus timers.
 *
 * Pause state used to live in two places: PlanView's Map (saved to
 * localStorage) and a separate in-memory Map in Index for the global focus
 * overlay. Pausing in one was invisible to the other, and Index's copy was
 * lost on reload, so elapsed time could count paused minutes as work.
 *
 * Now both read and write this module: one Map, persisted under the existing
 * localStorage key, with a change event so every view re-renders.
 */
import type { PauseState } from '@/lib/focusTimer';

const STORAGE_KEY = 'plan-pause-states';
export const PAUSE_CHANGE_EVENT = 'eol:pause-change';

function load(): Map<string, PauseState> {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    if (raw) return new Map(Object.entries(JSON.parse(raw) as Record<string, PauseState>));
  } catch {
    // malformed → start empty
  }
  return new Map();
}

/** Shared instance. Components may read it directly (e.g. via a ref). */
export const pauseStates: Map<string, PauseState> = load();

function persistAndNotify() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(pauseStates)));
  } catch {
    // private mode / quota — keep in memory
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(PAUSE_CHANGE_EVENT));
}

/** Persist the shared Map after editing it in place, and notify every view. */
export const savePauseStates = persistAndNotify;

export function getPauseState(todoId: string): PauseState | undefined {
  return pauseStates.get(todoId);
}

/** Store a todo's pause state; an all-zero state removes it. */
export function setPauseState(todoId: string, state: PauseState) {
  if (state.pausedAt === null && state.totalPausedMs === 0) pauseStates.delete(todoId);
  else pauseStates.set(todoId, state);
  persistAndNotify();
}

export function clearPauseState(todoId: string) {
  if (!pauseStates.delete(todoId)) return;
  persistAndNotify();
}

/** Re-render on any pause change, from any view. Returns an unsubscribe. */
export function onPauseChange(listener: () => void): () => void {
  window.addEventListener(PAUSE_CHANGE_EVENT, listener);
  return () => window.removeEventListener(PAUSE_CHANGE_EVENT, listener);
}
