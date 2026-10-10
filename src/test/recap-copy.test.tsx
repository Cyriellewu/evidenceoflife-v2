import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const invoke = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } },
}));

import { buildRecapClosing, buildYesterdayNudge } from '@/components/views/today/todayHelpers';
import { LifeReplay } from '@/components/views/today/TodayRecapParts';

const at = (h: number, m = 0) => new Date(2026, 3, 8, h, m);
const item = (title: string, h: number, durMin = 30) => ({
  type: 'todo', time: at(h), endTime: at(h, durMin), data: { title },
});

describe('recap copy helpers', () => {
  it('closes today vs a past day, in both languages', () => {
    expect(buildRecapClosing('en', true)).toBe("That's today. Proof you were here.");
    expect(buildRecapClosing('en', false)).toBe('That was the day. Proof you were here.');
    expect(buildRecapClosing('zh', true)).toBe('这就是今天——你活过的证据。');
    expect(buildRecapClosing('zh', false)).toBe('这就是那一天——你活过的证据。');
  });

  it('nudges without counting (no streak pressure)', () => {
    expect(buildYesterdayNudge('en')).not.toMatch(/\d/);
    expect(buildYesterdayNudge('zh')).not.toMatch(/\d/);
  });
});

describe('LifeReplay localOnly (mobile)', () => {
  it('renders an on-device story and never calls the edge function', () => {
    render(
      <LifeReplay
        items={[item('Morning reset', 8), item('Deep work', 10), item('Walk', 17)]}
        lang="en" dateKey="2026-04-08" localOnly className=""
      />,
    );
    expect(screen.getByText(/You started with Morning reset/)).toBeInTheDocument();
    expect(screen.queryByText(/Regenerate/)).toBeNull();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('renders nothing with fewer than 3 events', () => {
    const { container } = render(
      <LifeReplay items={[item('A', 8), item('B', 9)]} lang="en" dateKey="2026-04-08" localOnly />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
