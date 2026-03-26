-- Support multi-pieces jointes pour le module courrier (jusqu'a 10 scans)

ALTER TABLE public.mail_items
  ADD COLUMN IF NOT EXISTS scan_urls TEXT[];

ALTER TABLE public.mail_items
  ADD COLUMN IF NOT EXISTS scan_file_names TEXT[];

UPDATE public.mail_items
SET
  scan_urls = CASE
    WHEN scan_url IS NOT NULL AND COALESCE(array_length(scan_urls, 1), 0) = 0 THEN ARRAY[scan_url]
    ELSE scan_urls
  END,
  scan_file_names = CASE
    WHEN scan_file_name IS NOT NULL AND COALESCE(array_length(scan_file_names, 1), 0) = 0 THEN ARRAY[scan_file_name]
    ELSE scan_file_names
  END;

ALTER TABLE public.mail_items
  DROP CONSTRAINT IF EXISTS mail_items_scan_urls_max_10;

ALTER TABLE public.mail_items
  ADD CONSTRAINT mail_items_scan_urls_max_10
  CHECK (scan_urls IS NULL OR array_length(scan_urls, 1) <= 10);

ALTER TABLE public.mail_items
  DROP CONSTRAINT IF EXISTS mail_items_scan_file_names_max_10;

ALTER TABLE public.mail_items
  ADD CONSTRAINT mail_items_scan_file_names_max_10
  CHECK (scan_file_names IS NULL OR array_length(scan_file_names, 1) <= 10);
