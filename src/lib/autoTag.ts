/**
 * Local rule-based task classification.
 * Uses weighted phrase matching instead of external APIs.
 */

export type Category =
  | 'study'
  | 'work'
  | 'admin'
  | 'life'
  | 'health'
  | 'event'
  | 'social'
  | 'finance'
  | 'travel'
  | 'shopping';

type Rule = {
  tag: Category;
  pattern: string | RegExp;
  weight: number;
};

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[()\-_/\\.,:;!?[\]{}"'`~@#$%^&*+=|<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compactTitle(title: string): string {
  return normalizeTitle(title).replace(/\s+/g, '');
}

const LATIN = /^[a-z0-9 ]+$/;

// English keywords must match whole words ("trip" must not fire on
// "stripe", "run" not on "brunch"); a trailing s/es plural is allowed.
// CJK keywords have no spaces between words, so they stay substring matches.
function matchesWord(normalized: string, word: string): boolean {
  const escaped = word.replace(/\s+/g, '\\s+');
  return new RegExp(`(?<![a-z0-9])${escaped}(?:e?s)?(?![a-z0-9])`).test(normalized);
}

/** Wrap an alternation so its Latin alternatives only match whole words. */
const W = (alternatives: string) => `(?<![a-z0-9])(?:${alternatives})(?![a-z0-9])`;

