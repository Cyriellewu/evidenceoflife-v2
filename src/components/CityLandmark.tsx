import type { ReactNode } from 'react';

// Small editorial "postcards" for the Visited cities cards: a flat ivory panel
// and a few muted colour blocks that recall each city's landmark, rather than
// a literal drawing. Colours are taken from the landmarks themselves
// (verdigris Liberty, Temple of Heaven blue and red, Golden Gate orange…).

type LandmarkKey =
  | 'new-york'
  | 'beijing'
  | 'shanghai'
  | 'budapest'
  | 'paris'
  | 'london'
  | 'san-francisco'
  | 'tokyo';

const IVORY = '#F3F0E8';

const ART: Record<LandmarkKey, ReactNode> = {
  // Statue of Liberty: verdigris figure, amber torch, stone pedestal, harbour line.
  'new-york': (
    <>
      <path d="M21.5 15.5 Q24 14 26.5 15.5 L28 31 H20 Z" fill="#7FA79A" />
      <path d="M26 17 L30.5 9.5" stroke="#7FA79A" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="31" cy="8.2" r="1.9" fill="#D9A441" />
      <circle cx="24" cy="13" r="2.4" fill="#7FA79A" />
      <rect x="18.5" y="31" width="11" height="5" rx="0.8" fill="#BCAE97" />
      <path d="M9 38.5 H39" stroke="#5E6B78" strokeWidth="1" strokeLinecap="round" />
    </>
  ),
  // Temple of Heaven: three stacked blue roofs, red drums, gold finial, white terrace.
  beijing: (
    <>
      <circle cx="24" cy="10.2" r="1.4" fill="#C9A24A" />
      <path d="M17.5 16 Q24 10 30.5 16 Z" fill="#3F5A7A" />
      <rect x="19" y="16" width="10" height="2.4" fill="#A8453A" />
      <path d="M14.5 22.5 Q24 15.5 33.5 22.5 Z" fill="#3F5A7A" />
      <rect x="16.5" y="22.5" width="15" height="2.6" fill="#A8453A" />
      <path d="M11.5 29.5 Q24 21.5 36.5 29.5 Z" fill="#3F5A7A" />
      <rect x="14" y="29.5" width="20" height="3" fill="#A8453A" />
      <path d="M10 35 H38 M12 38 H36" stroke="#CFC6B4" strokeWidth="1.6" strokeLinecap="round" />
    </>
  ),
  // Oriental Pearl Tower: two pink pearls on a mast, Huangpu river below.
  shanghai: (
    <>
      <path d="M24 6 V36" stroke="#6E6A74" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="24" cy="15" r="4.6" fill="#C46A86" />
      <circle cx="24" cy="27" r="3" fill="#C46A86" />
      <path d="M20.5 18.5 L16 37 M27.5 18.5 L32 37" stroke="#9E98A2" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M8 39 Q24 37 40 39" stroke="#7E9BB3" strokeWidth="1.6" strokeLinecap="round" fill="none" />
    </>
  ),
  // Parliament: long cream façade, red dome, Danube in front.
  budapest: (
    <>
      <path d="M19 22 Q24 12 29 22 Z" fill="#9E4A3C" />
      <path d="M24 12.5 V8" stroke="#9E4A3C" strokeWidth="1.2" strokeLinecap="round" />
      <rect x="8" y="22" width="32" height="9" rx="0.6" fill="#D8C7A6" />
      <path d="M11 22 V18.5 M37 22 V18.5" stroke="#9E4A3C" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M8 35 H40" stroke="#6F8FA8" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  // Eiffel Tower: bronze taper with the arch as negative space.
  paris: (
    <>
      <path d="M22.6 7 H25.4 L33 38 H27.5 Q24 30 20.5 38 H15 Z" fill="#8A6A52" />
      <path d="M18.5 24 H29.5" stroke={IVORY} strokeWidth="1.4" />
      <circle cx="35" cy="11" r="2.2" fill="#D9B48A" />
    </>
  ),
  // Big Ben: tall stone tower, gold clock face.
  london: (
    <>
      <path d="M24 6 L27 13 H21 Z" fill="#6C6458" />
      <rect x="20.5" y="13" width="7" height="25" fill="#C2A77F" />
      <circle cx="24" cy="18.5" r="2.4" fill="#E2C46B" />
      <path d="M12 38.5 H36" stroke="#7E8C96" strokeWidth="1" strokeLinecap="round" />
    </>
  ),
  // Golden Gate: two International Orange towers, sagging cable, fog band.
  'san-francisco': (
    <>
      <rect x="6" y="27" width="36" height="5" fill="#E3E0DA" />
      <rect x="15" y="12" width="2.6" height="24" fill="#C0533A" />
      <rect x="30.4" y="12" width="2.6" height="24" fill="#C0533A" />
      <path d="M6 22 Q11 20 16.3 12.5 Q24 27 31.7 12.5 Q37 20 42 22" stroke="#C0533A" strokeWidth="1.2" fill="none" strokeLinecap="round" />
      <path d="M6 30 H42" stroke="#C0533A" strokeWidth="1.6" strokeLinecap="round" />
    </>
  ),
  // Mount Fuji: blue-grey cone, snow cap, red sun.
  tokyo: (
    <>
      <circle cx="33" cy="13" r="4" fill="#C8553D" />
      <path d="M7 37 L20 17 H28 L41 37 Z" fill="#5F7690" />
      <path d="M20 17 H28 L30.5 21 L27 19.8 L24 22 L21 19.8 L17.5 21 Z" fill="#FFFFFF" />
    </>
  ),
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

/** A square ivory postcard; the caller sets its size and corner radius. */
export function CityLandmark({ landmark, className }: { landmark: LandmarkKey; className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <rect width="48" height="48" fill={IVORY} />
      {ART[landmark]}
    </svg>
  );
}
