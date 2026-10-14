import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The moment-photos bucket is private: user photos only load through signed
// URLs (StorageImage / resolveMomentPhotoUrl). A raw <img> with a storage path
// or legacy public URL renders a broken image. Raw <img> is fine for external
// assets (favicons, link previews, brand art); list those files here.
const RAW_IMG_ALLOWED: Record<string, number> = {
  'src/components/BrandLogo.tsx': 2,
  'src/components/StorageImage.tsx': 2, // the wrapper itself
  'src/components/LinkPreviewCard.tsx': 1,
  'src/components/views/StickyNotesView.tsx': 1, // favicon
  'src/components/views/LinksView.tsx': 1, // favicon
  'src/components/views/PlanView.tsx': 1, // favicon
  'src/components/views/MapView.tsx': 1, // pin HTML, fed pre-signed URLs
  'src/components/views/dues/DueCard.tsx': 1, // favicon
  'src/components/views/dues/DueLinkItems.tsx': 2, // favicon + preview
};

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'test' ? [] : tsxFiles(path);
    return path.endsWith('.tsx') ? [path] : [];
  });
}

describe('photo rendering', () => {
  it('uses StorageImage instead of raw <img> outside the allowlist', () => {
    const offenders = tsxFiles('src')
      .map((file) => [file, (readFileSync(file, 'utf8').match(/<img\b/g) || []).length] as const)
      .filter(([file, count]) => count > (RAW_IMG_ALLOWED[file] ?? 0))
      .map(([file, count]) => `${file}: ${count}`);
    expect(offenders).toEqual([]);
  });
});
