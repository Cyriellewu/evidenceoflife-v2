import { describe, expect, it } from 'vitest';
import { getFirstRunFunnelEvents, getFirstRunSteps } from '@/lib/firstRun';

const names = (events: ReturnType<typeof getFirstRunFunnelEvents>) => events.map(e => e.onceKey);

describe('first-run funnel events', () => {
  it('only reports the guide being shown for an empty new account', () => {
    const steps = getFirstRunSteps([], 0);
    expect(names(getFirstRunFunnelEvents({ steps, guideVisible: true, hoursSinceSignup: 1 })))
      .toEqual(['first_run_guide_shown']);
  });

  it('reports each completed step with whether it is required', () => {
    const steps = getFirstRunSteps([{ timer_seconds: 60 }], 0);
    const events = getFirstRunFunnelEvents({ steps, guideVisible: false, hoursSinceSignup: 2 });
    expect(names(events)).toEqual(['first_run_step_task', 'first_run_step_timer']);
    expect(events[1].properties).toEqual({ step: 'timer', required: false });
  });

  it('reports activation once both required steps are done', () => {
    const steps = getFirstRunSteps([{}], 1);
    const events = getFirstRunFunnelEvents({ steps, guideVisible: true, hoursSinceSignup: 5 });
    expect(names(events)).toContain('activation_reached');
    expect(events.find(e => e.name === 'activation_reached')?.properties).toEqual({ hours_since_signup: 5 });
  });

  it('never puts task or moment content into properties', () => {
    const steps = getFirstRunSteps([{ timer_started_at: '2026-10-15T10:00:00Z' }], 3);
    const events = getFirstRunFunnelEvents({ steps, guideVisible: true, hoursSinceSignup: null });
    for (const e of events) {
      for (const value of Object.values(e.properties)) expect(['string', 'number', 'boolean']).toContain(typeof value);
      expect(Object.keys(e.properties).every(k => ['steps_done', 'step', 'required', 'hours_since_signup'].includes(k))).toBe(true);
    }
  });
});
