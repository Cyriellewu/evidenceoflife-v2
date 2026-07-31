import { useEffect, useCallback, useState } from 'react';
import { useLanguage } from '@/hooks/useLanguage';
import { publishNtfy } from '@/lib/ntfy';

const STORAGE_KEY = 'life-reminder-config';
const LAST_NOTIFIED_KEY = 'life-reminder-last';

export interface ReminderConfig {
  enabled: boolean;
  intervalHours: number; // 1, 2, 3, 4
  /** When true, also publish to an ntfy topic (browser push optional). */
  ntfyEnabled: boolean;
  /** Bare topic (ntfy.sh/…) or full self-hosted topic URL. */
  ntfyTopic: string;
}

const DEFAULT_CONFIG: ReminderConfig = {
  enabled: false,
  intervalHours: 2,
  ntfyEnabled: false,
  ntfyTopic: '',
};

function getConfig(): ReminderConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULT_CONFIG, ...JSON.parse(raw) } : DEFAULT_CONFIG;
  } catch {
    return DEFAULT_CONFIG;
  }
}

function saveConfig(c: ReminderConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
}

function appOrigin(): string {
  if (typeof window === 'undefined') return 'https://evidenceoflife-v2.vercel.app';
  return window.location.origin;
}

export function useLifeReminder(options?: { disabled?: boolean }) {
  const { lang } = useLanguage();
  const disabled = options?.disabled ?? false;
  const [config, setConfigState] = useState<ReminderConfig>(getConfig);

  const setConfig = useCallback((updates: Partial<ReminderConfig>) => {
    setConfigState((prev) => {
      const next = { ...prev, ...updates };
      saveConfig(next);
      return next;
    });
  }, []);

  const requestPermission = useCallback(async () => {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    const result = await Notification.requestPermission();
    return result === 'granted';
  }, []);

  useEffect(() => {
    if (disabled) return;
    if (!config.enabled) return;

    const check = () => {
      const useBrowser =
        'Notification' in window && Notification.permission === 'granted';
      const useNtfy = config.ntfyEnabled && !!config.ntfyTopic.trim();
      if (!useBrowser && !useNtfy) return;

      const now = Date.now();
      const last = parseInt(localStorage.getItem(LAST_NOTIFIED_KEY) || '0', 10);
      const intervalMs = config.intervalHours * 60 * 60 * 1000;

      const hour = new Date().getHours();
      if (hour >= 23 || hour < 7) return;

      if (now - last < intervalMs) return;
      localStorage.setItem(LAST_NOTIFIED_KEY, String(now));

      const titles =
        lang === 'zh'
          ? ['刚刚发生了什么？', '记录一下这个瞬间 ✨', '你刚刚在做什么？', '留下生活的痕迹 🌱']
          : ['What just happened?', 'Capture this moment ✨', 'What did you just do?', 'Leave evidence of life 🌱'];

      const title = titles[Math.floor(Math.random() * titles.length)];
      const body = lang === 'zh' ? '点击记录你的生活瞬间' : 'Tap to record your life moment';
      const clickUrl = `${appOrigin()}/app`;

      if (useBrowser) {
        try {
          new Notification(title, {
            body,
            icon: '/favicon.ico',
            tag: 'life-reminder',
            silent: false,
          });
        } catch {
          /* ignore */
        }
      }

      if (useNtfy) {
        void publishNtfy({
          topicOrUrl: config.ntfyTopic,
          title,
          body,
          clickUrl,
        });
      }
    };

    check();
    const interval = setInterval(check, 60 * 1000);
    return () => clearInterval(interval);
  }, [
    config.enabled,
    config.intervalHours,
    config.ntfyEnabled,
    config.ntfyTopic,
    lang,
    disabled,
  ]);

  return { config, setConfig, requestPermission };
}
