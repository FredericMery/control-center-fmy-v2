-- Pastilles d'actions effectuees sur les sources (email, courrier, etc.).

CREATE TABLE IF NOT EXISTS public.source_action_markers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL, -- email | mail | expense | memory | ...
  source_id TEXT NOT NULL,
  proposal_id UUID NULL REFERENCES public.ai_action_proposals(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL, -- validated | corrected | cancelled | classified
  action_label TEXT NOT NULL,
  action_comment TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS source_action_markers_source_idx
  ON public.source_action_markers(user_id, source_type, source_id, created_at DESC);

ALTER TABLE public.source_action_markers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "source_action_markers_select_own" ON public.source_action_markers;
CREATE POLICY "source_action_markers_select_own"
  ON public.source_action_markers FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "source_action_markers_insert_own" ON public.source_action_markers;
CREATE POLICY "source_action_markers_insert_own"
  ON public.source_action_markers FOR INSERT
  WITH CHECK (auth.uid() = user_id);
