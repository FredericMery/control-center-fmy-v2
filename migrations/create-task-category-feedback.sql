-- Track manual category corrections to improve task categorization over time.

CREATE TABLE IF NOT EXISTS public.task_category_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  task_title text NOT NULL,
  previous_category text,
  corrected_category text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT task_category_feedback_corrected_category_check
    CHECK (corrected_category IN (
      'RH',
      'Organisation',
      'Juridique',
      'Commerce',
      'Financier',
      'Communication',
      'Projet',
      'Technique',
      'Autre'
    ))
);

CREATE INDEX IF NOT EXISTS task_category_feedback_user_created_idx
  ON public.task_category_feedback (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS task_category_feedback_task_idx
  ON public.task_category_feedback (task_id);
