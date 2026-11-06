import type { SVGProps } from 'react';

// Line-drawn landmarks for the "Visited cities" cards, drawn on the same 24px
// grid and stroke as the lucide icons used everywhere else, so they sit in the
// same tile and pick up the card's accent colour via currentColor.

type LandmarkKey =
  | 'new-york'
  | 'beijing'
  | 'shanghai'
  | 'budapest'
  | 'paris'
  | 'london'
  | 'san-francisco'
  | 'tokyo';

const PATHS: Record<LandmarkKey, string[]> = {
  // Statue of Liberty: torch, crowned head, robe, pedestal.
  'new-york': [
    'M16.2 2.6c.9.9.9 1.9 0 2.6-.9-.7-.9-1.7 0-2.6z',
    'M13.4 10.4 16.2 5.6',
    'M11 9.6a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2z',
    'M9.2 6.6 8.3 5.4M11 6.2V4.8M12.8 6.6l.9-1.2',
    'M9.6 10.4 8.2 18h5.6l-1.4-7.6z',
    'M7 18h8v2.6H7zM5.5 20.6h11',
  ],
  // Temple of Heaven: three round roofs on a terrace.
  beijing: [
    'M12 2.5V4',
    'M8.2 6.8c1.7-1.9 5.9-1.9 7.6 0z',
    'M9.6 6.8v1.6M14.4 6.8v1.6',
    'M6.6 10.2c2.1-2.3 8.7-2.3 10.8 0z',
    'M8.4 10.2v1.8M15.6 10.2v1.8',
    'M5 14c2.6-2.5 11.4-2.5 14 0z',
    'M7.2 14v2.3M10.4 14v2.3M13.6 14v2.3M16.8 14v2.3',
    'M4.6 16.3h14.8l1.1 3H3.5z',
  ],
  // Oriental Pearl Tower: two spheres on a mast with splayed legs.
  shanghai: [
    'M12 2v3.8',
    'M12 10.6a2.4 2.4 0 1 0 0-4.8 2.4 2.4 0 0 0 0 4.8z',
    'M12 10.6v3.2M12 17v4',
    'M12 17a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2z',
    'M10.2 10 7.8 21M13.8 10l2.4 11M7 21h10',
  ],
  // Hungarian Parliament: central dome and spire between long wings.
  budapest: [
    'M12 2.5V5',
    'M9.5 9a2.5 3.6 0 0 1 5 0',
    'M9 9h6v3H9z',
    'M3 12h18v7H3z',
    'M5 12V9.6l1-1 1 1V12M17 12V9.6l1-1 1 1V12',
    'M6 15.5v1.5M9 15.5v1.5M12 15v2M15 15.5v1.5M18 15.5v1.5',
    'M2 19h20',
  ],
  // Eiffel Tower.
  paris: [
    'M12 2.5v2',
    'M10.9 4.5h2.2l1.3 6.5H9.6z',
    'M8.8 11h6.4',
    'M9.4 11 6.8 20.5M14.6 11l2.6 9.5',
    'M8.2 15.5h7.6',
    'M10 20.5a2 2 0 0 1 4 0',
  ],
  // Big Ben.
  london: [
    'M12 2.5 10 7.5h4z',
    'M9.2 7.5h5.6',
    'M10 7.5v13.5M14 7.5v13.5',
    'M12 13.6a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2z',
    'M10 16h4M8 21h8',
  ],
  // Golden Gate Bridge.
  'san-francisco': [
    'M7 20V5M17 20V5',
    'M6 7.5h2M16 7.5h2',
    'M2 9.5c2.2 0 3.6-2.2 5-4.5 2.6 6.4 7.4 6.4 10 0 1.4 2.3 2.8 4.5 5 4.5',
    'M2 15h20',
    'M10 10v5M12 10.6V15M14 10v5',
  ],
  // Mount Fuji.
  tokyo: [
    'M3 19.5 9.6 8h4.8L21 19.5z',
    'M9.6 8l1.6 2.2 .8-1 .8 1 1.6-2.2',
    'M17.5 5.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
  ],
};

const ALIASES: Record<string, LandmarkKey> = {
  'new york': 'new-york',
  'new york city': 'new-york',
  nyc: 'new-york',
  manhattan: 'new-york',
  brooklyn: 'new-york',
  queens: 'new-york',
  纽约: 'new-york',
  beijing: 'beijing',
  peking: 'beijing',
  北京: 'beijing',
  shanghai: 'shanghai',
  上海: 'shanghai',
  budapest: 'budapest',
  布达佩斯: 'budapest',
  paris: 'paris',
  巴黎: 'paris',
  london: 'london',
  伦敦: 'london',
  'san francisco': 'san-francisco',
  旧金山: 'san-francisco',
  tokyo: 'tokyo',
  东京: 'tokyo',
  东京都: 'tokyo',
};

/** Which landmark (if any) we draw for a city name, in English or Chinese. */
export function landmarkFor(cityName: string | null | undefined): LandmarkKey | null {
  const key = (cityName ?? '')
    .trim()
    .toLowerCase()
    .replace(/^city of\s+/, '')
    .replace(/市$/u, '');
  return ALIASES[key] ?? null;
}

export function CityLandmark({ landmark, size = 22, ...props }: { landmark: LandmarkKey; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      {PATHS[landmark].map(d => <path key={d} d={d} />)}
    </svg>
  );
}
