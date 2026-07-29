import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { Json } from '@/integrations/supabase/types';

export interface Profile {
  id: string;
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  bedtime_hour: number;
  bedtime_minute: number;
  wake_hour: number;
  wake_minute: number;
  homepage_image_url: string | null;
  language: string;
  settings: Json;
}

const DEFAULT_DEMO_PROFILE: Profile = {
  id: 'demo-profile',
  user_id: 'demo-user-000',
  display_name: 'Demo User',
  avatar_url: null,
  bedtime_hour: 23,
  bedtime_minute: 30,
  wake_hour: 8,
  wake_minute: 0,
  homepage_image_url: null,
  language: 'en',
  settings: {},
};

export function useProfile() {
  const { user, isDemo } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async () => {
    if (!user) return;
    if (isDemo) {
      setProfile(DEFAULT_DEMO_PROFILE);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (!error && data) {
        setProfile(data as unknown as Profile);
      }
    } catch (err) {
      console.error('Failed to fetch profile (exception):', err);
    } finally {
      setLoading(false);
    }
  }, [user, isDemo]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  // Listen for profile updates from other hook instances
  useEffect(() => {
    const handler = () => { fetchProfile(); };
    window.addEventListener('profile-updated', handler);
    return () => window.removeEventListener('profile-updated', handler);
  }, [fetchProfile]);

  const updateProfile = useCallback(async (updates: Partial<Profile>) => {
    if (!user || !profile) return;
    if (isDemo) {
      setProfile(prev => prev ? { ...prev, ...updates } : prev);
      window.dispatchEvent(new CustomEvent('profile-updated'));
      return;
    }
    const { error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('user_id', user.id);
    if (!error) {
      setProfile(prev => prev ? { ...prev, ...updates } : prev);
      window.dispatchEvent(new CustomEvent('profile-updated'));
    }
  }, [user, profile, isDemo]);

  const updateSettings = useCallback(async (updates: Record<string, Json>) => {
    const currentSettings =
      profile?.settings && typeof profile.settings === 'object' && !Array.isArray(profile.settings)
        ? profile.settings as Record<string, Json>
        : {};

    await updateProfile({
      settings: {
        ...currentSettings,
        ...updates,
      },
    } as Partial<Profile>);
  }, [profile?.settings, updateProfile]);

  const uploadHomepageImage = useCallback(async (file: File): Promise<string | null> => {
    if (!user) return null;
    if (isDemo) {
      // In demo mode, use a data URL
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.readAsDataURL(file);
      });
    }
    const ext = file.name.split('.').pop() || 'jpg';
    const path = `${user.id}/homepage-${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from('moment-photos')
      .upload(path, file, { upsert: true, contentType: file.type || undefined });
    if (error) { console.error('Upload failed:', error); return null; }
    return path;
  }, [user, isDemo]);

  return { profile, loading, updateProfile, updateSettings, uploadHomepageImage, refetch: fetchProfile };
}
