import { describe, expect, it } from 'vitest';
import { parseQuickDue } from '@/lib/quickDue';

// Friday 6 Nov 2026, 15:00
const NOW = new Date(2026, 10, 6, 15, 0);
const q = (s: string) => parseQuickDue(s, NOW);

describe('parseQuickDue (zh)', () => {
  it('reads weekdays, this week and next week', () => {
    expect(q('周五交论文')).toEqual({ title: '交论文', date: '2026-11-06', time: '23:59' });
    expect(q('周日 报名 Demo Day')).toMatchObject({ title: '报名 Demo Day', date: '2026-11-08' });
    expect(q('下周一 交房租')).toMatchObject({ title: '交房租', date: '2026-11-09' });
    expect(q('下周三开会')).toMatchObject({ date: '2026-11-11' });
  });
  it('reads relative days and times', () => {
    expect(q('明天下午3点 回导师邮件')).toEqual({ title: '回导师邮件', date: '2026-11-07', time: '15:00' });
    expect(q('后天交作业')).toMatchObject({ date: '2026-11-08', title: '交作业' });
    expect(q('3天后续签护照')).toMatchObject({ date: '2026-11-09', title: '续签护照' });
    expect(q('今晚8点半 洗衣服')).toMatchObject({ date: '2026-11-06', time: '20:30', title: '洗衣服' });
    expect(q('月底交报告')).toMatchObject({ date: '2026-11-30', title: '交报告' });
    expect(q('这周末大扫除')).toMatchObject({ date: '2026-11-07', title: '大扫除' });
  });
});

describe('parseQuickDue (en)', () => {
  it('reads weekdays, tomorrow and times', () => {
    expect(q('pay rent tomorrow 5pm')).toEqual({ title: 'pay rent', date: '2026-11-07', time: '17:00' });
    expect(q('submit essay by friday')).toMatchObject({ title: 'submit essay', date: '2026-11-06' });
    expect(q('renew passport next monday')).toMatchObject({ title: 'renew passport', date: '2026-11-09' });
    expect(q('call mom in 3 days')).toMatchObject({ date: '2026-11-09', title: 'call mom' });
  });
  it('falls back to explicit dates and to no date', () => {
    expect(q('tax return 11/20')).toMatchObject({ date: '2026-11-20' });
    expect(q('buy milk')).toEqual({ title: 'buy milk', date: null, time: '23:59' });
  });
  it('does not mistake words containing weekday letters for dates', () => {
    expect(q('monitor the sunflower')).toMatchObject({ date: null });
  });
});

describe('parseQuickDue title cleanup', () => {
  it('drops a trailing "by"/"due"/"on" left behind by the date', () => {
    expect(parseQuickDue('renew passport by Dec 1')?.title).toBe('renew passport');
    expect(parseQuickDue('essay due friday')?.title).toBe('essay');
  });
});
