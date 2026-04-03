-- Persistance des transferts courrier:
-- 1) memoriser le premier message IA + destinataire (baseline)
-- 2) exposer le dernier transfert rapidement
-- 3) historiser tous les transferts
-- 4) memoriser le PDF genere pour consultation

ALTER TABLE public.mail_items
  ADD COLUMN IF NOT EXISTS transfer_baseline_recipient_email TEXT,
  ADD COLUMN IF NOT EXISTS transfer_baseline_recipient_name TEXT,
  ADD COLUMN IF NOT EXISTS transfer_baseline_subject TEXT,
  ADD COLUMN IF NOT EXISTS transfer_baseline_message TEXT,
  ADD COLUMN IF NOT EXISTS transfer_baseline_created_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS transfer_last_recipient_email TEXT,
  ADD COLUMN IF NOT EXISTS transfer_last_recipient_name TEXT,
  ADD COLUMN IF NOT EXISTS transfer_last_subject TEXT,
  ADD COLUMN IF NOT EXISTS transfer_last_message TEXT,
  ADD COLUMN IF NOT EXISTS transfer_last_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS transfer_last_pdf_url TEXT,
  ADD COLUMN IF NOT EXISTS transfer_last_pdf_name TEXT,
  ADD COLUMN IF NOT EXISTS transfer_count INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.mail_item_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mail_item_id UUID NOT NULL REFERENCES public.mail_items(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_email TEXT NOT NULL,
  recipient_name TEXT,
  cc_emails TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  subject TEXT,
  message TEXT,
  ai_baseline_subject TEXT,
  ai_baseline_message TEXT,
  edited_by_user BOOLEAN NOT NULL DEFAULT false,
  task_id UUID,
  provider_message_id TEXT,
  pdf_url TEXT,
  pdf_file_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS mail_item_transfers_mail_item_id_idx
  ON public.mail_item_transfers (mail_item_id, created_at DESC);

CREATE INDEX IF NOT EXISTS mail_item_transfers_user_id_idx
  ON public.mail_item_transfers (user_id, created_at DESC);

ALTER TABLE public.mail_item_transfers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mail_item_transfers: user owns rows" ON public.mail_item_transfers;
CREATE POLICY "mail_item_transfers: user owns rows"
  ON public.mail_item_transfers FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
