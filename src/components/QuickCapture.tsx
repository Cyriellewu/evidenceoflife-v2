import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Check, Loader2, MapPin, X } from 'lucide-react';
import { reversePlace } from '@/lib/geoClient';
import { classifyGeoError, geoErrorMessage, getGeoPosition } from '@/lib/geolocation';
import { StorageImage } from '@/components/StorageImage';
import { cn } from '@/lib/utils';

type PlaceCategory = 'restaurant' | 'coffee' | 'grocery' | 'park' | 'museum' | 'other';
export interface QuickCaptureLocation { name: string; lat: number; lng: number; category: PlaceCategory }

/**
 * One-tap "photo + where I am" capture, opened from the home-screen widget
 * (/app?capture=1). Location fills itself in; the photo is the only thing the
 * person has to do. Saving makes an ordinary moment, so it shows in today's
 * Recap and, because it has a location, on the Map.
 */
export function QuickCapture({
  lang,
  uploadPhoto,
  onSave,
  onClose,
}: {
  lang: string;
  uploadPhoto: (file: File) => Promise<string | null>;
  onSave: (data: { text?: string; photos: string[]; location?: QuickCaptureLocation }) => Promise<unknown>;
  onClose: () => void;
}) {
  const zh = lang.startsWith('zh');
  const [location, setLocation] = useState<QuickCaptureLocation | null>(null);
  const [locating, setLocating] = useState(true);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { lat, lng } = await getGeoPosition({ force: true, allowCache: true });
        try {
          const place = await reversePlace({ lat, lng, lang });
          if (!cancelled) setLocation({ name: place.name || (zh ? '当前位置' : 'Current location'), lat: place.lat, lng: place.lng, category: (place.category || 'other') as PlaceCategory });
        } catch {
          if (!cancelled) setLocation({ name: zh ? '当前位置' : 'Current location', lat, lng, category: 'other' });
        }
      } catch (err) {
        if (!cancelled) setGeoError(geoErrorMessage(classifyGeoError(err), lang));
      } finally {
        if (!cancelled) setLocating(false);
      }
    })();
    return () => { cancelled = true; };
  }, [lang, zh]);

  const onFiles = useCallback(async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const url = await uploadPhoto(file);
        if (url) setPhotos(prev => [...prev, url]);
      }
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }, [uploadPhoto]);

  const canSave = !saving && !uploading && (photos.length > 0 || note.trim().length > 0);

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await onSave({ text: note.trim() || undefined, photos, location: location ?? undefined });
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setPhotos([]);
    setNote('');
    setSaved(false);
  };

  return (
    <div className="fixed inset-0 z-[300] flex flex-col bg-background" role="dialog" aria-modal="true" aria-label={zh ? '拍照记录' : 'Quick capture'}>
      <div className="flex items-center justify-between px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full text-foreground/70 hover:bg-muted/40" aria-label={zh ? '关闭' : 'Close'}>
          <X size={20} />
        </button>
        <div className="flex min-w-0 items-center gap-1.5 text-[13px] text-muted-foreground">
          {locating ? <Loader2 size={14} className="animate-spin" /> : <MapPin size={14} className={location ? 'text-primary' : ''} />}
          <span className="truncate">
            {locating ? (zh ? '正在定位…' : 'Finding where you are…') : location ? location.name : geoError ?? (zh ? '没有定位' : 'No location')}
          </span>
        </div>
        <span className="w-9" />
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6">
        {saved ? (
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/12 text-primary"><Check size={26} /></div>
            <p className="text-[17px] font-semibold">{zh ? '记下了' : 'Saved'}</p>
            <p className="max-w-[260px] text-[13px] text-muted-foreground">
              {location
                ? (zh ? '已经放进今天的回顾，也会出现在地图上。' : "It's in today's Recap and on your Map.")
                : (zh ? '已经放进今天的回顾。' : "It's in today's Recap.")}
            </p>
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={reset} className="h-10 rounded-full border border-border px-5 text-[14px] font-medium">{zh ? '再拍一张' : 'Take another'}</button>
              <button type="button" onClick={onClose} className="h-10 rounded-full bg-primary px-5 text-[14px] font-semibold text-primary-foreground">{zh ? '完成' : 'Done'}</button>
            </div>
          </div>
        ) : (
          <>
            {photos.length > 0 ? (
              <div className="flex max-w-full gap-2 overflow-x-auto">
                {photos.map((p, i) => (
                  <div key={p} className="relative flex-shrink-0">
                    <StorageImage src={p} alt="" className="h-44 w-44 rounded-2xl object-cover" />
                    <button type="button" onClick={() => setPhotos(prev => prev.filter((_, idx) => idx !== i))} className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-foreground/70 text-background" aria-label={zh ? '移除照片' : 'Remove photo'}>
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
            <label className={cn(
              'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-full bg-primary text-primary-foreground shadow-[0_12px_30px_-12px_hsl(var(--primary)/0.7)] transition-transform active:scale-95',
              photos.length > 0 ? 'h-16 w-16' : 'h-28 w-28',
            )}>
              {uploading ? <Loader2 size={photos.length ? 22 : 30} className="animate-spin" /> : <Camera size={photos.length ? 22 : 34} />}
              <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => void onFiles(e.target.files)} />
            </label>
            {photos.length === 0 && <p className="text-[14px] text-muted-foreground">{zh ? '点一下拍照' : 'Tap to take a photo'}</p>}
          </>
        )}
      </div>

      {!saved && (
        <div className="flex items-center gap-2 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
          <input
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder={zh ? '说一句（可选）' : 'Add a line (optional)'}
            className="h-11 min-w-0 flex-1 rounded-full border border-border bg-card px-4 text-[15px] focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <button type="button" onClick={() => void save()} disabled={!canSave} className="h-11 rounded-full bg-primary px-5 text-[15px] font-semibold text-primary-foreground disabled:opacity-40">
            {saving ? <Loader2 size={16} className="animate-spin" /> : (zh ? '保存' : 'Save')}
          </button>
        </div>
      )}
    </div>
  );
}
