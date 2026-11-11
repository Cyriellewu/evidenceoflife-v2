import { useCallback, useEffect, useRef, useState } from 'react';
import { cleanFillerWords } from '@/lib/fillerWords';

/**
 * Inline dictation for the composer — the browser's free Web Speech API.
 * Start → live text (final + interim) → finish() returns the cleaned text,
 * cancel() drops it. No audio leaves the browser through our code.
 */

interface ResultLike { isFinal: boolean; 0: { transcript: string } }
interface EventLike { resultIndex: number; results: ArrayLike<ResultLike> }
interface RecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: EventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
type Ctor = new () => RecognitionLike;

function getCtor(): Ctor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: Ctor; webkitSpeechRecognition?: Ctor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isDictationSupported(): boolean {
  return getCtor() !== null;
}

/** Split a recognition event into the finals it adds and the current interim. */
export function readResults(e: EventLike): { finals: string; interim: string } {
  let finals = '';
  let interim = '';
  for (let i = e.resultIndex; i < e.results.length; i++) {
    const r = e.results[i];
    if (r.isFinal) finals += r[0].transcript;
    else interim += r[0].transcript;
  }
  return { finals, interim };
}

/** Text to insert: joined, fillers removed, spacing normalised. */
export function dictationText(finals: string, interim: string): string {
  return cleanFillerWords(`${finals} ${interim}`.replace(/\s+/g, ' ').trim());
}

export type DictationState = 'idle' | 'listening' | 'error';

export function useDictation(lang: string) {
  const [state, setState] = useState<DictationState>('idle');
  const [finals, setFinals] = useState('');
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(null);
  /** Bumps on every result, so the waveform can react to speech. */
  const [pulse, setPulse] = useState(0);
  const recRef = useRef<RecognitionLike | null>(null);
  const keepRef = useRef(false);

  const stopRec = useCallback((abort: boolean) => {
    keepRef.current = false;
    const rec = recRef.current;
    recRef.current = null;
    if (!rec) return;
    rec.onresult = null;
    rec.onend = null;
    rec.onerror = null;
    try {
      if (abort) rec.abort();
      else rec.stop();
    } catch {
      /* already stopped */
    }
  }, []);

  const start = useCallback(() => {
    const C = getCtor();
    if (!C) return;
    stopRec(true);
    const rec = new C();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      const { finals: f, interim: i } = readResults(e);
      if (f) setFinals((prev) => `${prev}${prev && !/\s$/.test(prev) ? ' ' : ''}${f}`);
      setInterim(i);
      setPulse((n) => n + 1);
    };
    rec.onerror = (e) => {
      if (e?.error === 'no-speech' || e?.error === 'aborted') return;
      setError(e?.error ?? 'error');
      setState('error');
      keepRef.current = false;
    };
    // Mobile engines end after a pause even when continuous; keep listening
    // until the person taps ✓ or ✕.
    rec.onend = () => {
      if (keepRef.current) {
        try { rec.start(); } catch { setState('idle'); }
      }
    };
    recRef.current = rec;
    keepRef.current = true;
    setFinals('');
    setInterim('');
    setError(null);
    setState('listening');
    try {
      rec.start();
    } catch {
      setState('error');
      setError('start-failed');
    }
  }, [lang, stopRec]);

  /** Stop and return the cleaned text. */
  const finish = useCallback((): string => {
    const text = dictationText(finals, interim);
    stopRec(false);
    setState('idle');
    setFinals('');
    setInterim('');
    return text;
  }, [finals, interim, stopRec]);

  const cancel = useCallback(() => {
    stopRec(true);
    setState('idle');
    setFinals('');
    setInterim('');
  }, [stopRec]);

  useEffect(() => () => stopRec(true), [stopRec]);

  return { state, finals, interim, error, pulse, start, finish, cancel, supported: isDictationSupported() };
}
