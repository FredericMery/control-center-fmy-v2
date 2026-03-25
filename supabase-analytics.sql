-- =====================================================
-- TABLES DE TRACKING/ANALYTICS
-- =====================================================

-- Supprimer les anciennes tables si elles existent
DROP TABLE IF EXISTS public.api_calls CASCADE;
DROP TABLE IF EXISTS public.app_usage CASCADE;

-- Table api_calls : tracker les appels API par utilisateur
CREATE TABLE public.api_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  api_type TEXT NOT NULL CHECK (api_type IN ('google_vision', 'resend', 'other')),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  count INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id, api_type, date)
);

-- Index pour les requêtes fréquentes
CREATE INDEX idx_api_calls_user_id ON public.api_calls(user_id);
CREATE INDEX idx_api_calls_date ON public.api_calls(date);
CREATE INDEX idx_api_calls_user_api_date ON public.api_calls(user_id, api_type, date);

-- Table app_usage : tracker tous les événements de l'app
CREATE TABLE public.app_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'scan_invoice',
    'upload_expense',
    'generate_ndf',
    'export_csv',
    'view_dashboard',
    'view_expenses',
    'create_ndf',
    'other'
  )),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  count INTEGER NOT NULL DEFAULT 1,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id, event_type, date)
);

-- Index pour les requêtes fréquentes
CREATE INDEX idx_app_usage_user_id ON public.app_usage(user_id);
CREATE INDEX idx_app_usage_date ON public.app_usage(date);
CREATE INDEX idx_app_usage_user_event_date ON public.app_usage(user_id, event_type, date);

-- =====================================================
-- RLS SECURITY
-- =====================================================

ALTER TABLE public.api_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own api_calls"
  ON public.api_calls FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own api_calls"
  ON public.api_calls FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own api_calls"
  ON public.api_calls FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own api_calls"
  ON public.api_calls FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own app_usage"
  ON public.app_usage FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own app_usage"
  ON public.app_usage FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own app_usage"
  ON public.app_usage FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own app_usage"
  ON public.app_usage FOR DELETE
  USING (auth.uid() = user_id);

-- =====================================================
-- VUES POUR ANALYTICS
-- =====================================================

-- Vue : résumé mensuel des appels API par utilisateur
CREATE OR REPLACE VIEW v_api_calls_monthly
WITH (security_invoker = true)
AS
SELECT 
  user_id,
  api_type,
  DATE_TRUNC('month', date)::DATE as month,
  SUM(count) as total_calls
FROM public.api_calls
GROUP BY user_id, api_type, DATE_TRUNC('month', date);

-- Vue : résumé journalier de l'usage de l'app
CREATE OR REPLACE VIEW v_app_usage_daily
WITH (security_invoker = true)
AS
SELECT 
  user_id,
  date,
  event_type,
  SUM(count) as total_events
FROM public.app_usage
GROUP BY user_id, date, event_type;

-- Vue : stats API par user et date
CREATE OR REPLACE VIEW v_api_calls_daily
WITH (security_invoker = true)
AS
SELECT 
  user_id,
  date,
  api_type,
  SUM(count) as total_calls
FROM public.api_calls
GROUP BY user_id, date, api_type;
