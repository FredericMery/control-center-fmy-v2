-- ============================================================
-- MODULE EMAIL ASSISTANT — inbox, tri IA, brouillons, envoi supervise
-- ============================================================

CREATE TABLE IF NOT EXISTS public.email_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  external_email_id TEXT NULL,
  thread_id TEXT NULL,
  direction TEXT NOT NULL DEFAULT 'inbound' CHECK (direction IN ('inbound', 'outbound')),

  context TEXT NOT NULL DEFAULT 'pro' CHECK (context IN ('pro', 'perso')),
  mailbox TEXT NOT NULL DEFAULT 'main',

  sender_email TEXT NULL,
  sender_name TEXT NULL,
  to_emails TEXT[] NOT NULL DEFAULT '{}',
  cc_emails TEXT[] NOT NULL DEFAULT '{}',
  bcc_emails TEXT[] NOT NULL DEFAULT '{}',

  subject TEXT NULL,
  body_text TEXT NULL,
  body_html TEXT NULL,
  headers JSONB NOT NULL DEFAULT '{}'::jsonb,
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,

  received_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  ai_status TEXT NOT NULL DEFAULT 'pending' CHECK (ai_status IN ('pending', 'analyzed', 'error')),
  ai_summary TEXT NULL,
  ai_confidence NUMERIC(4,2) NULL,
  ai_category TEXT NULL,
  ai_priority TEXT NULL CHECK (ai_priority IN ('urgent', 'high', 'normal', 'low')),
  ai_tags TEXT[] NOT NULL DEFAULT '{}',
  ai_action TEXT NOT NULL DEFAULT 'classer' CHECK (ai_action IN ('classer', 'repondre')),
  ai_reasoning TEXT NULL,

  response_status TEXT NOT NULL DEFAULT 'none'
    CHECK (response_status IN ('none', 'draft_ready', 'approved', 'sent', 'cancelled')),
  response_required BOOLEAN NOT NULL DEFAULT FALSE,

  archived BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_email_messages_user_received
  ON public.email_messages (user_id, received_at DESC NULLS LAST, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_messages_user_action
  ON public.email_messages (user_id, ai_action, response_status, archived);

CREATE INDEX IF NOT EXISTS idx_email_messages_sender
  ON public.email_messages (user_id, sender_email);

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_messages_external_email_unique
  ON public.email_messages (user_id, external_email_id)
  WHERE external_email_id IS NOT NULL;

ALTER TABLE public.email_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own email messages" ON public.email_messages;
CREATE POLICY "Users can view their own email messages"
  ON public.email_messages FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own email messages" ON public.email_messages;
CREATE POLICY "Users can insert their own email messages"
  ON public.email_messages FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own email messages" ON public.email_messages;
CREATE POLICY "Users can update their own email messages"
  ON public.email_messages FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own email messages" ON public.email_messages;
CREATE POLICY "Users can delete their own email messages"
  ON public.email_messages FOR DELETE
  USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.email_reply_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.email_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  version INT NOT NULL DEFAULT 1,
  is_current BOOLEAN NOT NULL DEFAULT TRUE,

  tone TEXT NOT NULL DEFAULT 'professionnel',
  language TEXT NOT NULL DEFAULT 'fr',
  proposed_subject TEXT NULL,
  proposed_body TEXT NOT NULL,

  ai_model TEXT NULL,
  ai_confidence NUMERIC(4,2) NULL,
  ai_prompt_snapshot TEXT NULL,

  edited_by_user BOOLEAN NOT NULL DEFAULT FALSE,
  approved_at TIMESTAMPTZ NULL,
  sent_at TIMESTAMPTZ NULL,
  send_provider TEXT NULL,
  provider_message_id TEXT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_reply_drafts_message_current
  ON public.email_reply_drafts (message_id, is_current);

CREATE INDEX IF NOT EXISTS idx_email_reply_drafts_user
  ON public.email_reply_drafts (user_id, created_at DESC);

ALTER TABLE public.email_reply_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own reply drafts" ON public.email_reply_drafts;
CREATE POLICY "Users can view their own reply drafts"
  ON public.email_reply_drafts FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own reply drafts" ON public.email_reply_drafts;
CREATE POLICY "Users can insert their own reply drafts"
  ON public.email_reply_drafts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own reply drafts" ON public.email_reply_drafts;
CREATE POLICY "Users can update their own reply drafts"
  ON public.email_reply_drafts FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own reply drafts" ON public.email_reply_drafts;
CREATE POLICY "Users can delete their own reply drafts"
  ON public.email_reply_drafts FOR DELETE
  USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.email_processing_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  message_id UUID NULL REFERENCES public.email_messages(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  level TEXT NOT NULL DEFAULT 'info' CHECK (level IN ('info', 'warning', 'error')),
  message TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_processing_logs_user_date
  ON public.email_processing_logs (user_id, created_at DESC);

ALTER TABLE public.email_processing_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own email logs" ON public.email_processing_logs;
CREATE POLICY "Users can view their own email logs"
  ON public.email_processing_logs FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own email logs" ON public.email_processing_logs;
CREATE POLICY "Users can insert their own email logs"
  ON public.email_processing_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

CREATE OR REPLACE FUNCTION public.update_email_messages_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_email_messages_updated_at ON public.email_messages;
CREATE TRIGGER trg_update_email_messages_updated_at
  BEFORE UPDATE ON public.email_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_email_messages_updated_at();

CREATE OR REPLACE FUNCTION public.update_email_reply_drafts_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_email_reply_drafts_updated_at ON public.email_reply_drafts;
CREATE TRIGGER trg_update_email_reply_drafts_updated_at
  BEFORE UPDATE ON public.email_reply_drafts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_email_reply_drafts_updated_at();
