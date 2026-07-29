import { ImgHTMLAttributes, useEffect, useState } from 'react';
import { resolveMomentPhotoUrl } from '@/lib/momentPhotos';

/** <img> wrapper that turns storage paths / legacy public URLs into signed URLs. */
export function StorageImage({
  src,
  ...rest
}: { src: string } & Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'>) {
  const [resolved, setResolved] = useState(src);

  useEffect(() => {
    let cancelled = false;
    void resolveMomentPhotoUrl(src).then((url) => {
      if (!cancelled) setResolved(url);
    });
    return () => {
      cancelled = true;
    };
  }, [src]);

  return <img src={resolved} {...rest} />;
}
