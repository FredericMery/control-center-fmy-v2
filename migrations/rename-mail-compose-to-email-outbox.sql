-- Renomme la table historique mail_compose pour l'aligner avec le module email

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'mail_compose'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'email_outbox'
  ) THEN
    ALTER TABLE public.mail_compose RENAME TO email_outbox;
  END IF;
END $$;

ALTER INDEX IF EXISTS public.idx_mail_compose_user_id
  RENAME TO idx_email_outbox_user_id;

ALTER INDEX IF EXISTS public.idx_mail_compose_sent_at
  RENAME TO idx_email_outbox_sent_at;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'email_outbox'
      AND policyname = 'Users can view their own sent emails'
  ) THEN
    ALTER POLICY "Users can view their own sent emails"
      ON public.email_outbox
      RENAME TO "Users can view their own outbox emails";
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'email_outbox'
      AND policyname = 'Users can insert their own sent emails'
  ) THEN
    ALTER POLICY "Users can insert their own sent emails"
      ON public.email_outbox
      RENAME TO "Users can insert their own outbox emails";
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'email_outbox'
      AND policyname = 'Users can delete their own sent emails'
  ) THEN
    ALTER POLICY "Users can delete their own sent emails"
      ON public.email_outbox
      RENAME TO "Users can delete their own outbox emails";
  END IF;
END $$;
