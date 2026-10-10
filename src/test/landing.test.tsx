import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { auth: { getSession: vi.fn(), onAuthStateChange: vi.fn() }, from: vi.fn() },
}));

vi.mock('@/lib/analytics', () => ({ trackEvent: vi.fn() }));

import Landing from '@/pages/Landing';
import { LanguageProvider, useLanguage } from '@/hooks/useLanguage';

class NoopIntersectionObserver {
  observe() {}
  disconnect() {}
  unobserve() {}
  takeRecords() { return []; }
}

function renderLanding() {
  return render(
    <LanguageProvider>
      <MemoryRouter>
        <Landing />
      </MemoryRouter>
    </LanguageProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('IntersectionObserver', NoopIntersectionObserver);
});

describe('Landing page positioning', () => {
  it('names ADHD and time blindness in the hero (en)', () => {
    localStorage.setItem('app-language', 'en');
    renderLanding();
    expect(screen.getByText('For ADHD and time-blind days')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Where did the day go?');
  });

  it('names ADHD in the hero (zh)', () => {
    localStorage.setItem('app-language', 'zh');
    renderLanding();
    expect(screen.getByText('给 ADHD 和“时间盲”的你')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('这一天去哪了？');
  });

  it('says plainly it is not a medical tool and discloses analytics', () => {
    localStorage.setItem('app-language', 'en');
    renderLanding();
    expect(screen.getByText(/not a medical or diagnostic tool/)).toBeInTheDocument();
    expect(screen.getByText(/session replay/)).toBeInTheDocument();
  });

  it('makes no claims the product contradicts', () => {
    localStorage.setItem('app-language', 'en');
    const { container } = renderLanding();
    const text = container.textContent ?? '';
    // HabitsView shows streaks, and export covers moments only.
    expect(text).not.toMatch(/no streaks/i);
    expect(text).not.toMatch(/export everything/i);
  });
});

describe('Non-persisted language switch (public demo)', () => {
  function Switcher() {
    const { lang, setLang } = useLanguage();
    return (
      <>
        <span data-testid="lang">{lang}</span>
        <button type="button" onClick={() => setLang('en', { persist: false })}>preview</button>
      </>
    );
  }

  it('changes the UI language without touching the saved preference', () => {
    localStorage.setItem('app-language', 'zh');
    render(<LanguageProvider><Switcher /></LanguageProvider>);
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'preview' })); });
    expect(screen.getByTestId('lang')).toHaveTextContent('en');
    expect(localStorage.getItem('app-language')).toBe('zh');
  });
});
