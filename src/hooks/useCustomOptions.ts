import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { Json } from '@/integrations/supabase/types';
import { patchProfileSettings } from '@/lib/profileSettings';

const DEFAULT_PLAN_TAGS = [
  { key: 'ptag.gym', label: 'Gym' },
  { key: 'ptag.library', label: 'Library' },
  { key: 'ptag.hw', label: 'HW' },
  { key: 'ptag.wellness', label: 'Wellness' },
  { key: 'ptag.meeting', label: 'Meeting' },
  { key: 'ptag.errands', label: 'Errands' },
  { key: 'ptag.study', label: 'Study' },
];

const DEFAULT_RECAP_TAGS = [
  { key: 'tag.hangout', en: 'Hangout' },
  { key: 'tag.dineOut', en: 'Dine out' },
  { key: 'tag.cook', en: 'Cook' },
  { key: 'tag.groceries', en: 'Groceries' },
  { key: 'tag.walk', en: 'Walk' },
  { key: 'tag.coffee', en: 'Coffee' },
  { key: 'tag.movie', en: 'Movie' },
];

const DEFAULT_EMOJIS = ['🛒', '🍜', '☕', '💻', '🏃', '✈️', '🎬', '🎵', '📚', '🌳', '✨', '➕'];

interface CustomOptionsData {
  customPlanTags: string[];
  customRecapTags: string[];
  customEmojis: string[];
  planTagOrder: string[];
  recapTagOrder: string[];
  emojiOrder: string[];
  hiddenDefaultPlanTags: string[];
  hiddenDefaultRecapTags: string[];
}

const EMPTY_DATA: CustomOptionsData = {
  customPlanTags: [],
  customRecapTags: [],
  customEmojis: [],
  planTagOrder: [],
  recapTagOrder: [],
  emojiOrder: [],
  hiddenDefaultPlanTags: [],
  hiddenDefaultRecapTags: [],
};

const LOCAL_KEYS = [
  'custom-plan-tags',
  'custom-recap-tags',
  'custom-emojis',
  'plan-tag-order',
  'recap-tag-order',
  'emoji-order',
  'hidden-default-plan-tags',
  'hidden-default-recap-tags',
] as const;

function loadLocal(): CustomOptionsData {
  const get = (key: string, fallback: string[] = []) => {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
  };
  return {
    customPlanTags: get('custom-plan-tags'),
    customRecapTags: get('custom-recap-tags'),
    customEmojis: get('custom-emojis'),
    planTagOrder: get('plan-tag-order'),
    recapTagOrder: get('recap-tag-order'),
    emojiOrder: get('emoji-order'),
    hiddenDefaultPlanTags: get('hidden-default-plan-tags'),
    hiddenDefaultRecapTags: get('hidden-default-recap-tags'),
  };
}

function saveLocal(data: CustomOptionsData) {
  try {
    localStorage.setItem('custom-plan-tags', JSON.stringify(data.customPlanTags));
    localStorage.setItem('custom-recap-tags', JSON.stringify(data.customRecapTags));
    localStorage.setItem('custom-emojis', JSON.stringify(data.customEmojis));
    localStorage.setItem('plan-tag-order', JSON.stringify(data.planTagOrder));
    localStorage.setItem('recap-tag-order', JSON.stringify(data.recapTagOrder));
    localStorage.setItem('emoji-order', JSON.stringify(data.emojiOrder));
    localStorage.setItem('hidden-default-plan-tags', JSON.stringify(data.hiddenDefaultPlanTags));
    localStorage.setItem('hidden-default-recap-tags', JSON.stringify(data.hiddenDefaultRecapTags));
  } catch {
    return;
  }
}

function hasLocalData(d: CustomOptionsData) {
  return d.customPlanTags.length > 0 || d.customRecapTags.length > 0 || d.customEmojis.length > 0 ||
    d.planTagOrder.length > 0 || d.recapTagOrder.length > 0 || d.emojiOrder.length > 0 ||
    d.hiddenDefaultPlanTags.length > 0 || d.hiddenDefaultRecapTags.length > 0;
}

function parseRemote(settings: Record<string, unknown>): CustomOptionsData | null {
  const d = settings.customOptions;
  if (!d || typeof d !== 'object' || Array.isArray(d)) return null;
  const o = d as Record<string, unknown>;
  const arr = (key: string): string[] => Array.isArray(o[key]) ? (o[key] as string[]) : [];
  return {
    customPlanTags: arr('customPlanTags'),
    customRecapTags: arr('customRecapTags'),
    customEmojis: arr('customEmojis'),
    planTagOrder: arr('planTagOrder'),
    recapTagOrder: arr('recapTagOrder'),
    emojiOrder: arr('emojiOrder'),
    hiddenDefaultPlanTags: arr('hiddenDefaultPlanTags'),
    hiddenDefaultRecapTags: arr('hiddenDefaultRecapTags'),
  };
}

