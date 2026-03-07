-- Destinataires pour les depenses CB Perso
CREATE TABLE IF NOT EXISTS public.expense_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  destination TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expense_recipients_user_id
  ON public.expense_recipients(user_id);

ALTER TABLE public.expense_recipients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own expense_recipients" ON public.expense_recipients;
CREATE POLICY "Users can view their own expense_recipients"
  ON public.expense_recipients FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own expense_recipients" ON public.expense_recipients;
CREATE POLICY "Users can insert their own expense_recipients"
  ON public.expense_recipients FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own expense_recipients" ON public.expense_recipients;
CREATE POLICY "Users can update their own expense_recipients"
  ON public.expense_recipients FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own expense_recipients" ON public.expense_recipients;
CREATE POLICY "Users can delete their own expense_recipients"
  ON public.expense_recipients FOR DELETE
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.update_expense_recipients_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_expense_recipients_updated_at ON public.expense_recipients;
CREATE TRIGGER update_expense_recipients_updated_at
  BEFORE UPDATE ON public.expense_recipients
  FOR EACH ROW
  EXECUTE FUNCTION public.update_expense_recipients_updated_at();
