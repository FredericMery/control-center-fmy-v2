-- Setup storage bucket for memory photos
-- Run in Supabase SQL Editor

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'memory-photos',
  'memory-photos',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
ON CONFLICT (id) DO NOTHING;

-- Remove old policies if rerun
DROP POLICY IF EXISTS "Public can read memory photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload own memory photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own memory photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own memory photos" ON storage.objects;

CREATE POLICY "Public can read memory photos"
ON storage.objects
FOR SELECT
USING (bucket_id = 'memory-photos');

CREATE POLICY "Users can upload own memory photos"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'memory-photos'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can update own memory photos"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'memory-photos'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete own memory photos"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'memory-photos'
  AND auth.uid()::text = (storage.foldername(name))[1]
);