const RULES: Rule[] = [
  { tag: 'study', pattern: '作业', weight: 10 },
  { tag: 'study', pattern: '写作业', weight: 12 },
  { tag: 'study', pattern: 'homework', weight: 10 },
  { tag: 'study', pattern: 'hw', weight: 9 },
  { tag: 'study', pattern: 'assignment', weight: 10 },
  { tag: 'study', pattern: 'problem set', weight: 10 },
  { tag: 'study', pattern: 'pset', weight: 10 },
  { tag: 'study', pattern: 'essay', weight: 8 },
  { tag: 'study', pattern: 'paper', weight: 8 },
  { tag: 'study', pattern: 'thesis', weight: 10 },
  { tag: 'study', pattern: 'research', weight: 8 },
  { tag: 'study', pattern: 'lab', weight: 6 },
  { tag: 'study', pattern: 'lecture notes', weight: 8 },
  { tag: 'study', pattern: 'course', weight: 8 },
  { tag: 'study', pattern: 'quiz', weight: 8 },
  { tag: 'study', pattern: 'exam', weight: 10 },
  { tag: 'study', pattern: 'midterm', weight: 10 },
  { tag: 'study', pattern: 'final', weight: 10 },
  { tag: 'study', pattern: 'aml', weight: 11 },
  { tag: 'study', pattern: 'nlp', weight: 11 },
  { tag: 'study', pattern: 'machine learning', weight: 11 },
  { tag: 'study', pattern: 'deep learning', weight: 11 },
  { tag: 'study', pattern: 'recitation', weight: 8 },
  { tag: 'study', pattern: 'syllabus', weight: 8 },
  { tag: 'study', pattern: 'review', weight: 6 },
  { tag: 'study', pattern: 'study', weight: 6 },
  { tag: 'study', pattern: 'learn', weight: 5 },
  { tag: 'study', pattern: 'notes', weight: 5 },
  { tag: 'study', pattern: '刷题', weight: 10 },
  { tag: 'study', pattern: '复习', weight: 10 },
  { tag: 'study', pattern: '预习', weight: 8 },
  { tag: 'study', pattern: '论文', weight: 10 },
  { tag: 'study', pattern: '阅读', weight: 5 },
  { tag: 'study', pattern: '看书', weight: 7 },
  { tag: 'study', pattern: '背单词', weight: 10 },
  { tag: 'study', pattern: /(?:cs|math|econ|stat|phys|bio|chem)\s*\d{2,4}/i, weight: 10 },

  { tag: 'work', pattern: 'intern', weight: 9 },
  { tag: 'work', pattern: 'internship', weight: 10 },
  { tag: 'work', pattern: 'job', weight: 7 },
  { tag: 'work', pattern: 'resume', weight: 10 },
  { tag: 'work', pattern: 'cv', weight: 8 },
  { tag: 'work', pattern: 'portfolio', weight: 8 },
  { tag: 'work', pattern: 'project', weight: 8 },
  { tag: 'work', pattern: 'startup', weight: 7 },
  { tag: 'work', pattern: 'interview prep', weight: 12 },
  { tag: 'work', pattern: 'interview', weight: 9 },
  { tag: 'work', pattern: 'tech screen', weight: 12 },
  { tag: 'work', pattern: 'phone screen', weight: 12 },
  { tag: 'work', pattern: 'prepare for interview', weight: 12 },
  { tag: 'work', pattern: 'oa', weight: 7 },
  { tag: 'work', pattern: 'leetcode', weight: 8 },
  { tag: 'work', pattern: 'handshake', weight: 10 },
  { tag: 'work', pattern: 'linkedin', weight: 10 },
  { tag: 'work', pattern: 'headshot', weight: 10 },
  { tag: 'work', pattern: 'vmock', weight: 10 },
  { tag: 'work', pattern: 'recruiter', weight: 9 },
  { tag: 'work', pattern: 'coding', weight: 7 },
  { tag: 'work', pattern: 'code', weight: 6 },
  { tag: 'work', pattern: 'debug', weight: 8 },
  { tag: 'work', pattern: 'deploy', weight: 8 },
  { tag: 'work', pattern: 'pr', weight: 7 },
  { tag: 'work', pattern: 'github', weight: 6 },
  { tag: 'work', pattern: '投递', weight: 10 },
  { tag: 'work', pattern: '申请实习', weight: 11 },
  { tag: 'work', pattern: '改简历', weight: 11 },
  { tag: 'work', pattern: '面试准备', weight: 12 },
  { tag: 'work', pattern: '写代码', weight: 8 },

  { tag: 'admin', pattern: 'password', weight: 10 },
  { tag: 'admin', pattern: 'passwords', weight: 10 },
  { tag: 'admin', pattern: 'change password', weight: 12 },
  { tag: 'admin', pattern: 'account', weight: 8 },
  { tag: 'admin', pattern: 'accounts', weight: 8 },
  { tag: 'admin', pattern: 'form', weight: 9 },
  { tag: 'admin', pattern: 'forms', weight: 9 },
  { tag: 'admin', pattern: 'fill out', weight: 10 },
  { tag: 'admin', pattern: 'paperwork', weight: 10 },
  { tag: 'admin', pattern: 'visa', weight: 10 },
  { tag: 'admin', pattern: '面签', weight: 12 },
  { tag: 'admin', pattern: '填表', weight: 11 },
  { tag: 'admin', pattern: '报销', weight: 10 },
  { tag: 'admin', pattern: '证件', weight: 9 },
  { tag: 'admin', pattern: '办理', weight: 8 },
  { tag: 'admin', pattern: '银行', weight: 8 },
  { tag: 'admin', pattern: '开户', weight: 10 },
  { tag: 'admin', pattern: '改密码', weight: 12 },

  { tag: 'life', pattern: 'grocery', weight: 9 },
  { tag: 'life', pattern: 'groceries', weight: 9 },
  { tag: 'life', pattern: 'cook', weight: 9 },
  { tag: 'life', pattern: 'clean', weight: 9 },
  { tag: 'life', pattern: 'laundry', weight: 10 },
  { tag: 'life', pattern: 'mail', weight: 7 },
  { tag: 'life', pattern: 'package', weight: 7 },
  { tag: 'life', pattern: 'coffee', weight: 5 },
  { tag: 'life', pattern: 'lunch', weight: 6 },
  { tag: 'life', pattern: 'breakfast', weight: 6 },
  { tag: 'life', pattern: 'dinner', weight: 6 },
  { tag: 'life', pattern: 'makeup', weight: 7 },
  { tag: 'life', pattern: 'pickup', weight: 7 },
  { tag: 'life', pattern: 'drop off', weight: 7 },
  { tag: 'life', pattern: 'organize', weight: 7 },
  { tag: 'life', pattern: 'tidy', weight: 7 },
  { tag: 'life', pattern: '买菜', weight: 10 },
  { tag: 'life', pattern: '做饭', weight: 10 },
  { tag: 'life', pattern: '打扫', weight: 10 },
  { tag: 'life', pattern: '洗衣', weight: 10 },
  { tag: 'life', pattern: '快递', weight: 8 },
  { tag: 'life', pattern: '收拾', weight: 7 },
  { tag: 'life', pattern: '日常', weight: 6 },

  { tag: 'health', pattern: 'gym', weight: 10 },
  { tag: 'health', pattern: 'workout', weight: 10 },
  { tag: 'health', pattern: 'run', weight: 7 },
  { tag: 'health', pattern: 'running', weight: 9 },
  { tag: 'health', pattern: 'jog', weight: 8 },
  { tag: 'health', pattern: 'swim', weight: 9 },
  { tag: 'health', pattern: 'yoga', weight: 9 },
  { tag: 'health', pattern: 'exercise', weight: 9 },
  { tag: 'health', pattern: 'sleep', weight: 9 },
  { tag: 'health', pattern: 'nap', weight: 8 },
  { tag: 'health', pattern: 'doctor', weight: 10 },
  { tag: 'health', pattern: 'dental', weight: 11 },
  { tag: 'health', pattern: 'dentist', weight: 10 },
  { tag: 'health', pattern: 'therapy', weight: 12 },
  { tag: 'health', pattern: 'therapist', weight: 12 },
  { tag: 'health', pattern: 'counseling', weight: 11 },
  { tag: 'health', pattern: 'counselling', weight: 11 },
  { tag: 'health', pattern: 'psychiatrist', weight: 12 },
  { tag: 'health', pattern: 'adhd', weight: 12 },
  { tag: 'health', pattern: 'hospital', weight: 10 },
  { tag: 'health', pattern: '健身', weight: 10 },
  { tag: 'health', pattern: '跑步', weight: 10 },
  { tag: 'health', pattern: '游泳', weight: 10 },
  { tag: 'health', pattern: '瑜伽', weight: 10 },
  { tag: 'health', pattern: '锻炼', weight: 9 },
  { tag: 'health', pattern: '睡觉', weight: 9 },
  { tag: 'health', pattern: '看医生', weight: 11 },

  { tag: 'event', pattern: 'meeting', weight: 10 },
  { tag: 'event', pattern: 'standup', weight: 10 },
  { tag: 'event', pattern: 'lecture', weight: 9 },
  { tag: 'event', pattern: 'class', weight: 8 },
  { tag: 'event', pattern: 'seminar', weight: 9 },
  { tag: 'event', pattern: 'office hour', weight: 10 },
  { tag: 'event', pattern: 'presentation', weight: 9 },
  { tag: 'event', pattern: 'appointment', weight: 10 },
  { tag: 'event', pattern: 'sync', weight: 7 },
  { tag: 'event', pattern: '开会', weight: 10 },
  { tag: 'event', pattern: '会议', weight: 10 },
  { tag: 'event', pattern: '上课', weight: 9 },
  { tag: 'event', pattern: '讲座', weight: 9 },
  { tag: 'event', pattern: '预约', weight: 10 },

  { tag: 'social', pattern: 'call', weight: 8 },
  { tag: 'social', pattern: 'phone call', weight: 10 },
  { tag: 'social', pattern: 'networking', weight: 10 },
  { tag: 'social', pattern: 'coffee chat', weight: 10 },
  { tag: 'social', pattern: 'hang out', weight: 9 },
  { tag: 'social', pattern: 'friend', weight: 7 },
  { tag: 'social', pattern: 'friends', weight: 7 },
  { tag: 'social', pattern: 'dinner with', weight: 9 },
  { tag: 'social', pattern: 'lunch with', weight: 9 },
  { tag: 'social', pattern: '聊天', weight: 9 },
  { tag: 'social', pattern: '打电话', weight: 10 },
  { tag: 'social', pattern: '约饭', weight: 10 },
  { tag: 'social', pattern: '聚会', weight: 10 },
  { tag: 'social', pattern: '社交', weight: 9 },

  { tag: 'finance', pattern: 'budget', weight: 10 },
  { tag: 'finance', pattern: 'invest', weight: 10 },
  { tag: 'finance', pattern: 'investment', weight: 10 },
  { tag: 'finance', pattern: 'repay', weight: 10 },
  { tag: 'finance', pattern: 'payment', weight: 8 },
  { tag: 'finance', pattern: 'pay bill', weight: 10 },
  { tag: 'finance', pattern: 'credit card', weight: 10 },
  { tag: 'finance', pattern: '账单', weight: 10 },
  { tag: 'finance', pattern: '记账', weight: 11 },
  { tag: 'finance', pattern: '还款', weight: 11 },
  { tag: 'finance', pattern: '预算', weight: 10 },
  { tag: 'finance', pattern: '理财', weight: 10 },
  { tag: 'finance', pattern: '报税', weight: 11 },

  { tag: 'travel', pattern: 'flight', weight: 11 },
  { tag: 'travel', pattern: 'hotel', weight: 10 },
  { tag: 'travel', pattern: 'trip', weight: 9 },
  { tag: 'travel', pattern: 'travel', weight: 10 },
  { tag: 'travel', pattern: 'itinerary', weight: 10 },
  { tag: 'travel', pattern: 'train ticket', weight: 10 },
  { tag: 'travel', pattern: 'book ticket', weight: 11 },
  { tag: 'travel', pattern: '出行', weight: 10 },
  { tag: 'travel', pattern: '订票', weight: 11 },
  { tag: 'travel', pattern: '行程', weight: 10 },
  { tag: 'travel', pattern: '机票', weight: 11 },
  { tag: 'travel', pattern: '酒店', weight: 10 },

  { tag: 'shopping', pattern: 'shopping', weight: 8 },
  { tag: 'shopping', pattern: 'shop', weight: 6 },
  { tag: 'shopping', pattern: 'buy', weight: 7 },
  { tag: 'shopping', pattern: 'purchase', weight: 8 },
  { tag: 'shopping', pattern: 'order', weight: 7 },
  { tag: 'shopping', pattern: 'amazon', weight: 7 },
  { tag: 'shopping', pattern: 'taobao', weight: 8 },
  { tag: 'shopping', pattern: 'mall', weight: 8 },
  { tag: 'shopping', pattern: '逛街', weight: 9 },
  { tag: 'shopping', pattern: '买衣服', weight: 10 },
  { tag: 'shopping', pattern: '购物', weight: 8 },
  { tag: 'shopping', pattern: '下单', weight: 8 },
];

