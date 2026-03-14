create table if not exists public.email_company_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('facture', 'ndf')),
  email text not null,
  company_recipient_id uuid not null references public.expense_recipients(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, type, email, company_recipient_id)
);

create index if not exists idx_email_company_links_user_type
  on public.email_company_links(user_id, type);

create index if not exists idx_email_company_links_company
  on public.email_company_links(company_recipient_id);

alter table public.email_company_links enable row level security;

drop policy if exists "email_company_links_select_own" on public.email_company_links;
create policy "email_company_links_select_own"
  on public.email_company_links for select
  using (auth.uid() = user_id);

drop policy if exists "email_company_links_insert_own" on public.email_company_links;
create policy "email_company_links_insert_own"
  on public.email_company_links for insert
  with check (auth.uid() = user_id);

drop policy if exists "email_company_links_update_own" on public.email_company_links;
create policy "email_company_links_update_own"
  on public.email_company_links for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "email_company_links_delete_own" on public.email_company_links;
create policy "email_company_links_delete_own"
  on public.email_company_links for delete
  using (auth.uid() = user_id);