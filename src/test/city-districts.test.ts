import { describe, expect, it } from 'vitest';
import {
  districtDisplayName,
  districtsForCity,
  resolvePlaceDistrict,
} from '@/lib/cityDistricts';

describe('cityDistricts', () => {
  it('lists NYC boroughs for New York / 纽约', () => {
    expect(districtsForCity('New York').map((d) => d.id)).toEqual([
      'manhattan',
      'brooklyn',
      'queens',
      'bronx',
      'staten-island',
    ]);
    expect(districtsForCity('纽约').length).toBe(5);
  });

  it('assigns Columbia / Claremont Ave to Manhattan', () => {
    const d = resolvePlaceDistrict('New York', 40.8106, -73.9626, '40 Claremont Avenue');
    expect(d?.id).toBe('manhattan');
    expect(districtDisplayName(d!, 'zh')).toBe('曼哈顿');
  });

  it('assigns a mid-Brooklyn point to Brooklyn', () => {
    const d = resolvePlaceDistrict('New York', 40.6500, -73.9500);
    expect(d?.id).toBe('brooklyn');
  });

  it('matches Beijing districts from place name', () => {
    expect(districtsForCity('北京市').some((d) => d.id === 'haidian')).toBe(true);
    const d = resolvePlaceDistrict('Beijing', 39.98, 116.3, '咖啡馆, 海淀区');
    expect(d?.id).toBe('haidian');
  });

  it('lists NYC boroughs from coordinates when the city is still Area N', () => {
    expect(districtsForCity('Area 1', { lat: 40.81, lng: -73.96 }).map((d) => d.id)).toContain(
      'manhattan',
    );
    const d = resolvePlaceDistrict('Area 1', 40.8106, -73.9626, 'Butler Library', {
      lat: 40.81,
      lng: -73.96,
    });
    expect(d?.id).toBe('manhattan');
  });
});
