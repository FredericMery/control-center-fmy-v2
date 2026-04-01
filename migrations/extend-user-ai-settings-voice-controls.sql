-- Parametrage voix IA persistant (Noa)

ALTER TABLE public.user_ai_settings
  ADD COLUMN IF NOT EXISTS assistant_voice_name TEXT,
  ADD COLUMN IF NOT EXISTS assistant_voice_rate DOUBLE PRECISION NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS assistant_voice_pitch DOUBLE PRECISION NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS assistant_voice_volume DOUBLE PRECISION NOT NULL DEFAULT 1;

ALTER TABLE public.user_ai_settings
  DROP CONSTRAINT IF EXISTS user_ai_settings_assistant_voice_rate_check,
  DROP CONSTRAINT IF EXISTS user_ai_settings_assistant_voice_pitch_check,
  DROP CONSTRAINT IF EXISTS user_ai_settings_assistant_voice_volume_check;

ALTER TABLE public.user_ai_settings
  ADD CONSTRAINT user_ai_settings_assistant_voice_rate_check
    CHECK (assistant_voice_rate >= 0.5 AND assistant_voice_rate <= 2),
  ADD CONSTRAINT user_ai_settings_assistant_voice_pitch_check
    CHECK (assistant_voice_pitch >= 0 AND assistant_voice_pitch <= 2),
  ADD CONSTRAINT user_ai_settings_assistant_voice_volume_check
    CHECK (assistant_voice_volume >= 0 AND assistant_voice_volume <= 1);
