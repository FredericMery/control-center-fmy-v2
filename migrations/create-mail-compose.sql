-- Table pour le suivi des emails envoyés depuis le module courrier (compose)

CREATE TABLE IF NOT EXISTS public.mail_compose (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  context      TEXT        NOT NULL DEFAULT 'pro' CHECK (context IN ('pro', 'perso')),
  from_email   TEXT        NOT NULL,
  from_name    TEXT,
  to_emails    TEXT[]      NOT NULL,
  cc_emails    TEXT[],
  subject      TEXT        NOT NULL,
  body         TEXT        NOT NULL,
  resend_id    TEXT,
  status       TEXT        NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed', 'draft')),
  sent_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mail_compose_user_id
  ON public.mail_compose(user_id);

CREATE INDEX IF NOT EXISTS idx_mail_compose_sent_at
  ON public.mail_compose(user_id, sent_at DESC);

ALTER TABLE public.mail_compose ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own sent emails" ON public.mail_compose;
CREATE POLICY "Users can view their own sent emails"
  ON public.mail_compose FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own sent emails" ON public.mail_compose;
CREATE POLICY "Users can insert their own sent emails"
  ON public.mail_compose FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own sent emails" ON public.mail_compose;
CREATE POLICY "Users can delete their own sent emails"
  ON public.mail_compose FOR DELETE
  USING (auth.uid() = user_id);
