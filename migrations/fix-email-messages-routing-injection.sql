-- Fix : injecte l'email principal de l'utilisateur dans to_emails pour les messages
-- inbound routés via l'adresse assistant (traitement@...) et les désarchive.
--
-- Contexte : tous les emails arrivent sur traitement@mail.meetsync-ai.com,
-- donc to_emails ne contient jamais l'email réel de l'utilisateur.
-- resolveRecipientRole retournait 'none' → archived = true sur 100% des mails.
--
-- Ce script est idempotent : il ne touche que les messages où l'email
-- de l'utilisateur n'est PAS déjà présent dans to_emails ou cc_emails.

WITH user_primary_emails AS (
  SELECT id AS user_id, lower(trim(email)) AS email
  FROM auth.users
  WHERE email IS NOT NULL AND trim(email) != ''
)
UPDATE public.email_messages em
SET
  -- Injecte l'email de l'utilisateur dans to_emails
  to_emails       = array_append(em.to_emails, ue.email),

  -- Désarchive sauf si déjà envoyé (response_status = 'sent')
  archived        = CASE WHEN em.response_status = 'sent' THEN true ELSE false END,

  -- Corrige response_required si l'action IA était 'repondre'
  response_required = CASE
    WHEN em.ai_action = 'repondre' AND em.response_status != 'sent' THEN true
    ELSE em.response_required
  END,

  updated_at = NOW()

FROM user_primary_emails ue
WHERE em.user_id     = ue.user_id
  AND em.direction   = 'inbound'
  AND em.deleted_at  IS NULL
  AND NOT (em.to_emails @> ARRAY[ue.email])
  AND NOT (em.cc_emails @> ARRAY[ue.email]);
