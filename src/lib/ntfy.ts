/** Minimal ntfy.sh (or self-hosted) publisher for life reminders. */

export function normalizeNtfyTopicUrl(topicOrUrl: string): string | null {
  const raw = topicOrUrl.trim();
  if (!raw) return null;

  if (/^https?:\/\//i.test(raw)) {
    try {
      const u = new URL(raw);
      if (!u.pathname || u.pathname === '/') return null;
      return u.toString().replace(/\/$/, '');
    } catch {
      return null;
    }
  }

  // Bare topic name → public ntfy.sh
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(raw)) return null;
  return `https://ntfy.sh/${raw}`;
}

export async function publishNtfy(options: {
  topicOrUrl: string;
  title: string;
  body: string;
  clickUrl?: string;
}): Promise<boolean> {
  const endpoint = normalizeNtfyTopicUrl(options.topicOrUrl);
  if (!endpoint) return false;

  const headers: Record<string, string> = {
    Title: options.title,
    'Content-Type': 'text/plain; charset=utf-8',
  };
  if (options.clickUrl) headers.Click = options.clickUrl;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: options.body,
    });
    return res.ok;
  } catch {
    return false;
  }
}
