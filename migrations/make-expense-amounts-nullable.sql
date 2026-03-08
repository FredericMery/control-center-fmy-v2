-- Rendre tous les champs (hors PK) nullable dans expenses
-- pour eviter les blocages d'insertion lors des extractions incomplètes.

ALTER TABLE IF EXISTS public.expenses
  ALTER COLUMN user_id DROP NOT NULL,
  ALTER COLUMN payment_method DROP NOT NULL,
  ALTER COLUMN invoice_number DROP NOT NULL,
  ALTER COLUMN invoice_date DROP NOT NULL,
  ALTER COLUMN vendor DROP NOT NULL,
  ALTER COLUMN amount_ht DROP NOT NULL,
  ALTER COLUMN amount_tva DROP NOT NULL,
  ALTER COLUMN amount_ttc DROP NOT NULL,
  ALTER COLUMN category DROP NOT NULL,
  ALTER COLUMN description DROP NOT NULL,
  ALTER COLUMN photo_url DROP NOT NULL,
  ALTER COLUMN status DROP NOT NULL,
  ALTER COLUMN currency DROP NOT NULL,
  ALTER COLUMN created_at DROP NOT NULL,
  ALTER COLUMN updated_at DROP NOT NULL;
