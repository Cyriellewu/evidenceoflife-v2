import { describe, it, expect } from 'vitest';
import { cleanFillerWords } from '@/lib/fillerWords';

describe('cleanFillerWords — Chinese', () => {
  it('drops interjections and clause-start fillers', () => {
    expect(cleanFillerWords('嗯，然后我去了超市')).toBe('然后我去了超市');
    expect(cleanFillerWords('呃 那个，我觉得挺好')).toBe('我觉得挺好');
    expect(cleanFillerWords('今天，啊，下雨了')).toBe('今天，下雨了');
  });
  it('keeps real words that contain filler characters', () => {
    expect(cleanFillerWords('这就是我想要的')).toBe('这就是我想要的');
    expect(cleanFillerWords('超市在对面')).toBe('超市在对面');
    expect(cleanFillerWords('然后去了图书馆')).toBe('然后去了图书馆');
    expect(cleanFillerWords('好的方案')).toBe('好的方案');
  });
});

describe('cleanFillerWords — English', () => {
  it('drops um/uh and comma-set fillers', () => {
    expect(cleanFillerWords('um I uh went home')).toBe('I went home');
    expect(cleanFillerWords('you know, it was, like, fine')).toBe('It was fine');
    expect(cleanFillerWords('I mean, the talk was good')).toBe('The talk was good');
  });
  it('keeps real words', () => {
    expect(cleanFillerWords('I like apples')).toBe('I like apples');
    expect(cleanFillerWords('called on the phone')).toBe('called on the phone');
    expect(cleanFillerWords('one umbrella')).toBe('one umbrella');
    expect(cleanFillerWords('the error was clear')).toBe('the error was clear');
  });
  it('handles mixed text', () => {
    expect(cleanFillerWords('嗯，tech screen um went well')).toBe('Tech screen went well');
  });
});
