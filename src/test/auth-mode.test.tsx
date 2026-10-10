import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { auth: { signInWithPassword: vi.fn(), signUp: vi.fn(), signInWithOAuth: vi.fn() } },
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

import Auth from '@/pages/Auth';

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location">{location.pathname + location.search}</span>;
}

function renderAuth(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Auth />
      <LocationProbe />
    </MemoryRouter>,
  );
}

describe('Auth page mode', () => {
  it('stays on sign-in for plain /auth (expired sessions, "Sign in" links)', () => {
    renderAuth('/auth');
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByText('Welcome back')).toBeInTheDocument();
  });

  it('opens sign-up for /auth?mode=signup', () => {
    renderAuth('/auth?mode=signup');
    expect(screen.getByRole('button', { name: 'Create account' })).toBeInTheDocument();
    expect(screen.getByText('Create your free account')).toBeInTheDocument();
    expect(screen.getByText('Already have an account?')).toBeInTheDocument();
  });

  it('keeps the URL in sync when toggling modes', () => {
    renderAuth('/auth?mode=signup');
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/auth$/);
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Sign up' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/auth?mode=signup');
    expect(screen.getByRole('button', { name: 'Create account' })).toBeInTheDocument();
  });
});
