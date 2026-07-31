import { describe, expect, it } from 'vitest';
import { normalizeNtfyTopicUrl } from '@/lib/ntfy';

describe('normalizeNtfyTopicUrl', () => {
  it('maps bare topics to ntfy.sh', () => {
    expect(normalizeNtfyTopicUrl('eol-reminders')).toBe('https://ntfy.sh/eol-reminders');
  });

  it('accepts full URLs', () => {
    expect(normalizeNtfyTopicUrl('https://ntfy.example.com/my-topic')).toBe(
      'https://ntfy.example.com/my-topic',
    );
  });

  it('rejects empty or invalid input', () => {
    expect(normalizeNtfyTopicUrl('')).toBeNull();
    expect(normalizeNtfyTopicUrl('bad topic')).toBeNull();
    expect(normalizeNtfyTopicUrl('https://ntfy.sh/')).toBeNull();
  });
});
