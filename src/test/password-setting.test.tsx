import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const { updateUser } = vi.hoisted(() => ({ updateUser: vi.fn().mockResolvedValue({ data: {}, error: null }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { updateUser } } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { PasswordSetting } from '@/components/PasswordSetting';

describe('PasswordSetting', () => {
  it('only saves a matching password of 8+ characters', async () => {
    render(<PasswordSetting lang="en" email="me@example.com" />);
    fireEvent.click(screen.getByRole('button', { name: /Set a password/ }));
    const [pw, again] = screen.getAllByPlaceholderText(/password|Repeat/);
    const save = screen.getByRole('button', { name: 'Save' });

    fireEvent.change(pw, { target: { value: 'short' } });
    expect(screen.getByText('At least 8 characters')).toBeInTheDocument();
    expect(save).toBeDisabled();

    fireEvent.change(pw, { target: { value: 'long-enough-1' } });
    fireEvent.change(again, { target: { value: 'different-1' } });
    expect(screen.getByText("They don't match")).toBeInTheDocument();

    fireEvent.change(again, { target: { value: 'long-enough-1' } });
    fireEvent.click(save);
    await waitFor(() => expect(updateUser).toHaveBeenCalledWith({ password: 'long-enough-1' }));
  });
});
