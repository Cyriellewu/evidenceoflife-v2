import { useState } from 'react';
import { X, Check } from 'lucide-react';
import { useLanguage } from '@/hooks/useLanguage';

// Mood options offered right after a focus session ends. Kept short on purpose:
// the product promise is "less input, more evidence", so one tap is enough.
const MOOD_OPTIONS = ['😄', '🙂', '😮‍💨', '🔥', '🧠', '🥱'];

export interface FocusRecapDraft {
  note: string;
  mood: string;
}

interface FocusRecapPromptProps {
  title: string;
  workingSec: number;
  completed: boolean;
  onSave: (draft: FocusRecapDraft) => void;
  onSkip: () => void;
}

// Human duration for the recap summary — hours+minutes for long sessions so a
// forgotten/long timer reads as "2 小时 31 分钟" instead of "151 分钟".
function formatDuration(sec: number, lang: string): string {
  const totalMin = Math.max(1, Math.round(sec / 60));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (lang === 'zh') {
    if (h === 0) return `${m} 分钟`;
    return m > 0 ? `${h} 小时 ${m} 分钟` : `${h} 小时`;
  }
  if (h === 0) return `${m} min`;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function FocusRecapPrompt({ title, workingSec, completed, onSave, onSkip }: FocusRecapPromptProps) {
  const { t, lang } = useLanguage();
  const [note, setNote] = useState('');
  const [mood, setMood] = useState('');

  const handleSave = () => {
    onSave({ note: note.trim(), mood });
  };

  const canSave = note.trim().length > 0 || mood.length > 0;

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fade-in"
        onClick={onSkip}
      />
      <div className="relative z-10 w-full max-w-md rounded-t-3xl bg-[hsl(var(--background))] px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-6 shadow-2xl animate-slide-up sm:m-4 sm:rounded-3xl sm:p-6">
        <button
          type="button"
          onClick={onSkip}
          aria-label={t('focusRecap.skip')}
          className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted"
        >
          <X size={18} />
        </button>

        <div className="flex items-center gap-2 text-2xl">
          <span className="animate-scale-in">{completed ? '🎉' : '🌱'}</span>
        </div>
        <h2 className="mt-2 text-lg font-semibold text-foreground">
          {completed ? t('focusRecap.titleDone') : t('focusRecap.titleSaved')}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('focusRecap.summary')
            .replace('{duration}', formatDuration(workingSec, lang))
            .replace('{task}', title)}
        </p>

        <p className="mt-5 text-sm font-medium text-foreground">{t('focusRecap.moodQuestion')}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {MOOD_OPTIONS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMood((prev) => (prev === m ? '' : m))}
              className={`flex h-11 w-11 items-center justify-center rounded-2xl border text-xl transition-all ${
                mood === m
                  ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.12)] scale-105'
                  : 'border-border bg-card hover:border-[hsl(var(--primary)/0.4)]'
              }`}
            >
              {m}
            </button>
          ))}
        </div>

        <p className="mt-5 text-sm font-medium text-foreground">{t('focusRecap.noteQuestion')}</p>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t('focusRecap.notePlaceholder')}
          rows={2}
          autoFocus
          className="mt-2 w-full resize-none rounded-2xl border border-border bg-card px-4 py-3 text-[16px] text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-[hsl(var(--primary))] sm:text-sm"
        />

        <div className="mt-5 flex items-center gap-3">
          <button
            type="button"
            onClick={onSkip}
            className="flex-1 rounded-2xl border border-border bg-card py-3.5 text-[15px] font-medium text-muted-foreground transition-colors hover:bg-muted active:scale-[0.99]"
          >
            {t('focusRecap.skip')}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className="flex flex-[1.4] items-center justify-center gap-2 rounded-2xl bg-[hsl(var(--primary))] py-3.5 text-[15px] font-semibold text-[hsl(var(--primary-foreground))] transition-opacity disabled:opacity-40 active:scale-[0.99]"
          >
            <Check size={16} />
            {t('focusRecap.save')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default FocusRecapPrompt;
