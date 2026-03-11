-- User-specific assistant settings

create table if not exists public.user_ai_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  assistant_name text not null default 'Assistant',
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_user_ai_settings_user on public.user_ai_settings(user_id);

alter table public.user_ai_settings enable row level security;

drop policy if exists "user_ai_settings_select_own" on public.user_ai_settings;
create policy "user_ai_settings_select_own"
  on public.user_ai_settings for select
  using (auth.uid() = user_id);

drop policy if exists "user_ai_settings_insert_own" on public.user_ai_settings;
create policy "user_ai_settings_insert_own"
  on public.user_ai_settings for insert
  with check (auth.uid() = user_id);

drop policy if exists "user_ai_settings_update_own" on public.user_ai_settings;
create policy "user_ai_settings_update_own"
  on public.user_ai_settings for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
