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
-- VUES POUR ANALYTICS
-- =====================================================

-- Vue : résumé mensuel des appels API par utilisateur
CREATE OR REPLACE VIEW v_api_calls_monthly AS
SELECT 
  user_id,
  api_type,
  DATE_TRUNC('month', date)::DATE as month,
  SUM(count) as total_calls
FROM public.api_calls
GROUP BY user_id, api_type, DATE_TRUNC('month', date);

-- Vue : résumé journalier de l'usage de l'app
CREATE OR REPLACE VIEW v_app_usage_daily AS
SELECT 
  user_id,
  date,
  event_type,
  SUM(count) as total_events
FROM public.app_usage
GROUP BY user_id, date, event_type;

-- Vue : stats globales par utilisateur
CREATE OR REPLACE VIEW v_user_stats AS
SELECT 
  u.user_id,
  DATE(u.created_at) as stat_date,
  COALESCE(SUM(CASE WHEN api.api_type = 'google_vision' THEN api.count ELSE 0 END), 0) as google_vision_calls,
  COALESCE(SUM(CASE WHEN api.api_type = 'resend' THEN api.count ELSE 0 END), 0) as resend_calls,
  COALESCE(
    (SELECT SUM(count) FROM app_usage au 
     WHERE au.user_id = u.user_id 
     AND au.date = DATE(u.created_at)
     AND au.event_type = 'scan_invoice'),
    0
  ) as scans_today,
  COALESCE(
    (SELECT SUM(count) FROM app_usage au 
     WHERE au.user_id = u.user_id 
     AND au.date = DATE(u.created_at)
     AND au.event_type = 'upload_expense'),
    0
  ) as expenses_today
FROM (
  SELECT DISTINCT user_id, created_at FROM api_calls
  UNION
  SELECT DISTINCT user_id, created_at FROM app_usage
) u
LEFT JOIN api_calls api ON u.user_id = api.user_id AND DATE(api.created_at) = DATE(u.created_at)
GROUP BY u.user_id, DATE(u.created_at);
