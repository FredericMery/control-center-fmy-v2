-- =====================================================
-- AI Memory - Ready To Run (Post Migration)
-- Usage:
-- 1) Execute migrations/ai-memory-system.sql first
-- 2) Execute this script in Supabase SQL Editor
-- =====================================================

begin;

-- Ensure required tables exist before post-deploy updates.
do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'memories'
  ) then
    raise exception 'Table public.memories is missing. Run ai-memory-system.sql first.';
  end if;

  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'memory_relations'
  ) then
    raise exception 'Table public.memory_relations is missing. Run ai-memory-system.sql first.';
  end if;

  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'ai_usage_logs'
  ) then
    raise exception 'Table public.ai_usage_logs is missing. Run ai-memory-system.sql first.';
  end if;

  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'user_subscriptions'
  ) then
    raise exception 'Table public.user_subscriptions is missing. Run ai-memory-system.sql first.';
  end if;
end $$;

-- Force full-access (admin grant) for user fmery.
insert into public.user_subscriptions (user_id, plan, price, features)
values (
  '63efeb2d-6b5f-486d-8163-7485b26b9329',
  'PRO',
  0,
  '{"tasks": true, "emails": true, "memory": true, "ai": true, "vision": true, "agent": true}'::jsonb
)
on conflict (user_id)
do update set
  plan = excluded.plan,
  price = excluded.price,
  features = excluded.features,
  updated_at = now();

commit;

-- =====================================================
-- Verification queries (run after commit)
-- =====================================================

-- 1) Table availability
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('memories', 'memory_relations', 'ai_usage_logs', 'user_subscriptions')
order by table_name;

-- 2) RLS enabled
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('memories', 'memory_relations', 'ai_usage_logs', 'user_subscriptions')
order by tablename;

-- 3) RPC function availability
select p.proname as function_name
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'match_memories';

-- 4) Full-access user subscription check
select user_id, plan, price, features, updated_at
from public.user_subscriptions
where user_id = '63efeb2d-6b5f-486d-8163-7485b26b9329';
