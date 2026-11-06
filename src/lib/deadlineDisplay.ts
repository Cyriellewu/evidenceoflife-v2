import { differenceInCalendarDays, differenceInMinutes, format, parseISO } from 'date-fns';

/** Soft circle colours for deadline icons (light / dark). */
export const DEADLINE_TONES = {
  coral: 'bg-[#FFE7E0] dark:bg-[#4A2A22]',
  violet: 'bg-[#ECE9FE] dark:bg-[#2E2A4A]',
  amber: 'bg-[#FDF1D6] dark:bg-[#3F3420]',
  teal: 'bg-[#DDF4F1] dark:bg-[#1F3A37]',
  blue: 'bg-[#E5F0FF] dark:bg-[#1F2C40]',
} as const;
export type DeadlineTone = keyof typeof DEADLINE_TONES;

const ICON_RULES: Array<[RegExp, string, DeadlineTone]> = [
  [/论文|作业|报告|essay|paper|report|homework|assignment|thesis|写/i, '📝', 'coral'],
  [/考试|复习|exam|quiz|test|midterm|final/i, '📚', 'violet'],
  [/邮件|回复|email|mail|reply/i, '✉️', 'violet'],
  [/房租|租|水电|账单|付款|交费|缴费|rent|bill|pay|invoice|tax|税/i, '🏠', 'amber'],
  [/护照|签证|机票|航班|旅行|passport|visa|flight|trip|travel/i, '✈️', 'blue'],
  [/报名|申请|面试|apply|application|register|sign up|interview/i, '🎤', 'teal'],
  [/会|meeting|call|电话/i, '📞', 'teal'],
  [/医生|医院|牙|药|doctor|dentist|clinic|med/i, '🩺', 'blue'],
  [/生日|礼物|birthday|gift/i, '🎁', 'coral'],
];

export function pickDeadlineIcon(title: string): { emoji: string; tone: DeadlineTone } {
  for (const [re, emoji, tone] of ICON_RULES) if (re.test(title)) return { emoji, tone };
  return { emoji: '📌', tone: 'amber' };
}

export type DeadlineBucket = 'today' | 'week' | 'later' | 'none';

export function deadlineBucket(dueDate: string | null, now: Date = new Date()): DeadlineBucket {
  if (!dueDate) return 'none';
  const days = differenceInCalendarDays(parseISO(dueDate), now);
  if (days <= 0) return 'today'; // overdue counts as today: it needs doing now
  if (days <= 7) return 'week';
  return 'later';
}

/** "23:59 · 还剩 6 小时" / "周六 · 还有 1 天" / "已过期 2 天". */
export function describeDeadline(dueDate: string, lang: string, now: Date = new Date()): { text: string; urgent: boolean } {
  const due = parseISO(dueDate);
  const zh = lang === 'zh';
  const mins = differenceInMinutes(due, now);
  const days = differenceInCalendarDays(due, now);
  const weekdayZh = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][due.getDay()];
  const when = days === 0
    ? format(due, 'HH:mm')
    : days > 0 && days <= 6
      ? (zh ? weekdayZh : format(due, 'EEE'))
      : (zh ? format(due, 'M月d日') : format(due, 'MMM d'));

  if (mins < 0) {
    const late = Math.max(1, Math.round(-mins / 60));
    const lateText = late < 24
      ? (zh ? `已过期 ${late} 小时` : `${late}h overdue`)
      : (zh ? `已过期 ${Math.round(late / 24)} 天` : `${Math.round(late / 24)}d overdue`);
    return { text: `${when} · ${lateText}`, urgent: true };
  }
  if (mins < 60) return { text: `${when} · ${zh ? `还剩 ${mins} 分钟` : `${mins} min left`}`, urgent: true };
  if (mins < 24 * 60) {
    const h = Math.round(mins / 60);
    return { text: `${when} · ${zh ? `还剩 ${h} 小时` : `${h}h left`}`, urgent: true };
  }
  return { text: `${when} · ${zh ? `还有 ${days} 天` : `${days} day${days === 1 ? '' : 's'} left`}`, urgent: false };
}
