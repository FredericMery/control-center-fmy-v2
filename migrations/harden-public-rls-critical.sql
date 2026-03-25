-- Harden critical public tables by enabling RLS and adding owner-based policies.
-- This migration is idempotent and safe to run across projects with partial schemas.

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'profiles',
    'tasks',
    'notification_settings',
    'notifications',
    'push_subscriptions',
    'email_settings',
    'entreprises',
    'api_calls',
    'app_usage'
  ]
  LOOP
    IF to_regclass(format('public.%I', tbl)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
    END IF;
  END LOOP;
END;
$$;



DO $$
DECLARE
  tbl text;
BEGIN
  -- Standard owner policies for tables with a user_id column.
  FOREACH tbl IN ARRAY ARRAY[
    'tasks',
    'notification_settings',
    'notifications',
    'push_subscriptions',
    'email_settings',
    'entreprises',
    'api_calls',
    'app_usage'
  ]
  LOOP
    IF to_regclass(format('public.%I', tbl)) IS NULL THEN
      CONTINUE;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = tbl
        AND column_name = 'user_id'
    ) THEN
      CONTINUE;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = tbl
        AND policyname = tbl || '_select_own'
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT USING (auth.uid() = user_id)',
        tbl || '_select_own',
        tbl
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = tbl
        AND policyname = tbl || '_insert_own'
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR INSERT WITH CHECK (auth.uid() = user_id)',
        tbl || '_insert_own',
        tbl
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = tbl
        AND policyname = tbl || '_update_own'
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)',
        tbl || '_update_own',
        tbl
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = tbl
        AND policyname = tbl || '_delete_own'
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR DELETE USING (auth.uid() = user_id)',
        tbl || '_delete_own',
        tbl
      );
    END IF;
  END LOOP;
END;
$$;

DO $$
BEGIN
  -- profiles usually uses auth.users(id) directly as primary key, no user_id column.
  IF to_regclass('public.profiles') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'profiles'
        AND policyname = 'profiles_select_self'
    ) THEN
      CREATE POLICY profiles_select_self
        ON public.profiles FOR SELECT
        USING (id = auth.uid());
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'profiles'
        AND policyname = 'profiles_insert_self'
    ) THEN
      CREATE POLICY profiles_insert_self
        ON public.profiles FOR INSERT
        WITH CHECK (id = auth.uid());
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'profiles'
        AND policyname = 'profiles_update_self'
    ) THEN
      CREATE POLICY profiles_update_self
        ON public.profiles FOR UPDATE
        USING (id = auth.uid())
        WITH CHECK (id = auth.uid());
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'profiles'
        AND policyname = 'profiles_delete_self'
    ) THEN
      CREATE POLICY profiles_delete_self
        ON public.profiles FOR DELETE
        USING (id = auth.uid());
    END IF;
  END IF;
END;
$$;

DO $$
BEGIN
  -- Explicit fallback for entreprises in case legacy schema/state bypassed generic loop.
  IF to_regclass('public.entreprises') IS NOT NULL THEN
    ALTER TABLE public.entreprises ENABLE ROW LEVEL SECURITY;

    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'entreprises'
        AND column_name = 'user_id'
    ) THEN
      RAISE NOTICE 'public.entreprises exists but has no user_id column; owner policies skipped.';
    ELSE
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'entreprises'
          AND policyname = 'entreprises_select_own'
      ) THEN
        CREATE POLICY entreprises_select_own
          ON public.entreprises FOR SELECT
          USING (auth.uid() = user_id);
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'entreprises'
          AND policyname = 'entreprises_insert_own'
      ) THEN
        CREATE POLICY entreprises_insert_own
          ON public.entreprises FOR INSERT
          WITH CHECK (auth.uid() = user_id);
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'entreprises'
          AND policyname = 'entreprises_update_own'
      ) THEN
        CREATE POLICY entreprises_update_own
          ON public.entreprises FOR UPDATE
          USING (auth.uid() = user_id)
          WITH CHECK (auth.uid() = user_id);
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'entreprises'
          AND policyname = 'entreprises_delete_own'
      ) THEN
        CREATE POLICY entreprises_delete_own
          ON public.entreprises FOR DELETE
          USING (auth.uid() = user_id);
      END IF;
    END IF;
  END IF;
END;
$$;

