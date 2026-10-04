export interface DailyArtwork {
  id: number;
  title: string;
  artist: string;
  year: string;
  imageUrl: string;
  artworkUrl: string;
}

const IIIF_BASE_URL = 'https://www.artic.edu/iiif/2';
const ARTWORK_BASE_URL = 'https://www.artic.edu/artworks';

const OPEN_ACCESS_ARTWORKS = [
  { id: 129849, title: 'Houses at Murnau', artist: 'Vasily Kandinsky', year: '1909', imageId: '3f732b69-0ae7-7d1e-ad53-e20b0cc2de72' },
  { id: 109819, title: 'Lozenge Composition', artist: 'Piet Mondrian', year: '1921', imageId: '25f660ee-f1db-d13b-42a5-56df97c98ba7' },
  { id: 8991, title: 'Improvisation No. 30 (Cannons)', artist: 'Vasily Kandinsky', year: '1913', imageId: 'b5bc6b66-9e6e-fe57-dcec-fc49e820e904' },
  { id: 90207, title: 'Movement No. 10', artist: 'Marsden Hartley', year: '1917', imageId: '768387ba-f972-b43b-39f7-98cb37dad883' },
  { id: 80586, title: 'Portrait of a Woman', artist: 'Amedeo Modigliani', year: 'c. 1917/19', imageId: 'e458fc80-cb2e-f5c0-3c81-8c24b0bdc15b' },
  { id: 65920, title: 'Provincetown', artist: 'Marsden Hartley', year: '1916', imageId: 'f534bce3-4746-cba6-6c46-c37a7c9199fb' },
  { id: 17229, title: 'The Scream', artist: 'Edvard Munch', year: '1895', imageId: '3b374643-5328-3e00-c02b-5ab56e5ae8f8' },
  { id: 27992, title: 'A Sunday on La Grande Jatte — 1884', artist: 'Georges Seurat', year: '1884–86', imageId: '2d484387-2509-5e8e-2c43-22f9981972eb' },
  { id: 28560, title: 'The Bedroom', artist: 'Vincent van Gogh', year: '1889', imageId: '6644829f-f292-c5c4-a73c-0356a6fdbf0d' },
  { id: 111436, title: 'The Basket of Apples', artist: 'Paul Cezanne', year: 'c. 1893', imageId: '52ac8996-3460-cf71-cb42-5c4d0aa29b74' },
  { id: 81537, title: 'Bordighera', artist: 'Claude Monet', year: '1884', imageId: '4d1b3ad0-14db-0d21-ad9f-17abb8bdfbb5' },
  { id: 16568, title: 'Water Lilies', artist: 'Claude Monet', year: '1906', imageId: '3c27b499-af56-f0d5-93b5-a7f2f1ad5813' },
] as const;

function localDayNumber(date: Date): number {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000);
}

export function getDailyArtwork(date: Date): DailyArtwork {
  const index = ((localDayNumber(date) % OPEN_ACCESS_ARTWORKS.length) + OPEN_ACCESS_ARTWORKS.length) % OPEN_ACCESS_ARTWORKS.length;
  const artwork = OPEN_ACCESS_ARTWORKS[index];

  return {
    id: artwork.id,
    title: artwork.title,
    artist: artwork.artist,
    year: artwork.year,
    imageUrl: `${IIIF_BASE_URL}/${artwork.imageId}/full/843,/0/default.jpg`,
    artworkUrl: `${ARTWORK_BASE_URL}/${artwork.id}`,
  };
}

