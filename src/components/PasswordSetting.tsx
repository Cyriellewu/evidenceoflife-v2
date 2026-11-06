import { useState } from 'react';
import { ChevronRight, KeyRound, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

/**
 * Lets a Google-only account add (or change) an email password.
 *
 * Why: when the site runs from the iPhone home screen it is a standalone web
 * app with its own storage. Google sign-in leaves the app and comes back in an
 * iOS browser layer, so the session often lands in Safari instead of the app
 * and the app looks signed out. Email + password signs in inside the app.
 */
export function PasswordSetting({ lang, email, variant = 'pill' }: { lang: string; email?: string | null; variant?: 'pill' | 'row' }) {
  const zh = lang.startsWith('zh');
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);

  const tooShort = password.length > 0 && password.length < 8;
  const mismatch = confirm.length > 0 && confirm !== password;
  const canSave = password.length >= 8 && password === confirm && !saving;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success(zh ? '密码已设置。主屏幕上的 App 里用邮箱和这个密码登录就不会掉了。' : 'Password set. Sign in with your email and this password in the home-screen app.');
      setPassword('');
      setConfirm('');
      setOpen(false);
    } catch (e) {
      const message = e instanceof Error ? e.message : '';
      toast.error(zh ? `没设置成功${message ? `：${message}` : ''}` : `Could not set the password${message ? `: ${message}` : ''}`);
    } finally {
      setSaving(false);
    }
  };

  if (!open && variant === 'row') {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-[48px] w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-secondary/40"
      >
        <KeyRound size={17} className="flex-shrink-0 text-muted-foreground" />
        <span className="flex-1 text-[15px] text-foreground">{zh ? '设置登录密码' : 'Set a password'}</span>
        <ChevronRight size={16} className="text-muted-foreground/50" />
      </button>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-10 items-center gap-2 rounded-full border border-border/65 bg-secondary/30 px-3.5 text-[12px] font-semibold text-foreground/80 transition-colors hover:text-foreground"
      >
        <KeyRound size={14} />
        {zh ? '设置登录密码' : 'Set a password'}
      </button>
    );
  }

  return (
    <div className={variant === 'row' ? 'w-full px-4 py-3.5' : 'w-full rounded-2xl border border-border/60 bg-background p-3.5'}>
      <p className="text-[13px] font-semibold text-foreground">{zh ? '设置登录密码' : 'Set a password'}</p>
      <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
        {zh
          ? `之后可以用 ${email ?? '你的邮箱'} + 密码登录。从手机主屏幕打开时，用这个方式登录会一直保持。`
          : `You can then sign in with ${email ?? 'your email'} and this password, which stays signed in when opened from the home screen.`}
      </p>
      <div className="mt-3 space-y-2">
        <input
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder={zh ? '新密码（至少 8 位）' : 'New password (8+ characters)'}
          className="h-11 w-full rounded-xl border border-border/60 bg-card px-3.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <input
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') void save(); }}
          placeholder={zh ? '再输一次' : 'Repeat it'}
          className="h-11 w-full rounded-xl border border-border/60 bg-card px-3.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        {(tooShort || mismatch) && (
          <p className="text-[12px] text-destructive">
            {tooShort ? (zh ? '至少 8 位' : 'At least 8 characters') : (zh ? '两次不一样' : "They don't match")}
          </p>
        )}
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} className="h-9 rounded-full px-3.5 text-[13px] text-muted-foreground">
          {zh ? '取消' : 'Cancel'}
        </button>
        <button type="button" onClick={() => void save()} disabled={!canSave} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-[13px] font-semibold text-primary-foreground disabled:opacity-40">
          {saving && <Loader2 size={14} className="animate-spin" />}
          {zh ? '保存' : 'Save'}
        </button>
      </div>
    </div>
  );
}