const BOOST_RULES: Array<{ when: RegExp; boosts: Partial<Record<Category, number>> }> = [
  { when: new RegExp(`${W('写|做|finish|complete')}.*${W('作业|assignment|homework|essay|paper')}`, 'i'), boosts: { study: 8 } },
  { when: new RegExp(`${W('aml|nlp|machine learning|deep learning|course|quiz|exam|midterm|final')}`, 'i'), boosts: { study: 10 } },
  { when: new RegExp(`${W('dental|dentist|therapy|therapist|counseling|counselling|psychiatrist|adhd')}`, 'i'), boosts: { health: 10 } },
  { when: new RegExp(`${W('linkedin|headshot|handshake|vmock|recruiter')}`, 'i'), boosts: { work: 10 } },
  { when: new RegExp(`${W('prepare|prep|practice')}.*${W('interview|oa')}`, 'i'), boosts: { work: 10 } },
  { when: new RegExp(`${W('投|投递|apply|application|submit')}.*${W('job|intern|internship|resume|cv|snowflake|amazon|meta|google|tiktok|bytedance')}`, 'i'), boosts: { work: 10 } },
  { when: new RegExp(`${W('password|account|visa|form|bank|面签|填表|开户|改密码')}`, 'i'), boosts: { admin: 8 } },
  { when: new RegExp(`${W('meeting|class|seminar|office hour|appointment|开会|上课|讲座|预约')}`, 'i'), boosts: { event: 8 } },
  { when: new RegExp(`${W('call|phone|networking|coffee chat|friend|打电话|聊天|聚会')}`, 'i'), boosts: { social: 8 } },
  { when: new RegExp(`${W('budget|bill|repay|credit card|记账|还款|预算|报税')}`, 'i'), boosts: { finance: 8 } },
  { when: new RegExp(`${W('flight|hotel|trip|travel|itinerary|订票|行程|机票|酒店')}`, 'i'), boosts: { travel: 8 } },
  { when: new RegExp(`${W('shopping|buy|purchase|amazon|taobao|逛街|买衣服|下单')}`, 'i'), boosts: { shopping: 8 } },
  { when: new RegExp(`${W('grocery|cook|clean|laundry|买菜|做饭|打扫|洗衣')}`, 'i'), boosts: { life: 8 } },
  { when: new RegExp(`${W('gym|run|running|workout|yoga|doctor|健身|跑步|锻炼|看医生')}`, 'i'), boosts: { health: 8 } },
];

