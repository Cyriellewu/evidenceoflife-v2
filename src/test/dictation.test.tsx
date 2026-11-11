import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { Composer } from '@/components/composer/Composer';
import { dictationText, readResults } from '@/hooks/useDictation';

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
