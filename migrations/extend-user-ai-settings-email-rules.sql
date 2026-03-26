-- Extend user_ai_settings with global email AI behavior controls.

ALTER TABLE public.user_ai_settings
  ADD COLUMN IF NOT EXISTS email_reply_scope TEXT NOT NULL DEFAULT 'to_only';

ALTER TABLE public.user_ai_settings
  ADD COLUMN IF NOT EXISTS email_global_instructions TEXT NOT NULL DEFAULT '';

ALTER TABLE public.user_ai_settings
  ADD COLUMN IF NOT EXISTS email_do_rules TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE public.user_ai_settings
  ADD COLUMN IF NOT EXISTS email_dont_rules TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE public.user_ai_settings
  ADD COLUMN IF NOT EXISTS email_signature TEXT NOT NULL DEFAULT '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_ai_settings_email_reply_scope_check'
      AND conrelid = 'public.user_ai_settings'::regclass
  ) THEN
    ALTER TABLE public.user_ai_settings
      ADD CONSTRAINT user_ai_settings_email_reply_scope_check
      CHECK (email_reply_scope IN ('to_only', 'all', 'none'));
  END IF;
END;
$$;
