import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PlanPaneSwitcher } from '@/components/PlanPaneSwitcher';

vi.mock('@/hooks/useLanguage', () => ({
  useLanguage: () => ({ lang: 'en' }),
}));

describe('PlanPaneSwitcher', () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: vi.fn((key: string) => values.get(key) ?? null),
        setItem: vi.fn((key: string, value: string) => { values.set(key, value); }),
        removeItem: vi.fn((key: string) => { values.delete(key); }),
        clear: vi.fn(() => { values.clear(); }),
      },
    });
  });

  it('switches from every Plan pane to Recap', () => {
    const onTodayModeChange = vi.fn();
    render(
      <PlanPaneSwitcher
        todayMode="plan"
        onTodayModeChange={onTodayModeChange}
      />,
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Timeline' }));
    expect(screen.getByRole('tab', { name: 'Timeline' })).toHaveAttribute('aria-selected', 'true');

    fireEvent.click(screen.getByRole('tab', { name: 'Recap' }));
    expect(onTodayModeChange).toHaveBeenCalledWith('recap');
  });

  it('keeps a visible route from Recap back to Plan', () => {
    const onTodayModeChange = vi.fn();
    render(
      <PlanPaneSwitcher
        todayMode="recap"
        onTodayModeChange={onTodayModeChange}
      />,
    );

    expect(screen.getByRole('tab', { name: 'Recap' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('tab', { name: 'Plan' }));
    expect(onTodayModeChange).toHaveBeenCalledWith('plan');
  });
});
