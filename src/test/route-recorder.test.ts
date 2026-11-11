import { describe, it, expect, beforeEach } from 'vitest';
import { addRoutePoint, getRoutePoints, localDayKey, shouldRecordPoint, MIN_INTERVAL_MS } from '@/lib/routeRecorder';

const base = new Date(2026, 2, 2, 9, 0).getTime();
const p = (lat: number, lng: number, dtMin = 0, acc = 20) => ({ lat, lng, t: base + dtMin * 60000, acc });

describe('shouldRecordPoint', () => {
  it('keeps the first accurate fix and drops inaccurate ones', () => {
    expect(shouldRecordPoint(undefined, p(40.8, -73.96))).toBe(true);
    expect(shouldRecordPoint(undefined, p(40.8, -73.96, 0, 500))).toBe(false);
  });
  it('needs ~60 m of movement or 10 minutes', () => {
    const last = p(40.8, -73.96);
    expect(shouldRecordPoint(last, p(40.8001, -73.96, 1))).toBe(false); // ~11 m
    expect(shouldRecordPoint(last, p(40.801, -73.96, 1))).toBe(true); // ~111 m
    expect(shouldRecordPoint(last, { ...last, t: last.t + MIN_INTERVAL_MS })).toBe(true);
  });
});

describe('addRoutePoint', () => {
  beforeEach(() => localStorage.clear());
  it('stores points per local day', () => {
    expect(addRoutePoint(p(40.8, -73.96))).toBe(true);
    expect(addRoutePoint(p(40.8, -73.96, 1))).toBe(false);
    expect(addRoutePoint(p(40.81, -73.96, 5))).toBe(true);
    expect(getRoutePoints(localDayKey(base))).toHaveLength(2);
  });
});
