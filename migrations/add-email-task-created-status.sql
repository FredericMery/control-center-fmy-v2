-- ============================================================
-- EMAIL ASSISTANT — statut "traite - tache creee"
-- Ajoute la valeur 'task_created' a email_messages.response_status
-- ============================================================

ALTER TABLE public.email_messages
  DROP CONSTRAINT IF EXISTS email_messages_response_status_check;

ALTER TABLE public.email_messages
  ADD CONSTRAINT email_messages_response_status_check
  CHECK (response_status IN ('none', 'draft_ready', 'approved', 'sent', 'cancelled', 'task_created'));
