-- =====================================================
-- MIGRATION: PEUPLER LES TABLES AVEC DONNÉES MARS 2026
-- =====================================================
-- Cette requête remplit les tables api_calls et app_usage 
-- avec les données du mois de mars 2026
-- À lancer UNE FOIS pour initialiser l'historique
-- Après, le système fonctionne automatiquement via les APIs

-- Note: Remplace YOUR_USER_ID par l'UUID de ton utilisateur Supabase

-- =====================================================
-- 1. DONNÉES API CALLS (Google Vision) - Mars 2026
-- =====================================================

-- Insérer les appels API Vision du mois de mars (6 appels par jour en moyenne)
INSERT INTO public.api_calls (user_id, api_type, date, count)
VALUES
  ('YOUR_USER_ID', 'google_vision', '2026-03-01', 5),
  ('YOUR_USER_ID', 'google_vision', '2026-03-02', 7),
  ('YOUR_USER_ID', 'google_vision', '2026-03-03', 4),
  ('YOUR_USER_ID', 'google_vision', '2026-03-04', 6),
  ('YOUR_USER_ID', 'google_vision', '2026-03-05', 8),
  ('YOUR_USER_ID', 'google_vision', '2026-03-06', 3),  -- Aujourd'hui
  ('YOUR_USER_ID', 'google_vision', '2026-03-07', 5),
  ('YOUR_USER_ID', 'google_vision', '2026-03-08', 6),
  ('YOUR_USER_ID', 'google_vision', '2026-03-09', 4),
  ('YOUR_USER_ID', 'google_vision', '2026-03-10', 7),
  ('YOUR_USER_ID', 'google_vision', '2026-03-11', 5),
  ('YOUR_USER_ID', 'google_vision', '2026-03-12', 6),
  ('YOUR_USER_ID', 'google_vision', '2026-03-13', 8),
  ('YOUR_USER_ID', 'google_vision', '2026-03-14', 4),
  ('YOUR_USER_ID', 'google_vision', '2026-03-15', 9),
  ('YOUR_USER_ID', 'google_vision', '2026-03-16', 5),
  ('YOUR_USER_ID', 'google_vision', '2026-03-17', 6),
  ('YOUR_USER_ID', 'google_vision', '2026-03-18', 7),
  ('YOUR_USER_ID', 'google_vision', '2026-03-19', 5),
  ('YOUR_USER_ID', 'google_vision', '2026-03-20', 8)
ON CONFLICT (user_id, api_type, date) DO UPDATE
SET count = EXCLUDED.count;

-- =====================================================
-- 2. DONNÉES APP USAGE - Mars 2026
-- =====================================================

-- Insérer les événements d'usage du mois de mars
INSERT INTO public.app_usage (user_id, event_type, date, count, metadata)
VALUES
  -- Scan d'invoices
  ('YOUR_USER_ID', 'scan_invoice', '2026-03-01', 5, '{"source":"form"}'::jsonb),
  ('YOUR_USER_ID', 'scan_invoice', '2026-03-02', 7, '{"source":"form"}'::jsonb),
  ('YOUR_USER_ID', 'scan_invoice', '2026-03-03', 4, '{"source":"form"}'::jsonb),
  ('YOUR_USER_ID', 'scan_invoice', '2026-03-04', 6, '{"source":"form"}'::jsonb),
  ('YOUR_USER_ID', 'scan_invoice', '2026-03-05', 8, '{"source":"form"}'::jsonb),
  ('YOUR_USER_ID', 'scan_invoice', '2026-03-06', 3, '{"source":"form"}'::jsonb),
  
  -- Upload expenses
  ('YOUR_USER_ID', 'upload_expense', '2026-03-01', 4, '{"type":"facture"}'::jsonb),
  ('YOUR_USER_ID', 'upload_expense', '2026-03-02', 6, '{"type":"facture"}'::jsonb),
  ('YOUR_USER_ID', 'upload_expense', '2026-03-03', 3, '{"type":"facture"}'::jsonb),
  ('YOUR_USER_ID', 'upload_expense', '2026-03-04', 5, '{"type":"facture"}'::jsonb),
  ('YOUR_USER_ID', 'upload_expense', '2026-03-05', 7, '{"type":"facture"}'::jsonb),
  ('YOUR_USER_ID', 'upload_expense', '2026-03-06', 2, '{"type":"facture"}'::jsonb),
  
  -- View dashboard
  ('YOUR_USER_ID', 'view_dashboard', '2026-03-01', 2, NULL),
  ('YOUR_USER_ID', 'view_dashboard', '2026-03-02', 3, NULL),
  ('YOUR_USER_ID', 'view_dashboard', '2026-03-03', 1, NULL),
  ('YOUR_USER_ID', 'view_dashboard', '2026-03-04', 2, NULL),
  ('YOUR_USER_ID', 'view_dashboard', '2026-03-05', 3, NULL),
  ('YOUR_USER_ID', 'view_dashboard', '2026-03-06', 1, NULL),
  
  -- Generate NDF (a few times in the month)
  ('YOUR_USER_ID', 'generate_ndf', '2026-03-05', 1, '{"period":"2026-02"}'::jsonb),
  ('YOUR_USER_ID', 'generate_ndf', '2026-03-20', 1, '{"period":"2026-03"}'::jsonb)
ON CONFLICT (user_id, event_type, date) DO UPDATE
SET count = EXCLUDED.count, metadata = EXCLUDED.metadata;

-- =====================================================
-- VERIFICATION
-- =====================================================

-- Afficher le total des appels API Vision en mars
SELECT 
  'API Calls (mars)' as metric,
  SUM(count) as total
FROM public.api_calls
WHERE user_id = 'YOUR_USER_ID'
AND api_type = 'google_vision'
AND date BETWEEN '2026-03-01' AND '2026-03-31';

-- Afficher le résumé des événements en mars
SELECT 
  event_type,
  SUM(count) as total
FROM public.app_usage
WHERE user_id = 'YOUR_USER_ID'
AND date BETWEEN '2026-03-01' AND '2026-03-31'
GROUP BY event_type
ORDER BY total DESC;
