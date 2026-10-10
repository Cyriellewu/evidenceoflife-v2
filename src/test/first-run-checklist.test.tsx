import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FirstRunChecklist } from '@/components/FirstRunChecklist';
import { getFirstRunSteps } from '@/lib/firstRun';

function setup(todos: { timer_seconds?: number }[], moments: number) {
  const handlers = { onAddTask: vi.fn(), onLogMoment: vi.fn(), onSeeRecap: vi.fn(), onDismiss: vi.fn() };
  render(<FirstRunChecklist steps={getFirstRunSteps(todos, moments)} lang="en" {...handlers} />);
  return handlers;
}

describe('FirstRunChecklist', () => {
  it('shows the steps for a brand-new user and each row does its action', () => {
    const h = setup([], 0);
    expect(screen.getByText('Get started')).toBeInTheDocument();
    expect(screen.getByText('0/2')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Add one thing to do today'));
    expect(h.onAddTask).toHaveBeenCalled();
    fireEvent.click(screen.getByText('Log a moment'));
    expect(h.onLogMoment).toHaveBeenCalled();
  });

  it('collapses to one line after the first task, and can expand again', () => {
    const h = setup([{ timer_seconds: 0 }], 0);
    expect(screen.getByText('Next: log a moment')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Next: log a moment'));
    expect(h.onLogMoment).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Show steps' }));
    expect(screen.getByText('Get started')).toBeInTheDocument();
  });

  it('offers the recap when both required steps are done', () => {
    const h = setup([{ timer_seconds: 0 }], 1);
    fireEvent.click(screen.getByText("See today's recap"));
    expect(h.onSeeRecap).toHaveBeenCalled();
  });

  it('can be dismissed', () => {
    const h = setup([], 0);
    fireEvent.click(screen.getByRole('button', { name: 'Hide guide' }));
    expect(h.onDismiss).toHaveBeenCalled();
  });
});
