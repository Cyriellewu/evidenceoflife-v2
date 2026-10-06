import { act, render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MapView } from '@/components/views/MapView';
import type { CityWithPlaces } from '@/hooks/usePlaces';

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke } },
}));
vi.mock('@/hooks/useLanguage', () => ({ useLanguage: () => ({ lang: 'en', t: (key: string) => key }) }));
vi.mock('@/hooks/useDateLocale', () => ({ useDateLocale: () => ({ formatDate: () => 'Oct 5' }) }));

describe('map geo requests on parent renders', () => {
  it('does not restart geo requests on timer ticks, but refreshes changed city data', async () => {
    invoke.mockResolvedValue({ data: { boundaries: [] }, error: null });
    const cities: CityWithPlaces[] = [{
      id: 'city', name: 'Boston', country: 'US', lat: 42.36, lng: -71.06, totalVisits: 1,
      places: [{
        id: 'place', city_id: 'city', cityName: 'Boston', name: 'Coffee', category: 'coffee',
        lat: 42.36, lng: -71.06,
        visits: [{ id: 'visit', place_id: 'place', moment_id: null, date: '2026-10-05', note: null, photos: [] }],
      }],
    }];
    const moments: [] = [];
    const { rerender, unmount } = render(<MapView moments={moments} placesData={{ cities, loading: false }} />);
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    for (let tick = 0; tick < 60; tick++) {
      await act(async () => {
        rerender(<MapView moments={moments} placesData={{ cities, loading: false }} />);
      });
    }
    expect(invoke).toHaveBeenCalledTimes(1);
    rerender(<MapView moments={moments} placesData={{ cities: [...cities], loading: false }} />);
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(2));
    unmount();
  });
});
