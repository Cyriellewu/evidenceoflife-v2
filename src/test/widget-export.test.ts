import { describe, expect, it } from 'vitest';
import { buildWidgetPayload, WIDGET_PAYLOAD_KIND } from '@/lib/widgetExport';

describe('buildWidgetPayload', () => {
  it('keeps only map fields, rounds coordinates and drops bad rows', () => {
    const json = JSON.parse(buildWidgetPayload([
      { lat: 40.807912345, lng: -73.9621987, category: 'restaurant', name: 'Koronet' },
      { lat: Number.NaN, lng: 1, category: 'coffee' },
      { lat: 40.75, lng: -73.98, category: '' },
    ], new Date('2026-11-06T18:00:00Z')));
    expect(json.kind).toBe(WIDGET_PAYLOAD_KIND);
    expect(json.places).toEqual([
      { lat: 40.8079, lng: -73.9622, category: 'restaurant', name: 'Koronet' },
      { lat: 40.75, lng: -73.98, category: 'other' },
    ]);
  });
});
