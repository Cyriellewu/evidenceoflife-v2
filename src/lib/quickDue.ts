import { addDays, endOfMonth, format, nextMonday } from 'date-fns';
import { parseDateFromText } from '@/lib/parseDateFromText';

/**
 * Quick-add for deadlines: pull a due date out of everyday phrasing so a user
 * can type "周五交论文" or "pay rent tomorrow 5pm" and press Enter.
 * Pure and clock-injected so it is easy to test.
 */
export interface QuickDue {
  title: string;
  /** yyyy-MM-dd, or null when no date was found. */
  date: string | null;
  /** HH:mm; defaults to end of day when only a date was given. */
  time: string;
}

const ZH_WEEKDAY: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 0, 天: 0 };
const EN_WEEKDAY: Record<string, number> = {
  sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6,
};
const ZH_NUM: Record<string, number> = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };

const ymd = (d: Date) => format(d, 'yyyy-MM-dd');
const pad = (n: number) => String(n).padStart(2, '0');

/** Next date (today counts) falling on `weekday`; `nextWeek` jumps to the following week. */
function onWeekday(now: Date, weekday: number, nextWeek: boolean): Date {
  if (nextWeek) {
    const monday = nextMonday(now);
    return addDays(monday, (weekday + 6) % 7);
  }
  const diff = (weekday - now.getDay() + 7) % 7;
  return addDays(now, diff);
}

function cleanup(text: string): string {
  return text
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,，、:：-]+|[\s,，、:：-]+$/g, '')
    // The date was cut out, so drop the word that pointed at it:
    // "renew passport by Dec 1" → "renew passport", not "renew passport by".
    .replace(/\s+(by|due|on|before|until|at)$/i, '')
    .trim();
}

function takeTime(text: string): { rest: string; time: string | null } {
  // 下午3点半 / 晚上8点 / 3点 / 15:30 / 5pm / 5:30 pm
  const zh = text.match(/(早上|上午|中午|下午|傍晚|晚上|今晚)?\s*(\d{1,2}|[一二两三四五六七八九十]{1,2})\s*点\s*(半|(\d{1,2})\s*分?)?/);
  if (zh) {
    let hour = /\d/.test(zh[2]) ? Number(zh[2]) : (zh[2].length === 2 ? 10 + (ZH_NUM[zh[2][1]] ?? 0) : ZH_NUM[zh[2]] ?? 0);
    const minute = zh[3] === '半' ? 30 : zh[4] ? Number(zh[4]) : 0;
    if (zh[1] && /下午|傍晚|晚上|今晚/.test(zh[1]) && hour < 12) hour += 12;
    if (zh[1] === '中午' && hour < 11) hour += 12;
    if (hour <= 23 && minute <= 59) {
      const keep = zh[1] === '今晚' ? '今晚' : '';
      return { rest: text.replace(zh[0], keep), time: `${pad(hour)}:${pad(minute)}` };
    }
  }
  const en = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i) ?? text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (en) {
    let hour = Number(en[1]);
    const minute = en[2] ? Number(en[2]) : 0;
    const ampm = en[3]?.toLowerCase();
    if (ampm === 'pm' && hour < 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;
    if (hour <= 23) return { rest: text.replace(en[0], ''), time: `${pad(hour)}:${pad(minute)}` };
  }
  return { rest: text, time: null };
}

export function parseQuickDue(raw: string, now: Date = new Date()): QuickDue {
  const input = raw.trim();
  const { rest, time: explicitTime } = takeTime(input);
  let text = rest;
  let date: Date | null = null;
  let defaultTime = '23:59';

  const rules: Array<[RegExp, (m: RegExpMatchArray) => Date]> = [
    [/今晚|tonight/i, () => { defaultTime = '21:00'; return now; }],
    [/今天|today/i, () => now],
    [/大后天/, () => addDays(now, 3)],
    [/后天|day after tomorrow/i, () => addDays(now, 2)],
    [/明天|明早|明晚|tomorrow|tmr/i, () => addDays(now, 1)],
    [/(下|下个)(?:周|星期|礼拜)([一二三四五六日天])/, m => onWeekday(now, ZH_WEEKDAY[m[2]], true)],
    [/(?:这|本)?(?:周|星期|礼拜)([一二三四五六日天])/, m => onWeekday(now, ZH_WEEKDAY[m[1]], false)],
    [/\bnext\s+(sun|mon|tues?|wed|thu(?:rs?)?|fri|sat)[a-z]*\b/i, m => onWeekday(now, EN_WEEKDAY[m[1].toLowerCase()], true)],
    [/\b(?:on\s+|this\s+)?(sun|mon|tues?|wed|thu(?:rs?)?|fri|sat)(?:day|nesday|urday|sday)?\b/i, m => onWeekday(now, EN_WEEKDAY[m[1].toLowerCase()], false)],
    [/(?:这|本)?周末|this weekend|weekend/i, () => onWeekday(now, 6, false)],
    [/下周|下星期|next week/i, () => nextMonday(now)],
    [/(\d{1,2}|[一二两三四五六七八九十])\s*天(?:后|之后|内)/, m => addDays(now, /\d/.test(m[1]) ? Number(m[1]) : ZH_NUM[m[1]])],
    [/\bin\s+(\d{1,2})\s+days?\b/i, m => addDays(now, Number(m[1]))],
    [/月底|end of (?:the )?month/i, () => endOfMonth(now)],
  ];

  for (const [re, toDate] of rules) {
    const m = text.match(re);
    if (m) {
      date = toDate(m);
      text = text.replace(m[0], ' ');
      break;
    }
  }

  if (!date) {
    // Explicit dates ("11/13", "Nov 13 5pm") reuse the shared parser.
    const explicit = parseDateFromText(text);
    if (explicit.parsedDate) {
      const [d, t] = explicit.parsedDate.split('T');
      return { title: cleanup(explicit.cleanTitle) || cleanup(text), date: d, time: explicitTime ?? t?.slice(0, 5) ?? '23:59' };
    }
  }

  const title = cleanup(text.replace(/\b(?:by|due|on|at)\s*$/i, '').replace(/^(?:要|得|记得)?在?\s*/, ''));
  return { title: title || cleanup(input), date: date ? ymd(date) : null, time: explicitTime ?? defaultTime };
}
