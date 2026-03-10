-- Demandes de validation d'alias email inbound non reconnu
CREATE TABLE IF NOT EXISTS public.inbound_alias_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_email TEXT NOT NULL,
  sender_name TEXT NULL,
  original_subject TEXT NULL,
  original_body TEXT NULL,
  inferred_title TEXT NOT NULL,
  inferred_deadline TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  review_note TEXT NULL,
  reviewed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT inbound_alias_requests_status_check CHECK (status IN ('pending', 'approved', 'rejected')),
  CONSTRAINT inbound_alias_requests_sender_email_format CHECK (position('@' in sender_email) > 1)
);

CREATE INDEX IF NOT EXISTS idx_inbound_alias_requests_user_status_created
  ON public.inbound_alias_requests(user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_inbound_alias_requests_sender_email
  ON public.inbound_alias_requests(lower(sender_email));

ALTER TABLE public.inbound_alias_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own inbound alias requests" ON public.inbound_alias_requests;
CREATE POLICY "Users can view their own inbound alias requests"
  ON public.inbound_alias_requests FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own inbound alias requests" ON public.inbound_alias_requests;
CREATE POLICY "Users can insert their own inbound alias requests"
  ON public.inbound_alias_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own inbound alias requests" ON public.inbound_alias_requests;
CREATE POLICY "Users can update their own inbound alias requests"
  ON public.inbound_alias_requests FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own inbound alias requests" ON public.inbound_alias_requests;
CREATE POLICY "Users can delete their own inbound alias requests"
  ON public.inbound_alias_requests FOR DELETE
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.update_inbound_alias_requests_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  NEW.sender_email = lower(trim(NEW.sender_email));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_inbound_alias_requests_updated_at ON public.inbound_alias_requests;
CREATE TRIGGER update_inbound_alias_requests_updated_at
  BEFORE UPDATE ON public.inbound_alias_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_inbound_alias_requests_updated_at();

CREATE OR REPLACE FUNCTION public.normalize_inbound_alias_requests_on_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.sender_email = lower(trim(NEW.sender_email));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS normalize_inbound_alias_requests_on_insert ON public.inbound_alias_requests;
CREATE TRIGGER normalize_inbound_alias_requests_on_insert
  BEFORE INSERT ON public.inbound_alias_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.normalize_inbound_alias_requests_on_insert();
