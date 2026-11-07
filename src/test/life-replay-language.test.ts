import { describe, expect, it } from 'vitest';
import { buildLocalLifeReplay, pickReplayLang } from '@/components/views/today/todayHelpers';

describe('Life Replay language follows the moments, not the UI', () => {
  const zhEvents = [
    { time: '09:10', title: '早上去公园散步', duration: '20m' },
    { time: '10:30', title: '在图书馆看了两章书', duration: '45m' },
    { time: '12:05', title: '和朋友在食堂吃午饭 聊了很久', duration: '40m' },
    { time: '15:20', title: '下午写完了作业的第一部分', duration: '60m' },
  ];

  it('picks zh for Chinese moments under an English UI', () => {
    expect(pickReplayLang(zhEvents.map(e => e.title), 'en')).toBe('zh');
  });

  it('picks en for English moments under a Chinese UI', () => {
    expect(pickReplayLang(['Coffee with Sam', 'Gym session', 'Read a chapter'], 'zh')).toBe('en');
  });

  it('falls back to the UI language when there are no letters', () => {
    expect(pickReplayLang(['☕', '🏃'], 'zh')).toBe('zh');
    expect(pickReplayLang(['☕', '🏃'], 'en')).toBe('en');
  });

  it('never mixes an English template with Chinese moments', () => {
    const story = buildLocalLifeReplay(zhEvents, 'en')!;
    expect(story).not.toMatch(/You started|moved through|wrapped with/);
    expect(story).toMatch(/今天一共串起了/);
  });
});
