-- Aliases emails par utilisateur pour attribution fiable des taches inbound
CREATE TABLE IF NOT EXISTS public.user_email_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email_alias TEXT NOT NULL,
  label TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_email_aliases_email_alias_format CHECK (position('@' in email_alias) > 1)
);

-- Evite les collisions: un alias email actif doit pointer vers un seul user
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_email_aliases_email_alias_unique
  ON public.user_email_aliases (lower(email_alias));

CREATE INDEX IF NOT EXISTS idx_user_email_aliases_user_id
  ON public.user_email_aliases(user_id);

CREATE INDEX IF NOT EXISTS idx_user_email_aliases_active
  ON public.user_email_aliases(is_active);

ALTER TABLE public.user_email_aliases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own email aliases" ON public.user_email_aliases;
CREATE POLICY "Users can view their own email aliases"
  ON public.user_email_aliases FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own email aliases" ON public.user_email_aliases;
CREATE POLICY "Users can insert their own email aliases"
  ON public.user_email_aliases FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own email aliases" ON public.user_email_aliases;
CREATE POLICY "Users can update their own email aliases"
  ON public.user_email_aliases FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own email aliases" ON public.user_email_aliases;
CREATE POLICY "Users can delete their own email aliases"
  ON public.user_email_aliases FOR DELETE
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.update_user_email_aliases_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  NEW.email_alias = lower(trim(NEW.email_alias));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_user_email_aliases_updated_at ON public.user_email_aliases;
CREATE TRIGGER update_user_email_aliases_updated_at
  BEFORE UPDATE ON public.user_email_aliases
  FOR EACH ROW
  EXECUTE FUNCTION public.update_user_email_aliases_updated_at();

-- Normalise aussi a l'insertion
CREATE OR REPLACE FUNCTION public.normalize_user_email_aliases_on_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.email_alias = lower(trim(NEW.email_alias));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS normalize_user_email_aliases_on_insert ON public.user_email_aliases;
CREATE TRIGGER normalize_user_email_aliases_on_insert
  BEFORE INSERT ON public.user_email_aliases
  FOR EACH ROW
  EXECUTE FUNCTION public.normalize_user_email_aliases_on_insert();
