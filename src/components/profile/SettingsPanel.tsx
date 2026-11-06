import { ChangeEvent, ReactNode, useEffect, useRef, useState } from 'react';
import { Camera, Check, ChevronLeft, Download, LogOut, Monitor, Moon, RotateCcw, Sun } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useProfile } from '@/hooks/useProfile';
import { useLanguage } from '@/hooks/useLanguage';
import { useAuth } from '@/hooks/useAuth';
import { useTheme, ThemeMode } from '@/hooks/useTheme';
import { useAccentColor } from '@/hooks/useAccentColor';
import { CircularTimeRing } from '@/components/CircularTimeRing';
import { GoogleCalendarButton } from '@/components/GoogleCalendarButton';
import { PasswordSetting } from '@/components/PasswordSetting';
import { StorageImage } from '@/components/StorageImage';
import { buildEvidenceExport, serializeEvidenceExport, evidenceExportFilename } from '@/lib/exportEvidence';
import { Moment } from '@/types';

/* iOS-style grouped list: a small heading above a rounded card of rows. */
function Group({ title, footer, children }: { title?: string; footer?: string; children: ReactNode }) {
  return (
    <section>
      {title && <h2 className="px-4 pb-1.5 text-[13px] text-muted-foreground">{title}</h2>}
      <div className="divide-y divide-border/50 overflow-hidden rounded-2xl border border-border/50 bg-card">
        {children}
      </div>
      {footer && <p className="px-4 pt-1.5 text-[12px] leading-relaxed text-muted-foreground/75">{footer}</p>}
    </section>
  );
}

function Row({ label, children, className }: { label: string; children?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex min-h-[48px] items-center gap-3 px-4 py-2.5', className)}>
      <span className="flex-1 text-[15px] text-foreground">{label}</span>
      {children}
    </div>
  );
}

