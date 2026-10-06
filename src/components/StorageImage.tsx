import { ImgHTMLAttributes, useEffect, useState } from 'react';
import { momentPhotoObjectPath, resolveMomentPhotoUrl } from '@/lib/momentPhotos';

/** <img> wrapper that turns storage paths / legacy public URLs into signed URLs. */
export function StorageImage({
  src,
  loading,
  decoding,
  ...rest
}: { src: string } & Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'>) {
  const initialUrl = momentPhotoObjectPath(src) ? '' : src;
  const [resolved, setResolved] = useState({ source: src, url: initialUrl });

  useEffect(() => {
    let cancelled = false;
    void resolveMomentPhotoUrl(src).then((url) => {
      if (!cancelled) setResolved({ source: src, url });
    });
    return () => {
      cancelled = true;
    };
  }, [src]);

  // Never show the previous photo while the new source is being resolved.
  const url = resolved.source === src ? resolved.url : initialUrl;
  return (
    <img
      src={url || undefined}
      loading={loading ?? 'lazy'}
      decoding={decoding ?? 'async'}
      {...rest}
    />
  );
}
