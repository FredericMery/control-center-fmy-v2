-- =====================================================
-- TABLES POUR MODULE NOTES DE FRAIS (NDF)
-- =====================================================

-- Table entreprises
CREATE TABLE IF NOT EXISTS public.entreprises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nom TEXT NOT NULL,
  siret TEXT,
  adresse TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Table email_settings
CREATE TABLE IF NOT EXISTS public.email_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('facture', 'ndf')),
  email TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id, type)
);

-- Table expenses
CREATE TABLE IF NOT EXISTS public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cb_perso', 'cb_pro')),
  invoice_number TEXT,
  invoice_date DATE,
  vendor TEXT,
  amount_ht DECIMAL(10, 2) DEFAULT 0,
  amount_tva DECIMAL(10, 2) DEFAULT 0,
  amount_ttc DECIMAL(10, 2) DEFAULT 0,
  category TEXT DEFAULT 'Non catégorisée',
  description TEXT,
  photo_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'pending_ndf', 'submitted', 'approved', 'rejected')),
  currency TEXT DEFAULT 'EUR',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Table ndf_reports
CREATE TABLE IF NOT EXISTS public.ndf_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  year INTEGER NOT NULL,
  total_ht DECIMAL(10, 2) DEFAULT 0,
  total_tva DECIMAL(10, 2) DEFAULT 0,
  total_ttc DECIMAL(10, 2) DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('draft', 'submitted', 'approved', 'rejected', 'paid')),
  pdf_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id, month, year)
);

-- =====================================================
-- INDEX POUR PERFORMANCE
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_entreprises_user_id ON public.entreprises(user_id);
CREATE INDEX IF NOT EXISTS idx_email_settings_user_id ON public.email_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_email_settings_type ON public.email_settings(type);
CREATE INDEX IF NOT EXISTS idx_expenses_user_id ON public.expenses(user_id);
CREATE INDEX IF NOT EXISTS idx_expenses_status ON public.expenses(status);
CREATE INDEX IF NOT EXISTS idx_expenses_payment_method ON public.expenses(payment_method);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON public.expenses(invoice_date);
CREATE INDEX IF NOT EXISTS idx_ndf_reports_user_id ON public.ndf_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_ndf_reports_period ON public.ndf_reports(year, month);

-- =====================================================
-- ROW LEVEL SECURITY (RLS)
-- =====================================================

-- Enable RLS
ALTER TABLE public.entreprises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ndf_reports ENABLE ROW LEVEL SECURITY;

-- Policies pour entreprises
DROP POLICY IF EXISTS "Users can view their own entreprises" ON public.entreprises;
CREATE POLICY "Users can view their own entreprises" 
  ON public.entreprises FOR SELECT 
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert their own entreprises" ON public.entreprises;
CREATE POLICY "Users can insert their own entreprises" 
  ON public.entreprises FOR INSERT 
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update their own entreprises" ON public.entreprises;
CREATE POLICY "Users can update their own entreprises" 
  ON public.entreprises FOR UPDATE 
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete their own entreprises" ON public.entreprises;
CREATE POLICY "Users can delete their own entreprises" 
  ON public.entreprises FOR DELETE 
  USING ((SELECT auth.uid()) = user_id);

-- Policies pour email_settings
DROP POLICY IF EXISTS "Users can view their own email_settings" ON public.email_settings;
CREATE POLICY "Users can view their own email_settings" 
  ON public.email_settings FOR SELECT 
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert their own email_settings" ON public.email_settings;
CREATE POLICY "Users can insert their own email_settings" 
  ON public.email_settings FOR INSERT 
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update their own email_settings" ON public.email_settings;
CREATE POLICY "Users can update their own email_settings" 
  ON public.email_settings FOR UPDATE 
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete their own email_settings" ON public.email_settings;
CREATE POLICY "Users can delete their own email_settings" 
  ON public.email_settings FOR DELETE 
  USING ((SELECT auth.uid()) = user_id);

-- Policies pour expenses
DROP POLICY IF EXISTS "Users can view their own expenses" ON public.expenses;
CREATE POLICY "Users can view their own expenses" 
  ON public.expenses FOR SELECT 
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert their own expenses" ON public.expenses;
CREATE POLICY "Users can insert their own expenses" 
  ON public.expenses FOR INSERT 
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update their own expenses" ON public.expenses;
CREATE POLICY "Users can update their own expenses" 
  ON public.expenses FOR UPDATE 
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete their own expenses" ON public.expenses;
CREATE POLICY "Users can delete their own expenses" 
  ON public.expenses FOR DELETE 
  USING ((SELECT auth.uid()) = user_id);

-- Policies pour ndf_reports
DROP POLICY IF EXISTS "Users can view their own ndf_reports" ON public.ndf_reports;
CREATE POLICY "Users can view their own ndf_reports" 
  ON public.ndf_reports FOR SELECT 
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert their own ndf_reports" ON public.ndf_reports;
CREATE POLICY "Users can insert their own ndf_reports" 
  ON public.ndf_reports FOR INSERT 
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update their own ndf_reports" ON public.ndf_reports;
CREATE POLICY "Users can update their own ndf_reports" 
  ON public.ndf_reports FOR UPDATE 
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete their own ndf_reports" ON public.ndf_reports;
CREATE POLICY "Users can delete their own ndf_reports" 
  ON public.ndf_reports FOR DELETE 
  USING ((SELECT auth.uid()) = user_id);

-- =====================================================
-- DONNÉES DE TEST (optionnel)
-- =====================================================

-- Vous pouvez ajouter des entreprises de test ici si besoin
