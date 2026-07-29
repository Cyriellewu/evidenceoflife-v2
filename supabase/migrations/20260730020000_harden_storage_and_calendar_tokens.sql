-- Harden moment-photos: private bucket + owner-only read.
-- Client must use createSignedUrl (see src/lib/momentPhotos.ts).

UPDATE storage.buckets
SET public = false
WHERE id = 'moment-photos';

DROP POLICY IF EXISTS "Moment photos are publicly accessible" ON storage.objects;

CREATE POLICY "Users can view their own moment photos"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'moment-photos'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Calendar OAuth tokens must only be written by service-role edge functions.
DROP POLICY IF EXISTS "Users can insert their own tokens" ON public.google_calendar_tokens;
DROP POLICY IF EXISTS "Users can update their own tokens" ON public.google_calendar_tokens;
DROP POLICY IF EXISTS "Users can delete their own tokens" ON public.google_calendar_tokens;
