-- =====================================================
-- TABLE EMAIL_SETTINGS (CLEAN INSTALL)
-- =====================================================

-- Supprimer la table si elle existe (avec toutes ses dépendances)
DROP TABLE IF EXISTS public.email_settings CASCADE;

-- Créer la table
CREATE TABLE public.email_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('facture', 'ndf')),
  email TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id, type)
);

-- Index
CREATE INDEX idx_email_settings_user_id ON public.email_settings(user_id);

-- Note: RLS désactivé pour simplifier (le service role key bypass RLS de toute façon)