DO $$
BEGIN
  -- Move extensions out of public schema to satisfy advisor warning 0014.
  CREATE SCHEMA IF NOT EXISTS extensions;

  IF EXISTS (
    SELECT 1
    FROM pg_extension e
    JOIN pg_namespace n ON n.oid = e.extnamespace
    WHERE e.extname = 'vector'
      AND n.nspname = 'public'
  ) THEN
    ALTER EXTENSION vector SET SCHEMA extensions;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_extension e
    JOIN pg_namespace n ON n.oid = e.extnamespace
    WHERE e.extname = 'pg_trgm'
      AND n.nspname = 'public'
  ) THEN
    ALTER EXTENSION pg_trgm SET SCHEMA extensions;
  END IF;
END;
$$;

DO $$
BEGIN
  -- Replace permissive notifications policies with service_role-only policies.
  IF to_regclass('public.notifications') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Service role can insert notifications" ON public.notifications;
    CREATE POLICY "Service role can insert notifications"
      ON public.notifications
      FOR INSERT
      TO service_role
      WITH CHECK (auth.role() = 'service_role');

    DROP POLICY IF EXISTS "Service role can select all notifications" ON public.notifications;
    CREATE POLICY "Service role can select all notifications"
      ON public.notifications
      FOR SELECT
      TO service_role
      USING (auth.role() = 'service_role');
  END IF;
END;
$$;

DO $$
DECLARE
  fn record;
BEGIN
  -- Enforce immutable search_path for app functions (prevents lint warning 0011).
  FOR fn IN
    SELECT
      n.nspname AS schema_name,
      p.proname AS function_name,
      pg_get_function_identity_arguments(p.oid) AS function_args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'update_user_email_aliases_updated_at',
        'update_mail_items_updated_at',
        'update_inbound_alias_requests_updated_at',
        'touch_updated_at',
        'update_email_messages_updated_at',
        'normalize_inbound_alias_requests_on_insert',
        'update_email_reply_drafts_updated_at',
        'match_memories',
        'normalize_user_email_aliases_on_insert',
        'update_expense_recipients_updated_at',
        'set_updated_at'
      )
  LOOP
    IF fn.function_name = 'match_memories' THEN
      EXECUTE format(
        'ALTER FUNCTION %I.%I(%s) SET search_path = public, extensions, pg_catalog',
        fn.schema_name,
        fn.function_name,
        fn.function_args
      );
    ELSE
      EXECUTE format(
        'ALTER FUNCTION %I.%I(%s) SET search_path = public, pg_catalog',
        fn.schema_name,
        fn.function_name,
        fn.function_args
      );
    END IF;
  END LOOP;
END;
$$;

DO $$
BEGIN
  -- Fix Security Advisor errors on analytics views: enforce invoker permissions.
  IF to_regclass('public.v_app_usage_daily') IS NOT NULL THEN
    EXECUTE 'ALTER VIEW public.v_app_usage_daily SET (security_invoker = true)';
  END IF;

  IF to_regclass('public.v_api_calls_monthly') IS NOT NULL THEN
    EXECUTE 'ALTER VIEW public.v_api_calls_monthly SET (security_invoker = true)';
  END IF;

  IF to_regclass('public.v_api_calls_daily') IS NOT NULL THEN
    EXECUTE 'ALTER VIEW public.v_api_calls_daily SET (security_invoker = true)';
  END IF;
END;
$$;

DO $$
BEGIN
  -- Fix Security Advisor error: public table exposed without RLS.
  IF to_regclass('public.daily_summaries_log') IS NOT NULL THEN
    ALTER TABLE public.daily_summaries_log ENABLE ROW LEVEL SECURITY;

    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'daily_summaries_log'
        AND column_name = 'user_id'
    ) THEN
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'daily_summaries_log'
          AND policyname = 'daily_summaries_log_select_own'
      ) THEN
        CREATE POLICY daily_summaries_log_select_own
          ON public.daily_summaries_log FOR SELECT
          USING (auth.uid() = user_id);
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'daily_summaries_log'
          AND policyname = 'daily_summaries_log_insert_own'
      ) THEN
        CREATE POLICY daily_summaries_log_insert_own
          ON public.daily_summaries_log FOR INSERT
          WITH CHECK (auth.uid() = user_id);
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'daily_summaries_log'
          AND policyname = 'daily_summaries_log_update_own'
      ) THEN
        CREATE POLICY daily_summaries_log_update_own
          ON public.daily_summaries_log FOR UPDATE
          USING (auth.uid() = user_id)
          WITH CHECK (auth.uid() = user_id);
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'daily_summaries_log'
          AND policyname = 'daily_summaries_log_delete_own'
      ) THEN
        CREATE POLICY daily_summaries_log_delete_own
          ON public.daily_summaries_log FOR DELETE
          USING (auth.uid() = user_id);
      END IF;
    END IF;
  END IF;
END;
$$;