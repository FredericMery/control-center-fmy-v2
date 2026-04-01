-- Add security code in user settings and feedback log for AI proposals.

ALTER TABLE public.user_ai_settings
  ADD COLUMN IF NOT EXISTS proposal_security_code TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS public.ai_action_proposal_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES public.ai_action_proposals(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  decision TEXT NOT NULL, -- correct | cancel | classify
  comment TEXT NOT NULL,
  corrected_action TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ai_action_proposal_feedback_user_idx
  ON public.ai_action_proposal_feedback(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ai_action_proposal_feedback_proposal_idx
  ON public.ai_action_proposal_feedback(proposal_id);

ALTER TABLE public.ai_action_proposal_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_action_proposal_feedback_select_own" ON public.ai_action_proposal_feedback;
CREATE POLICY "ai_action_proposal_feedback_select_own"
  ON public.ai_action_proposal_feedback FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "ai_action_proposal_feedback_insert_own" ON public.ai_action_proposal_feedback;
CREATE POLICY "ai_action_proposal_feedback_insert_own"
  ON public.ai_action_proposal_feedback FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "ai_action_proposal_feedback_update_own" ON public.ai_action_proposal_feedback;
CREATE POLICY "ai_action_proposal_feedback_update_own"
  ON public.ai_action_proposal_feedback FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