export function autoClassifyTag(title: string): Category | undefined {
  const normalized = normalizeTitle(title);
  const compact = compactTitle(title);
  if (!normalized) return undefined;

  const scores: Record<Category, number> = {
    study: 0,
    work: 0,
    admin: 0,
    life: 0,
    health: 0,
    event: 0,
    social: 0,
    finance: 0,
    travel: 0,
    shopping: 0,
  };

  for (const rule of RULES) {
    const matched = typeof rule.pattern === 'string'
      ? LATIN.test(rule.pattern)
        ? matchesWord(normalized, rule.pattern)
        : normalized.includes(rule.pattern) || compact.includes(rule.pattern.replace(/\s+/g, ''))
      : rule.pattern.test(title) || rule.pattern.test(normalized);
    if (matched) scores[rule.tag] += rule.weight;
  }

  for (const boost of BOOST_RULES) {
    if (!boost.when.test(normalized)) continue;
    for (const [tag, value] of Object.entries(boost.boosts) as Array<[Category, number]>) {
      scores[tag] += value;
    }
  }

  const ordered: Category[] = ['study', 'work', 'health', 'admin', 'event', 'social', 'finance', 'travel', 'shopping', 'life'];
  let bestTag: Category | undefined;
  let bestScore = 0;
  for (const tag of ordered) {
    if (scores[tag] > bestScore) {
      bestScore = scores[tag];
      bestTag = tag;
    }
  }

  return bestScore >= 5 ? bestTag : undefined;
}

export const TAG_CATEGORY_COLORS: Record<string, string> = {
  study: '#6F7EF7',
  work: '#8B5FB8',
  admin: '#6E7891',
  life: '#D5AE4C',
  health: '#55B98B',
  event: '#B775E3',
  social: '#D97CA6',
  finance: '#5D9ED6',
  travel: '#3CA7A0',
  shopping: '#E28C63',
};

export const TAG_CATEGORY_ICONS: Record<string, string> = {
  study: '📚',
  work: '💼',
  admin: '🗂️',
  life: '🏠',
  health: '🏃',
  event: '🗓️',
  social: '☎️',
  finance: '💸',
  travel: '✈️',
  shopping: '🛍️',
};