function Segmented<T extends string>({ value, options, onChange }: {
  value: T;
  options: { id: T; label: string; icon?: ReactNode }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-full bg-secondary/60 p-0.5">
      {options.map(o => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          aria-pressed={value === o.id}
          className={cn(
            'inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors',
            value === o.id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground',
          )}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function SettingsPanel({ moments, onBack }: { moments: Moment[]; onBack: () => void }) {
  const { profile, updateProfile, uploadHomepageImage } = useProfile();
  const { lang, setLang } = useLanguage();
  const { user, isDemo, signOut } = useAuth();
  const { mode, setMode } = useTheme();
  const { accentId, setAccentId, options: accentOptions } = useAccentColor();
  const navigate = useNavigate();
  const zh = lang === 'zh';

  const [name, setName] = useState(profile?.display_name || '');
  const [wakeHour, setWakeHour] = useState(profile?.wake_hour ?? 8);
  const [wakeMinute, setWakeMinute] = useState(profile?.wake_minute ?? 0);
  const [bedtimeHour, setBedtimeHour] = useState(profile?.bedtime_hour ?? 23);
  const [bedtimeMinute, setBedtimeMinute] = useState(profile?.bedtime_minute ?? 30);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!profile) return;
    setName(profile.display_name || '');
    setWakeHour(profile.wake_hour);
    setWakeMinute(profile.wake_minute);
    setBedtimeHour(profile.bedtime_hour);
    setBedtimeMinute(profile.bedtime_minute);
  }, [profile]);

  const saveName = async () => {
    const next = name.trim();
    if (next === (profile?.display_name || '')) return;
    await updateProfile({ display_name: next || null });
    toast.success(zh ? '名字已更新' : 'Name updated');
  };

  const upload = async (
    e: ChangeEvent<HTMLInputElement>,
    field: 'avatar_url' | 'homepage_image_url',
    setBusy: (v: boolean) => void,
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    const url = await uploadHomepageImage(file);
    if (url) {
      await updateProfile({ [field]: url });
      toast.success(zh ? '已更新' : 'Updated');
    }
    setBusy(false);
  };

  const saveRhythm = async (todayOnly: boolean) => {
    if (todayOnly) {
      const now = new Date();
      const dateKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      localStorage.setItem(`day-time-override-${dateKey}`, JSON.stringify({
        wake_hour: wakeHour, wake_minute: wakeMinute, bedtime_hour: bedtimeHour, bedtime_minute: bedtimeMinute,
      }));
      window.dispatchEvent(new CustomEvent('day-time-override-updated'));
      toast.success(zh ? '只改了今天' : 'Applied only to today');
      return;
    }
    await updateProfile({ wake_hour: wakeHour, wake_minute: wakeMinute, bedtime_hour: bedtimeHour, bedtime_minute: bedtimeMinute });
    toast.success(zh ? '以后每天都按这个' : 'Applied to every day');
  };

  const exportEvidence = () => {
    try {
      const now = new Date();
      const data = buildEvidenceExport(moments, now);
      const blob = new Blob([serializeEvidenceExport(data)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = evidenceExportFilename(now);
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success(zh ? `已导出 ${data.counts.moments} 条记录` : `Exported ${data.counts.moments} moments`);
    } catch {
      toast.error(zh ? '导出失败，请重试' : 'Export failed, please try again');
    }
  };

  const logOut = async () => {
    await signOut();
    const { clearPhotoUrlCache } = await import('@/lib/momentPhotos');
    clearPhotoUrlCache();
    navigate('/', { replace: true });
  };

  const themeOptions: { id: ThemeMode; label: string; icon: ReactNode }[] = [
    { id: 'system', label: zh ? '自动' : 'Auto', icon: <Monitor size={13} /> },
    { id: 'light', label: zh ? '浅色' : 'Light', icon: <Sun size={13} /> },
    { id: 'dark', label: zh ? '深色' : 'Dark', icon: <Moon size={13} /> },
  ];

  return (
    <div className="flex-1 w-full overflow-y-auto bg-[hsl(var(--surface-soft))] px-4 pb-16 pt-2 sm:px-5">
      <div className="mx-auto max-w-[620px] space-y-6">
        <div className="flex items-center gap-1 pt-2">
          <button
            type="button"
            onClick={onBack}
            className="-ml-2 inline-flex h-9 items-center gap-0.5 rounded-full pl-1 pr-3 text-[15px] text-primary hover:bg-secondary/50"
          >
            <ChevronLeft size={20} />
            {zh ? '我的' : 'Profile'}
          </button>
        </div>
        <h1 className="-mt-3 px-1 text-[28px] font-semibold tracking-[-0.03em] text-foreground">{zh ? '设置' : 'Settings'}</h1>

        <Group>
          <div className="flex items-center gap-3.5 px-4 py-3.5">
            <button
              type="button"
              onClick={() => avatarInputRef.current?.click()}
              aria-label={zh ? '更换头像' : 'Change photo'}
              className="relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-full bg-secondary"
            >
              {profile?.avatar_url ? (
                <StorageImage src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-[26px]">🌱</span>
              )}
              <span className="absolute inset-x-0 bottom-0 flex h-4 items-center justify-center bg-black/45">
                <Camera size={10} className="text-white" />
              </span>
              {uploadingAvatar && <span className="absolute inset-0 bg-black/40" />}
            </button>
            <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={e => upload(e, 'avatar_url', setUploadingAvatar)} />
            <div className="min-w-0 flex-1">
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                onBlur={saveName}
                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                placeholder={zh ? '你的名字' : 'Your name'}
                aria-label={zh ? '名字' : 'Name'}
                className="w-full bg-transparent text-[17px] font-semibold text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
              />
              {user?.email && !isDemo && <p className="truncate text-[13px] text-muted-foreground">{user.email}</p>}
            </div>
          </div>
          {!isDemo && user && <PasswordSetting lang={lang} email={user.email} variant="row" />}
        </Group>

        <Group title={zh ? '外观' : 'Appearance'}>
          <Row label={zh ? '主题' : 'Theme'}>
            <Segmented value={mode} options={themeOptions} onChange={setMode} />
          </Row>
          <div className="px-4 py-3">
            <p className="mb-2.5 text-[15px] text-foreground">{zh ? '强调色' : 'Accent color'}</p>
            <div className="flex flex-wrap gap-3">
              {accentOptions.map(opt => {
                const selected = opt.id === accentId;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setAccentId(opt.id)}
                    title={zh ? opt.labelZh : opt.labelEn}
                    aria-label={`${opt.labelEn} accent`}
                    aria-pressed={selected}
                    className="relative h-8 w-8 rounded-full"
                    style={{
                      backgroundColor: `hsl(${opt.hsl})`,
                      ...(selected ? { boxShadow: `0 0 0 2px hsl(var(--card)), 0 0 0 4px hsl(${opt.hsl})` } : {}),
                    }}
                  >
                    {selected && <Check size={14} strokeWidth={2.6} className="absolute inset-0 m-auto text-white" />}
                  </button>
                );
              })}
            </div>
          </div>
          <Row label={zh ? '封面图' : 'Cover image'}>
            <input ref={coverInputRef} type="file" accept="image/*" className="hidden" onChange={e => upload(e, 'homepage_image_url', setUploadingCover)} />
            {profile?.homepage_image_url && (
              <button
                type="button"
                onClick={() => updateProfile({ homepage_image_url: null })}
                aria-label={zh ? '恢复默认' : 'Reset'}
                className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary/60"
              >
                <RotateCcw size={15} />
              </button>
            )}
            <button
              type="button"
              onClick={() => coverInputRef.current?.click()}
              disabled={uploadingCover}
              className="text-[15px] text-primary disabled:opacity-50"
            >
              {uploadingCover ? '…' : zh ? '更换' : 'Change'}
            </button>
          </Row>
        </Group>

        <Group
          title={zh ? '作息' : 'Day rhythm'}
          footer={zh ? '计划页的时间轴从起床画到睡觉。' : 'The Plan timeline runs from wake-up to bedtime.'}
        >
          <div className="px-4 py-4">
            <CircularTimeRing
              wakeHour={wakeHour} wakeMinute={wakeMinute}
              bedtimeHour={bedtimeHour} bedtimeMinute={bedtimeMinute}
              lang={lang}
              onWakeChange={(h, m) => { setWakeHour(h); setWakeMinute(m); }}
              onBedtimeChange={(h, m) => { setBedtimeHour(h); setBedtimeMinute(m); }}
            />
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => saveRhythm(true)} className="h-10 flex-1 rounded-full bg-secondary/70 text-[14px] font-medium text-foreground">
                {zh ? '只改今天' : 'Today only'}
              </button>
              <button type="button" onClick={() => saveRhythm(false)} className="h-10 flex-1 rounded-full bg-primary text-[14px] font-medium text-primary-foreground">
                {zh ? '每天都用' : 'Every day'}
              </button>
            </div>
          </div>
        </Group>

        <Group title={zh ? '通用' : 'General'}>
          <Row label={zh ? '语言' : 'Language'}>
            <Segmented
              value={zh ? 'zh' : 'en'}
              options={[{ id: 'zh', label: '中文' }, { id: 'en', label: 'English' }]}
              onChange={v => setLang(v)}
            />
          </Row>
          <Row label="Google Calendar">
            <GoogleCalendarButton />
          </Row>
        </Group>

        <Group
          title={zh ? '数据' : 'Data'}
          footer={zh ? '你的记录默认私密。导出是一份 JSON，随时可以带走。' : 'Your records are private. The export is one JSON file you can keep.'}
        >
          <button type="button" onClick={exportEvidence} className="flex min-h-[48px] w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-secondary/40">
            <Download size={17} className="text-muted-foreground" />
            <span className="flex-1 text-[15px] text-foreground">{zh ? '导出全部记录' : 'Export all records'}</span>
          </button>
        </Group>

        {!isDemo && user && (
          <Group>
            <button type="button" onClick={() => void logOut()} className="flex min-h-[48px] w-full items-center justify-center gap-2 px-4 py-2.5 text-[15px] text-destructive hover:bg-secondary/40">
              <LogOut size={16} />
              {zh ? '退出登录' : 'Log out'}
            </button>
          </Group>
        )}
      </div>
    </div>
  );
}
