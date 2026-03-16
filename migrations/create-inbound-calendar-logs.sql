create table if not exists public.inbound_calendar_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  inbox_address text not null,
  sender_email text,
  subject text,
  event_uid text,
  status text not null check (status in ('processed','skipped','error')),
  message text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_inbound_calendar_logs_user_id
  on public.inbound_calendar_logs(user_id);

create index if not exists idx_inbound_calendar_logs_created_at
  on public.inbound_calendar_logs(created_at desc);

alter table public.inbound_calendar_logs enable row level security;

drop policy if exists "inbound_calendar_logs_select_own" on public.inbound_calendar_logs;
create policy "inbound_calendar_logs_select_own"
  on public.inbound_calendar_logs
  for select
  using (auth.uid() = user_id);
