import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { withExclusiveWrite } from '@/lib/writeSafety';

function asSettings(value: Json | null | undefined): Record<string, Json> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, Json>
    : {};
}

/**
 * Merge a settings patch against the latest row while holding a per-user lock.
 * This prevents independent UI hooks/tabs from overwriting unrelated settings
 * with a stale whole-object snapshot.
 */
export async function patchProfileSettings(
  userId: string,
  patch: Record<string, Json>,
): Promise<{ settings: Record<string, Json> | null; error: unknown }> {
  return withExclusiveWrite(`profile-settings:${userId}`, async () => {
    const { data, error: readError } = await supabase
      .from('profiles')
      .select('settings')
      .eq('user_id', userId)
      .single();

    if (readError) return { settings: null, error: readError };

    const settings = { ...asSettings(data?.settings), ...patch };
    const { error } = await supabase
      .from('profiles')
      .update({ settings })
      .eq('user_id', userId);

    return { settings: error ? null : settings, error };
  });
}