function moveItem<T>(arr: T[], from: number, to: number): T[] {
  if (from < 0 || from >= arr.length || to < 0 || to >= arr.length) return arr;
  const result = [...arr];
  const [item] = result.splice(from, 1);
  result.splice(to, 0, item);
  return result;
}

export function useCustomOptions() {
  const { user, isDemo, authReady } = useAuth();
  const [data, setData] = useState<CustomOptionsData>(() => loadLocal());
  const [, setProfileSettings] = useState<Record<string, unknown>>({});
  const hydratedRef = useRef(false);
  const migratedRef = useRef(false);
  const lastSavedRef = useRef('');

  useEffect(() => {
    const hydrate = async () => {
      if (!authReady) return;

      if (!user || isDemo) {
        const local = loadLocal();
        setData(local);
        hydratedRef.current = true;
        lastSavedRef.current = JSON.stringify(local);
        return;
      }

      try {
        const { data: row, error } = await supabase
          .from('profiles')
          .select('settings')
          .eq('user_id', user.id)
          .single();

        if (error) throw error;

        const settings: Record<string, unknown> =
          row?.settings && typeof row.settings === 'object' && !Array.isArray(row.settings)
            ? (row.settings as Record<string, unknown>)
            : {};

        setProfileSettings(settings);

        const remote = parseRemote(settings);
        const local = loadLocal();

        if (remote && hasLocalData(remote)) {
          setData(remote);
          hydratedRef.current = true;
          lastSavedRef.current = JSON.stringify(remote);
          return;
        }

        if (hasLocalData(local) && !migratedRef.current) {
          migratedRef.current = true;
          setData(local);
          hydratedRef.current = true;
          lastSavedRef.current = JSON.stringify(local);

          const { settings: nextSettings } = await patchProfileSettings(user.id, {
            customOptions: local as unknown as Json,
          });
          if (nextSettings) setProfileSettings(nextSettings as Record<string, unknown>);
          return;
        }

        setData(EMPTY_DATA);
        hydratedRef.current = true;
        lastSavedRef.current = JSON.stringify(EMPTY_DATA);
      } catch (err) {
        console.error('Failed to hydrate custom options:', err);
        const local = loadLocal();
        setData(local);
        hydratedRef.current = true;
      }
    };

    void hydrate();
  }, [authReady, isDemo, user]);

  useEffect(() => {
    if (!hydratedRef.current || !authReady) return;

    const serialized = JSON.stringify(data);
    if (serialized === lastSavedRef.current) return;
    lastSavedRef.current = serialized;

    saveLocal(data);
    if (!user || isDemo) return;

    const persist = async () => {
      const { settings: nextSettings, error } = await patchProfileSettings(user.id, {
        customOptions: data as unknown as Json,
      });
      if (!error && nextSettings) setProfileSettings(nextSettings as Record<string, unknown>);
    };
    void persist();
  }, [authReady, data, isDemo, user]);

  const update = useCallback((fn: (prev: CustomOptionsData) => CustomOptionsData) => setData(fn), []);

  const addPlanTag = useCallback((tag: string) => {
    const trimmed = tag.trim();
    if (trimmed) update(d => d.customPlanTags.includes(trimmed) ? d : { ...d, customPlanTags: [...d.customPlanTags, trimmed] });
  }, [update]);

  const removePlanTag = useCallback((tag: string) => {
    const isDefault = DEFAULT_PLAN_TAGS.some(d => d.key === tag);
    if (isDefault) {
      update(d => ({ ...d, hiddenDefaultPlanTags: d.hiddenDefaultPlanTags.includes(tag) ? d.hiddenDefaultPlanTags : [...d.hiddenDefaultPlanTags, tag] }));
    } else {
      update(d => ({ ...d, customPlanTags: d.customPlanTags.filter(t => t !== tag) }));
    }
  }, [update]);

  const addRecapTag = useCallback((tag: string) => {
    const trimmed = tag.trim();
    if (trimmed) update(d => d.customRecapTags.includes(trimmed) ? d : { ...d, customRecapTags: [...d.customRecapTags, trimmed] });
  }, [update]);

  const removeRecapTag = useCallback((tag: string) => {
    const isDefault = DEFAULT_RECAP_TAGS.some(d => d.key === tag);
    if (isDefault) {
      update(d => ({ ...d, hiddenDefaultRecapTags: d.hiddenDefaultRecapTags.includes(tag) ? d.hiddenDefaultRecapTags : [...d.hiddenDefaultRecapTags, tag] }));
    } else {
      update(d => ({ ...d, customRecapTags: d.customRecapTags.filter(t => t !== tag) }));
    }
  }, [update]);

  const addEmoji = useCallback((emoji: string) => {
    if (emoji) update(d => d.customEmojis.includes(emoji) ? d : { ...d, customEmojis: [...d.customEmojis, emoji] });
  }, [update]);

  const removeEmoji = useCallback((emoji: string) => {
    update(d => ({ ...d, customEmojis: d.customEmojis.filter(e => e !== emoji) }));
  }, [update]);

  const orderedPlanTags = (() => {
    const allKeys = [...DEFAULT_PLAN_TAGS.map(d => d.key).filter(k => !data.hiddenDefaultPlanTags.includes(k)), ...data.customPlanTags];
    if (data.planTagOrder.length > 0) {
      const ordered = data.planTagOrder.filter(k => allKeys.includes(k));
      return [...ordered, ...allKeys.filter(k => !ordered.includes(k))];
    }
    return allKeys;
  })();

  const orderedRecapTags = (() => {
    const allKeys = [...DEFAULT_RECAP_TAGS.map(d => d.key).filter(k => !data.hiddenDefaultRecapTags.includes(k)), ...data.customRecapTags];
    if (data.recapTagOrder.length > 0) {
      const ordered = data.recapTagOrder.filter(k => allKeys.includes(k));
      return [...ordered, ...allKeys.filter(k => !ordered.includes(k))];
    }
    return allKeys;
  })();

  const allEmojis = (() => {
    const all = [...DEFAULT_EMOJIS, ...data.customEmojis.filter(e => !DEFAULT_EMOJIS.includes(e))];
    if (data.emojiOrder.length > 0) {
      const ordered = data.emojiOrder.filter(e => all.includes(e));
      return [...ordered, ...all.filter(e => !ordered.includes(e))];
    }
    return all;
  })();

  const reorderPlanTag = useCallback((from: number, to: number) => {
    update(d => {
      const allKeys = [...DEFAULT_PLAN_TAGS.map(t => t.key), ...d.customPlanTags];
      const current = d.planTagOrder.length > 0 ? d.planTagOrder.filter(k => allKeys.includes(k)) : allKeys;
      const full = [...current, ...allKeys.filter(k => !current.includes(k))];
      return { ...d, planTagOrder: moveItem(full, from, to) };
    });
  }, [update]);

  const reorderRecapTag = useCallback((from: number, to: number) => {
    update(d => {
      const allKeys = [...DEFAULT_RECAP_TAGS.map(t => t.key), ...d.customRecapTags];
      const current = d.recapTagOrder.length > 0 ? d.recapTagOrder.filter(k => allKeys.includes(k)) : allKeys;
      const full = [...current, ...allKeys.filter(k => !current.includes(k))];
      return { ...d, recapTagOrder: moveItem(full, from, to) };
    });
  }, [update]);

  const reorderEmoji = useCallback((from: number, to: number) => {
    update(d => {
      const all = [...DEFAULT_EMOJIS, ...d.customEmojis.filter(e => !DEFAULT_EMOJIS.includes(e))];
      const current = d.emojiOrder.length > 0 ? d.emojiOrder.filter(e => all.includes(e)) : all;
      const full = [...current, ...all.filter(e => !current.includes(e))];
      return { ...d, emojiOrder: moveItem(full, from, to) };
    });
  }, [update]);

  return {
    defaultPlanTags: DEFAULT_PLAN_TAGS,
    customPlanTags: data.customPlanTags,
    addPlanTag,
    removePlanTag,
    orderedPlanTags,
    reorderPlanTag,
    defaultRecapTags: DEFAULT_RECAP_TAGS,
    customRecapTags: data.customRecapTags,
    addRecapTag,
    removeRecapTag,
    orderedRecapTags,
    reorderRecapTag,
    defaultEmojis: DEFAULT_EMOJIS,
    customEmojis: data.customEmojis,
    allEmojis,
    addEmoji,
    removeEmoji,
    reorderEmoji,
  };
}
