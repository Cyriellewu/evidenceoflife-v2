/**
 * Which language the speech engine listens for. It used to follow the UI
 * language, so someone with an English UI who speaks Chinese got an en-US
 * recognizer turning Chinese into nonsense. Now it is its own choice,
 * remembered per device.
 */
export const DICTATION_LANGS = ['zh-CN', 'en-US'] as const;
export type DictationLang = (typeof DICTATION_LANGS)[number];

const KEY = 'eol-dictation-lang';

const isLang = (v: unknown): v is DictationLang =>
  typeof v === 'string' && (DICTATION_LANGS as readonly string[]).includes(v);

/** First visit: Chinese if the device lists any Chinese, else the host's hint. */
export function defaultDictationLang(deviceLangs: readonly string[], hint: string): DictationLang {
  if (deviceLangs.some((l) => /^zh\b/i.test(l))) return 'zh-CN';
  return isLang(hint) ? hint : 'en-US';
}

export function readDictationLang(hint: string): DictationLang {
  try {
    const saved = localStorage.getItem(KEY);
    if (isLang(saved)) return saved;
  } catch {
    /* storage blocked */
  }
  const device = typeof navigator !== 'undefined' ? navigator.languages ?? [navigator.language] : [];
  return defaultDictationLang(device, hint);
}

export function saveDictationLang(lang: DictationLang) {
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    /* storage blocked */
  }
}

const CJK = /[\u3000-\u303f\u3400-\u9fff\uff00-\uffef]/;

/** Join two pieces of text: a space between Latin words, none next to Chinese. */
export function joinSpoken(a: string, b: string): string {
  const left = a.replace(/\s+$/, '');
  const right = b.replace(/^\s+/, '');
  if (!left) return right;
  if (!right) return left;
  const needsSpace = !CJK.test(left.slice(-1)) && !CJK.test(right[0]);
  return needsSpace ? `${left} ${right}` : `${left}${right}`;
}
