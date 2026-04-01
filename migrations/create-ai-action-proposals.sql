-- Propositions IA : table de stockage des actions générées automatiquement
-- Les propositions sont générées toutes les 2h entre 8h et 18h
-- et affichées dans l'onglet "Proposition IA" du dashboard.

CREATE TABLE IF NOT EXISTS public.ai_action_proposals (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  priority          TEXT          NOT NULL DEFAULT 'normal',
  action            TEXT          NOT NULL,
  why               TEXT          NOT NULL DEFAULT '',
  sender            TEXT          NOT NULL DEFAULT '',
  email_message_id  TEXT          NOT NULL DEFAULT '',
  source_type       TEXT          NOT NULL DEFAULT 'email',
  status            TEXT          NOT NULL DEFAULT 'pending', -- pending | validated | rejected
  batch_id          UUID          NOT NULL DEFAULT gen_random_uuid(),
  generated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ai_action_proposals_user_id_idx
  ON public.ai_action_proposals(user_id);

CREATE INDEX IF NOT EXISTS ai_action_proposals_user_batch_idx
  ON public.ai_action_proposals(user_id, batch_id, generated_at DESC);

CREATE INDEX IF NOT EXISTS ai_action_proposals_status_idx
  ON public.ai_action_proposals(user_id, status, generated_at DESC);

ALTER TABLE public.ai_action_proposals ENABLE ROW LEVEL SECURITY;

-- Les utilisateurs voient et modifient leurs propres propositions
CREATE POLICY "Users see own proposals"
  ON public.ai_action_proposals FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users update own proposals"
  ON public.ai_action_proposals FOR UPDATE
  USING (auth.uid() = user_id);

-- Le service (admin client) gère les inserts et suppressions
CREATE POLICY "Service manages proposals"
  ON public.ai_action_proposals FOR ALL
  USING (true)
  WITH CHECK (true);
