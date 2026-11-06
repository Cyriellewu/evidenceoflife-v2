import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TodayModeToggle } from '@/components/TodayModeToggle';
import { LanguageProvider } from '@/hooks/useLanguage';

function renderToggle(mode: 'plan' | 'recap', onChange = vi.fn()) {
  localStorage.setItem('app-language', 'en');
  render(<LanguageProvider><TodayModeToggle mode={mode} onChange={onChange} /></LanguageProvider>);
  return onChange;
}

describe('TodayModeToggle', () => {
  it('marks the current mode and switches to the other one', () => {
    const onChange = renderToggle('plan');
    expect(screen.getByRole('tab', { name: 'Plan' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('tab', { name: 'Recap' }));
    expect(onChange).toHaveBeenCalledWith('recap');
  });

  it('does nothing when the current mode is tapped again', () => {
    const onChange = renderToggle('recap');
    fireEvent.click(screen.getByRole('tab', { name: 'Recap' }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
