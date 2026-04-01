-- Reglages voix IA supplementaires

ALTER TABLE public.user_ai_settings
  ADD COLUMN IF NOT EXISTS assistant_voice_lang TEXT NOT NULL DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS assistant_auto_read BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.user_ai_settings
  DROP CONSTRAINT IF EXISTS user_ai_settings_assistant_voice_lang_check;

ALTER TABLE public.user_ai_settings
  ADD CONSTRAINT user_ai_settings_assistant_voice_lang_check
    CHECK (assistant_voice_lang IN ('auto', 'fr-FR', 'en-US', 'es-ES'));
