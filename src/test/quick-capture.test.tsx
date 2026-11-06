import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/geolocation', () => ({
  getGeoPosition: vi.fn().mockResolvedValue({ lat: 40.8, lng: -73.96 }),
  classifyGeoError: vi.fn(() => 'unavailable'),
  geoErrorMessage: vi.fn(() => 'no location'),
}));
vi.mock('@/lib/geoClient', () => ({
  reversePlace: vi.fn().mockResolvedValue({ name: 'Butler Library', lat: 40.8, lng: -73.96, category: 'museum' }),
}));
vi.mock('@/components/StorageImage', () => ({ StorageImage: () => null }));

import { QuickCapture } from '@/components/QuickCapture';

describe('QuickCapture', () => {
  it('fills the location and saves a moment with it', async () => {
    const onSave = vi.fn().mockResolvedValue({});
    render(<QuickCapture lang="en" uploadPhoto={vi.fn()} onSave={onSave} onClose={vi.fn()} />);
    expect(await screen.findByText('Butler Library')).toBeInTheDocument();
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText('Add a line (optional)'), { target: { value: 'quiet floor' } });
    fireEvent.click(save);
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({
      text: 'quiet floor',
      photos: [],
      location: { name: 'Butler Library', lat: 40.8, lng: -73.96, category: 'museum' },
    }));
    expect(await screen.findByText('Saved')).toBeInTheDocument();
  });
});
