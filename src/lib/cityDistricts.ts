/**
 * City → district/borough helpers for the Places map.
 *
 * NYC boroughs use simplified polygons (point-in-polygon). Chinese
 * municipality districts are matched from place names when present
 * (e.g. "…海淀区"), since places are stored under the city umbrella.
 */

export type DistrictLabel = { id: string; en: string; zh: string };

type Ring = [number, number][]; // [lng, lat]

const NYC_BOROUGHS: { label: DistrictLabel; ring: Ring }[] = [
  {
    label: { id: 'manhattan', en: 'Manhattan', zh: '曼哈顿' },
    ring: [
      [-74.047, 40.683], [-74.025, 40.700], [-74.010, 40.710], [-73.998, 40.740],
      [-73.980, 40.760], [-73.965, 40.780], [-73.945, 40.800], [-73.930, 40.830],
      [-73.910, 40.870], [-73.910, 40.880], [-73.935, 40.880], [-73.960, 40.850],
      [-73.975, 40.820], [-74.000, 40.780], [-74.020, 40.750], [-74.030, 40.720],
      [-74.047, 40.700], [-74.047, 40.683],
    ],
  },
  {
    label: { id: 'brooklyn', en: 'Brooklyn', zh: '布鲁克林' },
    ring: [
      [-74.050, 40.610], [-74.040, 40.650], [-74.020, 40.680], [-74.000, 40.700],
      [-73.970, 40.710], [-73.940, 40.700], [-73.880, 40.680], [-73.850, 40.650],
      [-73.850, 40.580], [-73.880, 40.560], [-73.950, 40.560], [-74.020, 40.570],
      [-74.050, 40.590], [-74.050, 40.610],
    ],
  },
  {
    label: { id: 'queens', en: 'Queens', zh: '皇后区' },
    ring: [
      [-73.960, 40.740], [-73.940, 40.780], [-73.900, 40.800], [-73.850, 40.790],
      [-73.760, 40.770], [-73.700, 40.740], [-73.700, 40.650], [-73.740, 40.580],
      [-73.820, 40.560], [-73.900, 40.580], [-73.940, 40.640], [-73.960, 40.700],
      [-73.960, 40.740],
    ],
  },
  {
    label: { id: 'bronx', en: 'Bronx', zh: '布朗克斯' },
    ring: [
      [-73.930, 40.800], [-73.910, 40.830], [-73.880, 40.870], [-73.850, 40.900],
      [-73.820, 40.910], [-73.780, 40.890], [-73.770, 40.850], [-73.800, 40.820],
      [-73.850, 40.800], [-73.900, 40.790], [-73.930, 40.800],
    ],
  },
  {
    label: { id: 'staten-island', en: 'Staten Island', zh: '斯塔顿岛' },
    ring: [
      [-74.260, 40.500], [-74.220, 40.560], [-74.180, 40.640], [-74.120, 40.650],
      [-74.060, 40.620], [-74.050, 40.560], [-74.080, 40.500], [-74.160, 40.480],
      [-74.240, 40.480], [-74.260, 40.500],
    ],
  },
];

