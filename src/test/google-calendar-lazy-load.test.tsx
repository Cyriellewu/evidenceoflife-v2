import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { invoke, rpc, session } = vi.hoisted(() => ({
  invoke: vi.fn(),
  rpc: vi.fn(),
  session: { access_token: 'test-access-token' },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke }, rpc },
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, session }),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn() },
}));

import { useGoogleCalendar } from '@/hooks/useGoogleCalendar';

describe('useGoogleCalendar', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: vi.fn(() => null),
        setItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn(),
      },
    });
    invoke.mockReset();
    rpc.mockReset();
    rpc.mockResolvedValue({ data: true, error: null });
    invoke.mockResolvedValue({
      data: { calendars: [{ id: 'primary', summary: 'Primary', primary: true }] },
      error: null,
    });
  });

  it('does not refresh calendar credentials until calendar controls are opened', async () => {
    const { rerender } = renderHook(
      ({ loadCalendars }) => useGoogleCalendar({ loadCalendars }),
      { initialProps: { loadCalendars: false } },
    );

    await waitFor(() => expect(rpc).toHaveBeenCalledWith('is_google_calendar_connected'));
    expect(invoke).not.toHaveBeenCalled();

    await act(async () => {
      rerender({ loadCalendars: true });
    });

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('google-calendar-sync', {
        headers: { Authorization: 'Bearer test-access-token' },
        body: { action: 'listCalendars' },
      });
    });
  });
});
