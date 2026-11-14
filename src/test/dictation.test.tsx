import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { Composer } from '@/components/composer/Composer';
import { dictationText, readResults } from '@/hooks/useDictation';
import { defaultDictationLang, joinSpoken } from '@/lib/dictationLang';

type Handler = ((e: unknown) => void) | null;
class FakeRecognition {
  static last: FakeRecognition | null = null;
  lang = ''; continuous = false; interimResults = false;
  onresult: Handler = null; onend: (() => void) | null = null; onerror: Handler = null;
  start = vi.fn(); stop = vi.fn(); abort = vi.fn();
  constructor() { FakeRecognition.last = this; }
  emit(results: { text: string; final: boolean }[]) {
    this.onresult?.({ resultIndex: 0, results: results.map(r => ({ isFinal: r.final, 0: { transcript: r.text } })) });
  }
}
const w = window as unknown as { webkitSpeechRecognition?: unknown };

function Harness() {
  const [v, setV] = useState('Note:');
  return <Composer value={v} onChange={setV} onSubmit={() => {}} placeholder="Write" dictation dictationLang="en-US" />;
}

describe('dictation helpers', () => {
  it('splits finals and interim, and cleans fillers on insert', () => {
    const e = { resultIndex: 0, results: [{ isFinal: true, 0: { transcript: 'um walked home' } }, { isFinal: false, 0: { transcript: 'uh slowly' } }] };
    expect(readResults(e)).toEqual({ finals: 'um walked home', interim: 'uh slowly' });
    expect(dictationText('um walked home', 'uh slowly')).toBe('Walked home slowly');
  });
});

describe('dictation language and Chinese spacing', () => {
  it('defaults to Chinese when the device lists Chinese, even with an English UI', () => {
    expect(defaultDictationLang(['en-US', 'zh-CN'], 'en-US')).toBe('zh-CN');
    expect(defaultDictationLang(['zh-Hans-CN'], 'en-US')).toBe('zh-CN');
    expect(defaultDictationLang(['en-GB'], 'en-US')).toBe('en-US');
  });

  it('never puts spaces inside Chinese, keeps them between English words', () => {
    expect(joinSpoken('我今天', '去了图书馆')).toBe('我今天去了图书馆');
    expect(joinSpoken('Note:', 'coffee')).toBe('Note: coffee');
    expect(joinSpoken('开会', 'with Sam')).toBe('开会with Sam');
    expect(dictationText('我 今天 去了', '图书馆')).toBe('我今天去了图书馆');
  });
});

describe('Composer dictation', () => {
  afterEach(() => { delete w.webkitSpeechRecognition; });

  it('hides the mic when the browser has no speech recognition', () => {
    render(<Harness />);
    expect(screen.queryByTestId('composer-dictate')).toBeNull();
  });

  it('listens inline, shows live words, and ✓ appends the cleaned text', () => {
    w.webkitSpeechRecognition = FakeRecognition;
    render(<Harness />);
    fireEvent.click(screen.getByTestId('composer-dictate'));
    expect(FakeRecognition.last?.start).toHaveBeenCalled();
    expect(screen.getByText('Listening…')).toBeInTheDocument();
    act(() => FakeRecognition.last!.emit([{ text: 'um coffee with Sam', final: true }]));
    expect(screen.getByText(/coffee with Sam/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Insert dictation' }));
    expect((screen.getByPlaceholderText('Write') as HTMLTextAreaElement).value).toBe('Note: Coffee with Sam');
  });

  it('switches the listening language and remembers it', () => {
    w.webkitSpeechRecognition = FakeRecognition;
    localStorage.removeItem('eol-dictation-lang');
    render(<Harness />);
    fireEvent.click(screen.getByTestId('composer-dictate'));
    expect(FakeRecognition.last?.lang).toBe('en-US');
    act(() => FakeRecognition.last!.emit([{ text: 'hello', final: true }]));
    fireEvent.click(screen.getByTestId('dictation-lang'));
    expect(FakeRecognition.last?.lang).toBe('zh-CN');
    expect(localStorage.getItem('eol-dictation-lang')).toBe('zh-CN');
    expect(screen.getByText(/hello/)).toBeInTheDocument(); // kept across the switch
    localStorage.removeItem('eol-dictation-lang');
  });

  it('✕ discards what was heard', () => {
    w.webkitSpeechRecognition = FakeRecognition;
    render(<Harness />);
    fireEvent.click(screen.getByTestId('composer-dictate'));
    act(() => FakeRecognition.last!.emit([{ text: 'never mind', final: true }]));
    fireEvent.click(screen.getByRole('button', { name: 'Discard dictation' }));
    expect((screen.getByPlaceholderText('Write') as HTMLTextAreaElement).value).toBe('Note:');
    expect(FakeRecognition.last?.abort).toHaveBeenCalled();
  });
});
