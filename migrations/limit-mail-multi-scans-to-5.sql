-- Limite le module courrier a 5 documents scannes par courrier.

UPDATE public.mail_items
SET
  scan_urls = CASE
    WHEN scan_urls IS NULL THEN NULL
    ELSE scan_urls[1:5]
  END,
  scan_file_names = CASE
    WHEN scan_file_names IS NULL THEN NULL
    ELSE scan_file_names[1:5]
  END
WHERE COALESCE(array_length(scan_urls, 1), 0) > 5
   OR COALESCE(array_length(scan_file_names, 1), 0) > 5;

ALTER TABLE public.mail_items
  DROP CONSTRAINT IF EXISTS mail_items_scan_urls_max_10;

ALTER TABLE public.mail_items
  DROP CONSTRAINT IF EXISTS mail_items_scan_urls_max_5;

ALTER TABLE public.mail_items
  ADD CONSTRAINT mail_items_scan_urls_max_5
  CHECK (scan_urls IS NULL OR array_length(scan_urls, 1) <= 5);

ALTER TABLE public.mail_items
  DROP CONSTRAINT IF EXISTS mail_items_scan_file_names_max_10;

ALTER TABLE public.mail_items
  DROP CONSTRAINT IF EXISTS mail_items_scan_file_names_max_5;

ALTER TABLE public.mail_items
  ADD CONSTRAINT mail_items_scan_file_names_max_5
  CHECK (scan_file_names IS NULL OR array_length(scan_file_names, 1) <= 5);
