-- User-specific NDF profile (validator + default company)

create table if not exists public.user_ndf_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  validator_first_name text,
  validator_last_name text,
  company_recipient_id uuid references public.expense_recipients(id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_user_ndf_settings_company on public.user_ndf_settings(company_recipient_id);

alter table public.user_ndf_settings enable row level security;

drop policy if exists "user_ndf_settings_select_own" on public.user_ndf_settings;
create policy "user_ndf_settings_select_own"
  on public.user_ndf_settings for select
  using (auth.uid() = user_id);

drop policy if exists "user_ndf_settings_insert_own" on public.user_ndf_settings;
create policy "user_ndf_settings_insert_own"
  on public.user_ndf_settings for insert
  with check (auth.uid() = user_id);

drop policy if exists "user_ndf_settings_update_own" on public.user_ndf_settings;
create policy "user_ndf_settings_update_own"
  on public.user_ndf_settings for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
