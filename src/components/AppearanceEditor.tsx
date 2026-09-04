import { ChangeEvent, useEffect, useRef, useState } from 'react';
import { Camera, Check, Monitor, Moon, RotateCcw, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme, ThemeMode } from '@/hooks/useTheme';
import { useAccentColor } from '@/hooks/useAccentColor';

interface AppearanceEditorProps {
  lang: string;
  homepageImageUrl: string | null | undefined;
  uploading: boolean;
  onUploadImage: (e: ChangeEvent<HTMLInputElement>) => void;
  onResetImage: () => void;
}

const THEME_MODES: { id: ThemeMode; labelZh: string; labelEn: string; Icon: typeof Sun }[] = [
  { id: 'system', labelZh: '跟随系统', labelEn: 'System', Icon: Monitor },
  { id: 'light', labelZh: '明亮', labelEn: 'Light', Icon: Sun },
  { id: 'dark', labelZh: '暗色', labelEn: 'Dark', Icon: Moon },
];

export function AppearanceEditor({ lang, homepageImageUrl, uploading, onUploadImage, onResetImage }: AppearanceEditorProps) {
  const { mode, setMode } = useTheme();
  const { accentId, setAccentId, options: accentOptions } = useAccentColor();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-save feedback. Theme/accent persist instantly (localStorage write
  // happens inside the hook setter), but without a visual cue the user can't
  // tell whether the click did anything — especially on a setting that
  // visibly changes only a thin --primary thread through the UI. We bump a
  // counter on each change and show a 1.4s "Saved" pill anchored to the
  // section header, then fade it.
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const initialMount = useRef(true);
  useEffect(() => {
    if (initialMount.current) {
      initialMount.current = false;
      return;
    }
    setSavedAt(Date.now());
    const handle = window.setTimeout(() => setSavedAt(null), 1400);
    return () => window.clearTimeout(handle);
  }, [mode, accentId]);

  return (
    <div className="rounded-[24px] border border-border/70 bg-card p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-[16px] font-semibold tracking-[-0.02em] text-foreground">
            {lang === 'zh' ? '外观' : 'Appearance'}
          </h3>
          <p className="mt-1 text-[13px] leading-5 text-muted-foreground">
            {lang === 'zh' ? '主题、品牌色与主页氛围图,改动会自动保存。' : 'Theme, brand color, and home image. Changes save automatically.'}
          </p>
        </div>
        {/* Saved pill — appears for ~1.4s after the user toggles theme or
            accent so they can see the change was registered, then fades. */}
        <div
          aria-live="polite"
          className={cn(
            "flex items-center gap-1 rounded-full bg-primary/12 px-2.5 py-1 text-[12px] font-semibold text-primary transition-opacity duration-300",
            savedAt ? "opacity-100" : "opacity-0 pointer-events-none"
          )}
        >
          <Check size={11} strokeWidth={2.4} />
          {lang === 'zh' ? '已保存' : 'Saved'}
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <p className="mb-2 text-[13px] font-semibold text-foreground/80">
            {lang === 'zh' ? '主题' : 'Theme'}
          </p>
          <div className="inline-flex rounded-full border border-border/65 bg-background p-1">
            {THEME_MODES.map(({ id, labelZh, labelEn, Icon }) => {
              const selected = mode === id;
              return (
                <button
                  key={id}
                  onClick={() => setMode(id)}
                  aria-pressed={selected}
                  className={cn(
                    'inline-flex min-h-9 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[14px] font-semibold transition-colors',
                    selected ? 'bg-foreground text-background shadow-sm' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Icon size={14} />
                  {lang === 'zh' ? labelZh : labelEn}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="mb-2 text-[13px] font-semibold text-foreground/80">
            {lang === 'zh' ? '主题色' : 'Accent color'}
          </p>
          <div className="flex flex-wrap items-center gap-2.5">
            {accentOptions.map(opt => {
              const selected = opt.id === accentId;
              return (
                <button
                  key={opt.id}
                  onClick={() => setAccentId(opt.id)}
                  title={lang === 'zh' ? opt.labelZh : opt.labelEn}
                  aria-label={`${opt.labelEn} accent`}
                  aria-pressed={selected}
                  className={cn(
                    'relative h-9 w-9 rounded-full transition-transform hover:scale-110 focus:outline-none',
                    selected ? 'scale-110' : 'ring-1 ring-border/50',
                  )}
                  style={{
                    backgroundColor: `hsl(${opt.hsl})`,
                    ...(selected ? { boxShadow: `0 0 0 2px hsl(var(--background)), 0 0 0 4px hsl(${opt.hsl})` } : {}),
                  }}
                >
                  {selected && <Check size={15} strokeWidth={2.6} className="absolute inset-0 m-auto text-white drop-shadow" />}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[13px] leading-5 text-muted-foreground/85">
            {lang === 'zh'
              ? '主题色会立即应用到链接、按钮高亮和提醒标记上。'
              : 'The accent color updates links, button highlights, and reminder dots instantly.'}
          </p>
        </div>

        <div>
          <p className="mb-2 text-[13px] font-semibold text-foreground/80">
            {lang === 'zh' ? '主页氛围图' : 'Home image'}
          </p>
          <div className="flex items-center gap-2">
            <input ref={fileInputRef} type="file" accept="image/*" onChange={onUploadImage} className="hidden" />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="inline-flex min-h-10 items-center gap-2 rounded-full border border-border/65 bg-background px-3.5 py-2 text-[14px] font-semibold text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              <Camera size={14} />
              {uploading ? '…' : lang === 'zh' ? '更换' : 'Change'}
            </button>
            <button
              onClick={onResetImage}
              disabled={!homepageImageUrl}
              className="inline-flex min-h-10 items-center gap-2 rounded-full border border-border/65 bg-background px-3.5 py-2 text-[14px] font-semibold text-muted-foreground hover:text-foreground disabled:opacity-40"
            >
              <RotateCcw size={14} />
              {lang === 'zh' ? '恢复默认' : 'Reset'}
            </button>
          </div>
          <p className="mt-2 text-[13px] leading-5 text-muted-foreground/85">
            {lang === 'zh'
              ? '默认每天轮换一幅公开馆藏作品，图片直接来自博物馆，不占用 Supabase 空间。'
              : 'By default, an open-access museum artwork rotates daily without using Supabase storage.'}
          </p>
        </div>
      </div>
    </div>
  );
}
