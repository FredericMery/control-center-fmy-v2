-- =====================================================
-- Hippocampe AI Memory System
-- Adds AI-first memory tables without replacing legacy memory_* tables.
-- =====================================================

create schema if not exists extensions;
create extension if not exists vector with schema extensions;
create extension if not exists pg_trgm with schema extensions;

create table if not exists public.memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  type text not null default 'other',
  content text,
  structured_data jsonb not null default '{}'::jsonb,
  rating integer,
  source text,
  source_image text,
  embedding extensions.vector(1536),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint memories_rating_range check (rating is null or (rating >= 1 and rating <= 5))
);

create table if not exists public.memory_relations (
  id uuid primary key default gen_random_uuid(),
  from_memory uuid not null references public.memories(id) on delete cascade,
  to_memory uuid not null references public.memories(id) on delete cascade,
  relation_type text not null,
  created_at timestamptz not null default now(),
  constraint memory_relations_no_self check (from_memory <> to_memory)
);

create table if not exists public.ai_usage_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  service text not null,
  tokens_used integer not null default 0,
  cost_estimate numeric(12,6) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.user_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan text not null default 'BASIC',
  price numeric(10,2) not null default 1.00,
  features jsonb not null default '{"tasks": true, "emails": false, "memory": false, "ai": false, "vision": false, "agent": false}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_subscriptions_user_unique unique (user_id)
);

create index if not exists idx_memories_user_created on public.memories(user_id, created_at desc);
create index if not exists idx_memories_type on public.memories(type);
create index if not exists idx_memories_title_trgm on public.memories using gin (title extensions.gin_trgm_ops);
create index if not exists idx_memories_structured_data on public.memories using gin (structured_data);
create index if not exists idx_memory_relations_from on public.memory_relations(from_memory);
create index if not exists idx_memory_relations_to on public.memory_relations(to_memory);
create index if not exists idx_ai_usage_logs_user_created on public.ai_usage_logs(user_id, created_at desc);
create index if not exists idx_memories_embedding on public.memories using ivfflat (embedding extensions.vector_cosine_ops) with (lists = 100);

alter table public.memories enable row level security;
alter table public.memory_relations enable row level security;
alter table public.ai_usage_logs enable row level security;
alter table public.user_subscriptions enable row level security;

drop policy if exists "memories_select_own" on public.memories;
create policy "memories_select_own"
  on public.memories for select
  using (auth.uid() = user_id);

drop policy if exists "memories_insert_own" on public.memories;
create policy "memories_insert_own"
  on public.memories for insert
  with check (auth.uid() = user_id);

drop policy if exists "memories_update_own" on public.memories;
create policy "memories_update_own"
  on public.memories for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "memories_delete_own" on public.memories;
create policy "memories_delete_own"
  on public.memories for delete
  using (auth.uid() = user_id);

drop policy if exists "memory_relations_select_own" on public.memory_relations;
create policy "memory_relations_select_own"
  on public.memory_relations for select
  using (
    exists (
      select 1
      from public.memories m
      where m.id = from_memory
        and m.user_id = auth.uid()
    )
    and exists (
      select 1
      from public.memories m
      where m.id = to_memory
        and m.user_id = auth.uid()
    )
  );

drop policy if exists "memory_relations_insert_own" on public.memory_relations;
create policy "memory_relations_insert_own"
  on public.memory_relations for insert
  with check (
    exists (
      select 1
      from public.memories m
      where m.id = from_memory
        and m.user_id = auth.uid()
    )
    and exists (
      select 1
      from public.memories m
      where m.id = to_memory
        and m.user_id = auth.uid()
    )
  );

drop policy if exists "memory_relations_delete_own" on public.memory_relations;
create policy "memory_relations_delete_own"
  on public.memory_relations for delete
  using (
    exists (
      select 1
      from public.memories m
      where m.id = from_memory
        and m.user_id = auth.uid()
    )
  );

drop policy if exists "ai_usage_logs_select_own" on public.ai_usage_logs;
create policy "ai_usage_logs_select_own"
  on public.ai_usage_logs for select
  using (auth.uid() = user_id);

drop policy if exists "ai_usage_logs_insert_own" on public.ai_usage_logs;
create policy "ai_usage_logs_insert_own"
  on public.ai_usage_logs for insert
  with check (auth.uid() = user_id);

drop policy if exists "user_subscriptions_select_own" on public.user_subscriptions;
create policy "user_subscriptions_select_own"
  on public.user_subscriptions for select
  using (auth.uid() = user_id);

drop policy if exists "user_subscriptions_insert_own" on public.user_subscriptions;
create policy "user_subscriptions_insert_own"
  on public.user_subscriptions for insert
  with check (auth.uid() = user_id);

drop policy if exists "user_subscriptions_update_own" on public.user_subscriptions;
create policy "user_subscriptions_update_own"
  on public.user_subscriptions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.match_memories(
  p_user_id uuid,
  p_query_embedding extensions.vector(1536),
  p_match_count int default 10
)
returns table (
  id uuid,
  title text,
  type text,
  content text,
  structured_data jsonb,
  rating integer,
  source text,
  source_image text,
  created_at timestamptz,
  similarity float
)
language sql
stable
set search_path = public, extensions, pg_catalog
as $$
  select
    m.id,
    m.title,
    m.type,
    m.content,
    m.structured_data,
    m.rating,
    m.source,
    m.source_image,
    m.created_at,
    1 - (m.embedding <=> p_query_embedding) as similarity
  from public.memories m
  where m.user_id = p_user_id
    and m.embedding is not null
  order by m.embedding <=> p_query_embedding
  limit greatest(p_match_count, 1);
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_memories_updated_at on public.memories;
create trigger trg_memories_updated_at
before update on public.memories
for each row
execute function public.touch_updated_at();

drop trigger if exists trg_user_subscriptions_updated_at on public.user_subscriptions;
create trigger trg_user_subscriptions_updated_at
before update on public.user_subscriptions
for each row
execute function public.touch_updated_at();

insert into public.user_subscriptions (user_id, plan, price, features)
select
  u.id,
  'BASIC',
  1.00,
  '{"tasks": true, "emails": false, "memory": false, "ai": false, "vision": false, "agent": false}'::jsonb
from auth.users u
where not exists (
  select 1 from public.user_subscriptions us where us.user_id = u.id
);
