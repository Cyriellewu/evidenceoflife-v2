import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState, ReactNode } from 'react';

export type ThemeMode = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'app-theme';
const DEFAULT_MODE: ThemeMode = 'system';

function resolveEffective(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'light') return 'light';
  if (mode === 'dark') return 'dark';
  if (typeof window === 'undefined' || !window.matchMedia) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(effective: 'light' | 'dark') {
  const root = document.documentElement;
  root.classList.toggle('dark', effective === 'dark');
  root.classList.toggle('light', effective === 'light');
}

interface ThemeContextType {
  mode: ThemeMode;
  effective: 'light' | 'dark';
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  mode: DEFAULT_MODE,
  effective: 'light',
  setMode: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'system' || stored === 'light' || stored === 'dark') return stored;
    } catch { /* ignore */ }
    return DEFAULT_MODE;
  });
  const [effective, setEffective] = useState<'light' | 'dark'>(() => resolveEffective(mode));

  useLayoutEffect(() => {
    const next = resolveEffective(mode);
    setEffective(next);
    applyTheme(next);
  }, [mode]);

  useEffect(() => {
    if (mode !== 'system' || typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      const next = mq.matches ? 'dark' : 'light';
      setEffective(next);
      applyTheme(next);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [mode]);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
  }, []);

  const value = useMemo(() => ({ mode, effective, setMode }), [mode, effective, setMode]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
