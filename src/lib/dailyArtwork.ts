export interface DailyArtwork {
  id: number;
  title: string;
  artist: string;
  date: string;
  imageUrl: string;
  artworkUrl: string;
}

export const DAILY_ARTWORKS: readonly DailyArtwork[] = [
  {
    id: 156571,
    title: 'God of War',
    artist: 'Paul Klee',
    date: '1937',
    imageUrl: 'https://openaccess-cdn.clevelandart.org/1992.278/1992.278_web.jpg',
    artworkUrl: 'https://clevelandart.org/art/1992.278',
  },
  {
    id: 136592,
    title: 'Tightrope Walker',
    artist: 'Paul Klee',
    date: '1923',
    imageUrl: 'https://openaccess-cdn.clevelandart.org/1961.154/1961.154_web.jpg',
    artworkUrl: 'https://clevelandart.org/art/1961.154',
  },
  {
    id: 143278,
    title: 'Composition with Red, Yellow, and Blue',
    artist: 'Piet Mondrian',
    date: '1927',
    imageUrl: 'https://openaccess-cdn.clevelandart.org/1967.215/1967.215_web.jpg',
    artworkUrl: 'https://clevelandart.org/art/1967.215',
  },
  {
    id: 146023,
    title: 'Field with Young Trees in the Foreground',
    artist: 'Piet Mondrian',
    date: 'c. 1907',
    imageUrl: 'https://openaccess-cdn.clevelandart.org/1971.220/1971.220_web.jpg',
    artworkUrl: 'https://clevelandart.org/art/1971.220',
  },
  {
    id: 135382,
    title: 'The Red Kerchief',
    artist: 'Claude Monet',
    date: 'c. 1868–73',
    imageUrl: 'https://openaccess-cdn.clevelandart.org/1958.39/1958.39_web.jpg',
    artworkUrl: 'https://clevelandart.org/art/1958.39',
  },
  {
    id: 136510,
    title: 'Water Lilies (Agapanthus)',
    artist: 'Claude Monet',
    date: 'c. 1915–26',
    imageUrl: 'https://openaccess-cdn.clevelandart.org/1960.81/1960.81_web.jpg',
    artworkUrl: 'https://clevelandart.org/art/1960.81',
  },
  {
    id: 135420,
    title: 'Morning Glory with Black',
    artist: "Georgia O'Keeffe",
    date: '1926',
    imageUrl: 'https://openaccess-cdn.clevelandart.org/1958.42/1958.42_web.jpg',
    artworkUrl: 'https://clevelandart.org/art/1958.42',
  },
  {
    id: 172784,
    title: 'White Flower',
    artist: "Georgia O'Keeffe",
    date: '1929',
    imageUrl: 'https://openaccess-cdn.clevelandart.org/1930.2162/1930.2162_web.jpg',
    artworkUrl: 'https://clevelandart.org/art/1930.2162',
  },
  {
    id: 135705,
    title: 'Mother and Child',
    artist: 'Koshiro Onchi',
    date: 'c. 1915–55',
    imageUrl: 'https://openaccess-cdn.clevelandart.org/1959.240/1959.240_web.jpg',
    artworkUrl: 'https://clevelandart.org/art/1959.240',
  },
] as const;

function dateHash(date: string) {
  let hash = 0;
  for (let index = 0; index < date.length; index += 1) {
    hash = (hash * 31 + date.charCodeAt(index)) >>> 0;
  }
  return hash;
}

export function getDailyArtwork(date: string, offset = 0): DailyArtwork {
  const index = (dateHash(date) + offset) % DAILY_ARTWORKS.length;
  return DAILY_ARTWORKS[index];
}

export function isMuseumArtworkUrl(url: string) {
  return url.startsWith('https://openaccess-cdn.clevelandart.org/');
}

export function isLegacyKeyedMapImageUrl(url: string | null | undefined) {
  if (!url) return false;
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return hostname === 'tomtom.com' || hostname.endsWith('.tomtom.com');
  } catch {
    return url.toLowerCase().includes('tomtom.com');
  }
}
