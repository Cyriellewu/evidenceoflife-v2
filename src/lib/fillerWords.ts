/**
 * Remove speech fillers from dictated text (Chinese and English).
 *
 * Conservative on purpose: a filler is only removed where it can't be part
 * of a real word or phrase.
 *  - Interjections (嗯 啊 呃 额 唔 诶 哎 哦 / um uh er erm hmm) anywhere they
 *    stand alone.
 *  - Discourse markers (那个 就是说 然后呢 / you know, I mean, like) only at
 *    the start of a clause, or set off by commas — so 这就是我, 对面, 然后去了,
 *    "I like apples" and "phone" are left alone.
 */

const ZH_INTERJECTION = '(?:嗯+|啊+|呃+|额+|唔+|诶+|哎+|哦+)';
const ZH_MARKER = '(?:就是说|然后呢|那个|这个|就是)';
const CLAUSE_START = '(^|[，。！？、,.!?；;:：\\s])';

const RULES: [RegExp, string][] = [
  // zh interjections: drop with an adjoining comma/pause
  [new RegExp(`${CLAUSE_START}${ZH_INTERJECTION}[，,、\\s]*`, 'g'), '$1'],
  [new RegExp(`[，,、]\\s*${ZH_INTERJECTION}(?=[，。！？,.!?]|$)`, 'g'), ''],
  // zh discourse markers right after a clause start, followed by a pause
  [new RegExp(`${CLAUSE_START}${ZH_MARKER}[，,、]\\s*`, 'g'), '$1'],
  // en interjections as whole words
  [/(^|[\s,.!?;:])(?:u+m+|u+h+|e+r+m*|hmm+|mm+)(?=[\s,.!?;:]|$)[,]?/gi, '$1'],
  // en markers wrapped in commas: "it was, like, fine" → "it was fine"
  [/\s*,\s*(?:you know|i mean|like|basically)\s*,\s*/gi, ' '],
  // en markers set off by commas or at clause start
  [/(^|[,.!?;:]\s*|\s)(?:you know|i mean|like|basically|so yeah)\s*,\s*/gi, '$1'],
  [/,\s*(?:you know|i mean|like)\s*(?=[,.!?]|$)/gi, ''],
];

export function cleanFillerWords(text: string): string {
  let out = text;
  for (let i = 0; i < 2; i++) {
    for (const [re, rep] of RULES) out = out.replace(re, rep);
  }
  out = out
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.!?，。！？])/g, '$1')
    .replace(/([，,])\s*([，,。.!?！？])/g, '$2')
    .replace(/^[\s，,、]+/, '')
    .trim();
  // Re-capitalise only when a filler was cut from the very start.
  const original = text.trim();
  if (out && original && out.charAt(0) !== original.charAt(0)) {
    out = out.replace(/^([a-z])/, (m) => m.toUpperCase());
  }
  return out;
}
