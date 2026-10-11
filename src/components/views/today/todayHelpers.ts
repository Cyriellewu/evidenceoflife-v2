import { ImportedEvent } from '@/hooks/useImportedEvents';

export const DETAIL_SEPARATOR = '\n---DETAIL---\n';

export function uniquePhotoList(photos: string[]): string[] {
  return Array.from(new Set(photos.filter(photo => typeof photo === 'string' && photo.trim().length > 0)));
}

export function moveIsoToDateKeepingLocalTime(isoString: string | null | undefined, newDate: string): string | null {
  if (!isoString) return null;
  const original = new Date(isoString);
  if (Number.isNaN(original.getTime())) return null;
  const hh = String(original.getHours()).padStart(2, '0');
  const mm = String(original.getMinutes()).padStart(2, '0');
  const ss = String(original.getSeconds()).padStart(2, '0');
  return new Date(`${newDate}T${hh}:${mm}:${ss}`).toISOString();
}

export function localTimeOnDateISO(dateStr: string, timeStr: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr) || !/^\d{2}:\d{2}$/.test(timeStr)) return null;
  const next = new Date(`${dateStr}T${timeStr}:00`);
  return Number.isFinite(next.getTime()) ? next.toISOString() : null;
}

export function durationSeconds(startISO: string, endISO: string): number {
  return Math.max(0, Math.floor((new Date(endISO).getTime() - new Date(startISO).getTime()) / 1000));
}

/** Local `yyyy-MM-dd` for a Date (no UTC shift). */
function localDateKey(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Build a robust start/end timer span from two `HH:mm` clock strings.
 *
 * Why this exists: a focus session can be started one day and stopped the
 * next — e.g. a user starts a timer at 23:30 and forgets to stop it until
 * 09:30 the following morning. Naively attaching both clock times to a single
 * calendar date yields an end that lands *before* the start (23:30 → 09:30 on
 * the same day), which corrupts the duration and pushes the start into the
 * future, leaving the task stuck in an un-resumable state.
 *
 * Rules:
 *  - The start anchors to the calendar date of `anchorISO` when it is a valid
 *    timestamp (the real moment the timer began); otherwise it falls back to
 *    `fallbackDateStr` (the contextual day being viewed).
 *  - The end normally shares the start's date, but when its clock time is
 *    strictly before the start's it rolls forward to the next calendar day,
 *    correctly modelling an overnight session.
 *
 * Returns `null` when the inputs cannot form a valid span.
 */
export function buildTimerSpanISO(
  startTime: string,
  endTime: string,
  opts: { anchorISO?: string | null; fallbackDateStr: string }
): { startISO: string; endISO: string; seconds: number } | null {
  let startDateStr = opts.fallbackDateStr;
  if (opts.anchorISO) {
    const anchor = new Date(opts.anchorISO);
    if (!Number.isNaN(anchor.getTime())) startDateStr = localDateKey(anchor);
  }

  const startISO = localTimeOnDateISO(startDateStr, startTime);
  if (!startISO) return null;
  let endISO = localTimeOnDateISO(startDateStr, endTime);
  if (!endISO) return null;

  // Overnight: an end clock time strictly before the start belongs to the next
  // day. Equal times stay a zero-length span rather than rolling a full 24h.
  if (new Date(endISO).getTime() < new Date(startISO).getTime()) {
    const nextDay = new Date(`${startDateStr}T00:00:00`);
    nextDay.setDate(nextDay.getDate() + 1);
    const rolled = localTimeOnDateISO(localDateKey(nextDay), endTime);
    if (!rolled) return null;
    endISO = rolled;
  }

  return { startISO, endISO, seconds: durationSeconds(startISO, endISO) };
}

export function getImportedEventEffectiveStart(event: ImportedEvent): string {
  return event.timer_started_at || event.start_time;
}

export function getImportedEventEffectiveEnd(event: ImportedEvent): string | null {
  return event.timer_ended_at || event.end_time;
}

/** Parse text that may contain a subtitle/detail separator */
export function parseSubtitleDetail(text?: string | null): { subtitle: string; detail: string | null } {
  if (!text) return { subtitle: '', detail: null };
  const idx = text.indexOf(DETAIL_SEPARATOR);
  if (idx === -1) return { subtitle: text, detail: null };
  return { subtitle: text.substring(0, idx), detail: text.substring(idx + DETAIL_SEPARATOR.length) };
}

/** Check if text is long enough to warrant auto-summarization */
export function shouldSummarize(text: string): boolean {
  return text.trim().length > 60;
}

export function cleanDetailText(text: string): string {
  return text
    .replace(/\r/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[，、。！？,.!?]*\s*(呃|啊|嗯|那个|然后呢|就是说|对吧|嘛|吧|呢|哦|哈|嘿|喂|额|唔|诶|哎)\s*/gi, ' ')
    .replace(/\s+([,.!?，。！？])/g, '$1')
    .trim();
}

export function lightlyPolishRecapText(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;

  let polished = trimmed
    .replace(/\bi\b/g, 'I')
    .replace(/\bim\b/gi, "I'm")
    .replace(/\bidk\b/gi, "I don't know")
    .replace(/\bdont\b/gi, "don't")
    .replace(/\bcant\b/gi, "can't")
    .replace(/\bwont\b/gi, "won't")
    .replace(/\bdoesnt\b/gi, "doesn't")
    .replace(/\bdidnt\b/gi, "didn't")
    .replace(/\bisnt\b/gi, "isn't")
    .replace(/\barent\b/gi, "aren't")
    .replace(/\bwasnt\b/gi, "wasn't")
    .replace(/\bwerent\b/gi, "weren't")
    .replace(/\bive\b/gi, "I've")
    .replace(/\bill\b/gi, "I'll")
    .replace(/\bthats\b/gi, "that's")
    .replace(/\btheres\b/gi, "there's")
    .replace(/\bwhats\b/gi, "what's")
    .replace(/\bcuz\b/gi, "because")
    .replace(/\bwanna\b/gi, "want to")
    .replace(/\bgonna\b/gi, "going to")
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.!?;:])/g, '$1');

  polished = polished.replace(/(^|[.!?]\s+)([a-z])/g, (_, prefix: string, letter: string) => {
    return `${prefix}${letter.toUpperCase()}`;
  });

  if (/[A-Za-z]$/.test(polished) && !/[.!?]$/.test(polished)) {
    polished += '.';
  }

  return polished;
}

