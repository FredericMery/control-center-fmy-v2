-- ============================================================
-- MODULE COURRIER — Mail Management System
-- ============================================================

-- Table principale des courriers
CREATE TABLE IF NOT EXISTS mail_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Classification
  context         TEXT NOT NULL CHECK (context IN ('pro', 'perso')) DEFAULT 'pro',
  mail_type       TEXT NOT NULL DEFAULT 'autre',
  -- mail_type: facture | contrat | administratif | bancaire | juridique | fiscal |
  --            assurance | sante | immobilier | relance | offre_commerciale | autre

  -- Expéditeur
  sender_name     TEXT,
  sender_address  TEXT,
  sender_email    TEXT,

  -- Contenu
  subject         TEXT,
  reference       TEXT,        -- N° de référence/dossier
  summary         TEXT,        -- Résumé IA
  full_text       TEXT,        -- Texte OCR complet extrait

  -- Dates
  received_at     DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date        DATE,        -- Échéance / date limite de réponse
  closed_at       TIMESTAMPTZ,

  -- Statut de traitement
  status          TEXT NOT NULL DEFAULT 'recu'
                  CHECK (status IN ('recu','en_attente','en_cours','traite','archive','clos')),

  -- Action requise
  action_required BOOLEAN NOT NULL DEFAULT false,
  action_note     TEXT,

  -- Priorité
  priority        TEXT NOT NULL DEFAULT 'normal'
                  CHECK (priority IN ('urgent','haute','normal','basse')),

  -- Scan / image
  scan_url        TEXT,        -- URL du scan stocké dans Supabase storage
  scan_file_name  TEXT,

  -- IA
  ai_analyzed     BOOLEAN NOT NULL DEFAULT false,
  ai_tags         TEXT[],      -- tags détectés par IA
  ai_confidence   NUMERIC(4,2),-- score de confiance 0-1

  -- Suivi / réponse
  replied         BOOLEAN NOT NULL DEFAULT false,
  replied_at      TIMESTAMPTZ,
  reply_note      TEXT,

  -- Notes libres
  notes           TEXT,

  -- Timestamps
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index de performance
CREATE INDEX IF NOT EXISTS mail_items_user_id_idx       ON mail_items (user_id);
CREATE INDEX IF NOT EXISTS mail_items_status_idx        ON mail_items (user_id, status);
CREATE INDEX IF NOT EXISTS mail_items_context_idx       ON mail_items (user_id, context);
CREATE INDEX IF NOT EXISTS mail_items_mail_type_idx     ON mail_items (user_id, mail_type);
CREATE INDEX IF NOT EXISTS mail_items_received_at_idx   ON mail_items (user_id, received_at DESC);
CREATE INDEX IF NOT EXISTS mail_items_sender_idx        ON mail_items (user_id, sender_name);
CREATE INDEX IF NOT EXISTS mail_items_due_date_idx      ON mail_items (user_id, due_date);
CREATE INDEX IF NOT EXISTS mail_items_priority_idx      ON mail_items (user_id, priority);

-- RLS
ALTER TABLE mail_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mail_items: user owns rows"
  ON mail_items FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.update_mail_items_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.update_mail_items_updated_at() SET search_path = public, pg_catalog;

CREATE TRIGGER mail_items_updated_at
  BEFORE UPDATE ON mail_items
  FOR EACH ROW EXECUTE FUNCTION public.update_mail_items_updated_at();

-- Storage bucket pour les scans
INSERT INTO storage.buckets (id, name, public)
VALUES ('mail-scans', 'mail-scans', false)
ON CONFLICT (id) DO NOTHING;

-- Politique storage : chaque user accède uniquement à son dossier
CREATE POLICY "mail-scans: owner access"
  ON storage.objects FOR ALL
  USING (
    bucket_id = 'mail-scans'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'mail-scans'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
