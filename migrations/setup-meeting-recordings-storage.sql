-- Setup storage bucket for meeting recordings
-- Run in Supabase SQL Editor (or via migration runner)

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'meeting-recordings',
  'meeting-recordings',
  false,
  104857600,
  ARRAY[
    'audio/mpeg',
    'audio/mp3',
    'audio/mp4',
    'audio/x-m4a',
    'audio/wav',
    'audio/x-wav',
    'audio/webm',
    'audio/ogg'
  ]
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "meeting-recordings: owner access" ON storage.objects;

CREATE POLICY "meeting-recordings: owner access"
  ON storage.objects FOR ALL
  USING (
    bucket_id = 'meeting-recordings'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'meeting-recordings'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