export function buildLocalSummary(text: string): { title: string; detail: string | null } {
  const original = text.trim();
  const cleaned = cleanDetailText(text);
  if (!cleaned) return { title: original, detail: null };

  const withoutBullets = cleaned.replace(/^[-*•\d.)\s]+/, '').trim();
  const chunks = withoutBullets
    .split(/(?<=[。！？.!?])\s+|(?<=;)\s+|\n+/)
    .map(part => part.trim())
    .filter(Boolean);

  const clauseCandidates = withoutBullets
    .split(/[，,、]+/)
    .map(part => part.trim())
    .filter(Boolean);

  const boringLeadPattern = /^(very|really|so|super|quite|pretty|kind of|sort of|interesting|nice|cool|fun|great|amazing|wow|honestly|basically|actually|today|tonight|just|and then|then)\b/i;
  const actionPattern = /\b(went|met|found|fixed|finished|submitted|called|talked|learned|noticed|realized|discovered|visited|started|stopped|watched|worked|wrote|made|cooked|cleaned|bought|got|prepared|showed|moved|booked)\b/i;
  const chineseActionPattern = /(去了|见了|认识了|发现了|修好了|完成了|提交了|打了电话|聊了|学到了|注意到|意识到|看了|做了|写了|买了|准备了|搬了|预约了)/;

  const normalizedClauses = clauseCandidates
    .map(clause => clause
      .replace(/^when\s+/i, '')
      .replace(/^while\s+/i, '')
      .replace(/^I first (knew|know) that\s+/i, '')
      .replace(/^I realized that\s+/i, '')
      .replace(/^I found that\s+/i, '')
      .replace(/^there(?:'s| is)\s+/i, '')
      .replace(/^(today|tonight|just|actually|basically|so|then|and)\s+/i, '')
      .replace(/^(今天|刚刚|就是|然后|所以)\s*/g, '')
      .trim())
    .filter(Boolean);

  const pickedClause =
    normalizedClauses.find(clause => !boringLeadPattern.test(clause) && (actionPattern.test(clause) || chineseActionPattern.test(clause))) ||
    normalizedClauses.find(clause => !boringLeadPattern.test(clause) && clause.length >= 12) ||
    normalizedClauses[0] ||
    chunks[0] ||
    withoutBullets;

  let normalizedTitle = pickedClause
    .replace(/^I\s+/i, '')
    .replace(/^I'm\s+/i, '')
    .replace(/^we\s+/i, '')
    .replace(/^there(?:'s| is)\s+/i, '')
    .trim();

  if (/playground next to my apt/i.test(normalizedTitle)) {
    normalizedTitle = 'Found a playground next to my apartment';
  }

  if (/mayors event/i.test(normalizedTitle)) {
    normalizedTitle = normalizedTitle.replace(/mayors event/i, "mayor's event");
  }

  if (/^[a-z]/.test(normalizedTitle)) {
    normalizedTitle = normalizedTitle.charAt(0).toUpperCase() + normalizedTitle.slice(1);
  }

  const maxTitleLen = /[\u4e00-\u9fff]/.test(normalizedTitle) ? 24 : 48;
  let title = normalizedTitle;
  if (title.length > maxTitleLen) {
    title = `${title.slice(0, maxTitleLen).trim()}…`;
  }
  if (!title) {
    title = withoutBullets.slice(0, maxTitleLen).trim();
  }

  return {
    title,
    detail: title !== original ? original : null,
  };
}

export function isStandaloneUrl(text: string): boolean {
  const trimmed = text.trim();
  return /^https?:\/\/[^\s]+$/i.test(trimmed);
}

export function formatReplayDuration(totalMinutes: number, lang: string): string {
  const hrs = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (lang === 'zh') {
    if (hrs > 0 && mins > 0) return `${hrs}小时${mins}分钟`;
    if (hrs > 0) return `${hrs}小时`;
    return `${mins}分钟`;
  }
  if (hrs > 0 && mins > 0) return `${hrs}h ${mins}m`;
  if (hrs > 0) return `${hrs}h`;
  return `${mins}m`;
}

export function cleanReplayTitle(rawTitle: string): string {
  const { subtitle } = parseSubtitleDetail(rawTitle);
  let title = subtitle
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^(?:[😀-🙏]|✨|🌟|⭐️|🔥|🎉|💡|📍|⏱|📝)+/u, '')
    .replace(/^(very|really|so|super|quite|pretty|interesting|nice|cool|fun|great|amazing|wow|honestly|basically|actually)\s*,?\s*/i, '')
    .replace(/^I\s+/i, '')
    .replace(/^I'm\s+/i, '')
    .replace(/^when\s+/i, '')
    .replace(/^went to\s+/i, 'Went to ')
    .replace(/^showing\s+/i, 'Showing ')
    .replace(/^showing her around my apt/i, 'Showed her around my apartment')
    .replace(/^there(?:'s| is)\s+/i, '')
    .replace(/mayors event/gi, "mayor's event")
    .replace(/\s+([,.!?])/g, '$1')
    .trim();

  if (!title) return '';
  title = title.replace(/[,.!?]+$/, '').trim();
  if (/^[a-z]/.test(title)) {
    title = title.charAt(0).toUpperCase() + title.slice(1);
  }
  return title;
}

export function buildLocalLifeReplay(
  events: { time: string; title: string; duration?: string }[],
  lang: string
): string | null {
  if (events.length < 3) return null;

  const cleaned = events
    .map(event => ({
      ...event,
      title: cleanReplayTitle(event.title),
    }))
    .filter(event => event.title.length > 0);

  if (cleaned.length < 3) return null;

  const first = cleaned[0];
  const middle = cleaned[Math.floor(cleaned.length / 2)];
  const last = cleaned[cleaned.length - 1];
  const totalMoments = cleaned.length;
  const totalMinutes = cleaned.reduce((sum, event) => {
    const match = event.duration?.match(/(\d+)m/i);
    return sum + (match ? Number(match[1]) : 0);
  }, 0);
  const timeHint = totalMinutes > 0 ? formatReplayDuration(totalMinutes, lang) : null;

  const middleFragments = cleaned
    .slice(1, -1)
    .map(event => event.title)
    .filter((title, index, arr) => arr.indexOf(title) === index)
    .slice(0, 2);

  if (lang === 'zh') {
    const fragments = [
      `${first.time}从「${first.title}」开始`,
      middleFragments.length > 0 ? `中间经过「${middleFragments.join('」和「')}」` : `中间还记录了「${middle.title}」`,
      `最后落在「${last.title}」`,
    ];
    if (timeHint) fragments.push(`总共活跃了大约 ${timeHint}`);
    return `今天一共串起了 ${totalMoments} 个片段，${fragments.join('，')}。`;
  }

  const fragments = [
    `You started with ${first.title} at ${first.time}`,
    middleFragments.length > 0 ? `moved through ${middleFragments.join(' and ')}` : `moved through ${middle.title}`,
    `and wrapped with ${last.title}`,
  ];
  if (timeHint) fragments.push(`for about ${timeHint} of active time`);
  return `${fragments.join(', ')} across ${totalMoments} moments today.`;
}

// Quiet sign-off under the day's recap. Past dates read as "that day".
export function buildRecapClosing(lang: string, isToday: boolean): string {
  if (lang === 'zh') return isToday ? '这就是今天——你活过的证据。' : '这就是那一天——你活过的证据。';
  return isToday ? "That's today. Proof you were here." : 'That was the day. Proof you were here.';
}

// Empty-today nudge when yesterday has moments. No counts on purpose: it should
// read as a thread to pick up, not a streak to keep.
export function buildYesterdayNudge(lang: string): string {
  return lang === 'zh'
    ? '昨天留下了痕迹。今天的第一个瞬间是什么？'
    : "Yesterday left a trail. What's today's first moment?";
}