/** Chinese municipality district stems already used elsewhere in MapView. */
const CN_CITY_DISTRICTS: { city: { en: string; zh: string }; districts: DistrictLabel[] }[] = [
  {
    city: { en: 'Beijing', zh: '北京市' },
    districts: [
      { id: 'dongcheng', en: 'Dongcheng', zh: '东城区' },
      { id: 'xicheng', en: 'Xicheng', zh: '西城区' },
      { id: 'chaoyang', en: 'Chaoyang', zh: '朝阳区' },
      { id: 'fengtai', en: 'Fengtai', zh: '丰台区' },
      { id: 'shijingshan', en: 'Shijingshan', zh: '石景山区' },
      { id: 'haidian', en: 'Haidian', zh: '海淀区' },
      { id: 'mentougou', en: 'Mentougou', zh: '门头沟区' },
      { id: 'fangshan', en: 'Fangshan', zh: '房山区' },
      { id: 'tongzhou', en: 'Tongzhou', zh: '通州区' },
      { id: 'shunyi', en: 'Shunyi', zh: '顺义区' },
      { id: 'changping', en: 'Changping', zh: '昌平区' },
      { id: 'daxing', en: 'Daxing', zh: '大兴区' },
      { id: 'huairou', en: 'Huairou', zh: '怀柔区' },
      { id: 'pinggu', en: 'Pinggu', zh: '平谷区' },
      { id: 'miyun', en: 'Miyun', zh: '密云区' },
      { id: 'yanqing', en: 'Yanqing', zh: '延庆区' },
    ],
  },
  {
    city: { en: 'Shanghai', zh: '上海市' },
    districts: [
      { id: 'huangpu', en: 'Huangpu', zh: '黄浦区' },
      { id: 'xuhui', en: 'Xuhui', zh: '徐汇区' },
      { id: 'changning', en: 'Changning', zh: '长宁区' },
      { id: 'jingan', en: 'Jing\'an', zh: '静安区' },
      { id: 'putuo', en: 'Putuo', zh: '普陀区' },
      { id: 'hongkou', en: 'Hongkou', zh: '虹口区' },
      { id: 'yangpu', en: 'Yangpu', zh: '杨浦区' },
      { id: 'minhang', en: 'Minhang', zh: '闵行区' },
      { id: 'baoshan', en: 'Baoshan', zh: '宝山区' },
      { id: 'jiading', en: 'Jiading', zh: '嘉定区' },
      { id: 'pudong', en: 'Pudong', zh: '浦东新区' },
      { id: 'jinshan', en: 'Jinshan', zh: '金山区' },
      { id: 'songjiang', en: 'Songjiang', zh: '松江区' },
      { id: 'qingpu', en: 'Qingpu', zh: '青浦区' },
      { id: 'fengxian', en: 'Fengxian', zh: '奉贤区' },
      { id: 'chongming', en: 'Chongming', zh: '崇明区' },
    ],
  },
];

function pointInRing(lng: number, lat: number, ring: Ring): boolean {
  // Ray casting; ring may be open or closed.
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersect =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function normalizeCityKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/市$/, '')
    .replace(/\bcity\b/g, '')
    .trim();
}

function isNewYorkCity(cityName: string): boolean {
  const key = normalizeCityKey(cityName);
  return (
    key === 'new york' ||
    key === 'new york city' ||
    key === 'nyc' ||
    key === '纽约' ||
    key === '纽约市'
  );
}

/** Rough NYC metro box — used when reverse-geocode left the cluster as "Area N". */
export function isNewYorkCoords(lat: number, lng: number): boolean {
  return lat >= 40.48 && lat <= 40.92 && lng >= -74.28 && lng <= -73.68;
}

function cnDistrictsForCity(cityName: string): DistrictLabel[] | null {
  const key = normalizeCityKey(cityName);
  for (const entry of CN_CITY_DISTRICTS) {
    if (
      key === normalizeCityKey(entry.city.en) ||
      key === normalizeCityKey(entry.city.zh) ||
      key === normalizeCityKey(entry.city.zh.replace(/市$/, ''))
    ) {
      return entry.districts;
    }
  }
  return null;
}

/** Known district catalog for a city, if we support one. */
export function districtsForCity(
  cityName: string,
  center?: { lat: number; lng: number } | null,
): DistrictLabel[] {
  if (cityName && isNewYorkCity(cityName)) return NYC_BOROUGHS.map((b) => b.label);
  if (center && isNewYorkCoords(center.lat, center.lng)) {
    return NYC_BOROUGHS.map((b) => b.label);
  }
  if (!cityName) return [];
  return cnDistrictsForCity(cityName) ?? [];
}

/** Resolve which district a place belongs to. */
export function resolvePlaceDistrict(
  cityName: string,
  lat: number,
  lng: number,
  placeName?: string,
  cityCenter?: { lat: number; lng: number } | null,
): DistrictLabel | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const treatAsNyc =
    isNewYorkCity(cityName) ||
    isNewYorkCoords(lat, lng) ||
    (!!cityCenter && isNewYorkCoords(cityCenter.lat, cityCenter.lng));

  if (treatAsNyc) {
    for (const borough of NYC_BOROUGHS) {
      if (pointInRing(lng, lat, borough.ring)) return borough.label;
    }
    return null;
  }

  if (!cityName) return null;
  const cn = cnDistrictsForCity(cityName);
  if (!cn || !placeName) return null;
  const hay = placeName.toLowerCase();
  for (const d of cn) {
    const stemZh = d.zh.replace(/区$/, '').replace(/新区$/, '');
    if (hay.includes(d.zh.toLowerCase()) || hay.includes(stemZh.toLowerCase())) return d;
    if (hay.includes(d.en.toLowerCase())) return d;
  }
  return null;
}

export function districtDisplayName(district: DistrictLabel, lang: string): string {
  return lang.startsWith('zh') ? district.zh : district.en;
}
