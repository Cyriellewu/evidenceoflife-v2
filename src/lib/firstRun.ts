/**
 * First-run guide: pure logic, kept out of components so it can be tested.
 *
 * Activation (docs/metrics/metric-definitions.md) = at least one plan item and
 * at least one moment. The guide asks for exactly those two things; starting a
 * timer is shown as an optional extra, never required.
 */

/** New accounts get the guide (and start on Plan) for this long. */
export const FIRST_RUN_WINDOW_MS = 72 * 60 * 60 * 1000;

const DISMISSED_PREFIX = 'eol.firstRunGuide.dismissed.';

export interface FirstRunSteps {
  task: boolean;
  timer: boolean;
  moment: boolean;
  /** Required steps completed (task + moment). */
  doneCount: number;
  requiredCount: number;
  allRequiredDone: boolean;
}

type TodoLike = { timer_started_at?: string | null; timer_seconds?: number | null };

export function getFirstRunSteps(todos: TodoLike[], momentsCount: number): FirstRunSteps {
  const task = todos.length > 0;
  const timer = todos.some(t => !!t.timer_started_at || (t.timer_seconds ?? 0) > 0);
  // A focus session auto-logs a moment the user can see on their timeline, so
  // it counts here too (analytics splits manual vs focus-session separately).
  const moment = momentsCount > 0;
  const doneCount = Number(task) + Number(moment);
  return { task, timer, moment, doneCount, requiredCount: 2, allRequiredDone: task && moment };
}

/**
 * Whether this signed-in user is in their first-run window. Based on account
 * age, never on "no data loaded": a failed or restricted fetch returns empty
 * lists and must not make a long-time user look brand new.
 */
export function isFirstRunAccount(params: {
  isDemo: boolean;
  createdAt?: string | null;
  now?: number;
}): boolean {
  const { isDemo, createdAt, now = Date.now() } = params;
  if (isDemo || !createdAt) return false;
  const created = Date.parse(createdAt);
  if (!Number.isFinite(created)) return false;
  const age = now - created;
  return age >= 0 && age < FIRST_RUN_WINDOW_MS;
}

export function isFirstRunGuideDismissed(userId: string | null | undefined): boolean {
  if (!userId || typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(`${DISMISSED_PREFIX}${userId}`) === 'true';
  } catch {
    return false;
  }
}

export function dismissFirstRunGuide(userId: string | null | undefined) {
  if (!userId || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(`${DISMISSED_PREFIX}${userId}`, 'true');
  } catch {
    // Storage blocked: the guide simply reappears next session.
  }
}

export interface FirstRunFunnelEvent {
  /** Stable once-per-user key, so a reload never double-counts. */
  onceKey: string;
  name: 'first_run_guide_shown' | 'first_run_step_completed' | 'activation_reached';
  properties: Record<string, string | number | boolean>;
}

/**
 * Funnel events implied by the current first-run state. The caller sends each
 * at most once per user; properties never include task or moment content.
 */
export function getFirstRunFunnelEvents(params: {
  steps: FirstRunSteps;
  guideVisible: boolean;
  hoursSinceSignup: number | null;
}): FirstRunFunnelEvent[] {
  const { steps, guideVisible, hoursSinceSignup } = params;
  const events: FirstRunFunnelEvent[] = [];
  if (guideVisible) {
    events.push({ onceKey: 'first_run_guide_shown', name: 'first_run_guide_shown', properties: { steps_done: steps.doneCount } });
  }
  (['task', 'timer', 'moment'] as const).forEach(step => {
    if (steps[step]) {
      events.push({ onceKey: `first_run_step_${step}`, name: 'first_run_step_completed', properties: { step, required: step !== 'timer' } });
    }
  });
  if (steps.allRequiredDone) {
    events.push({
      onceKey: 'activation_reached',
      name: 'activation_reached',
      properties: hoursSinceSignup === null ? {} : { hours_since_signup: hoursSinceSignup },
    });
  }
  return events;
}
