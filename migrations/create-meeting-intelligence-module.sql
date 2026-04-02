-- Meeting Intelligence & Action Tracking module
-- Prefix obligatoire: mod_reunion_*

create extension if not exists pgcrypto;

create table if not exists public.mod_reunion_meetings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  objective text not null default '',
  description text not null default '',
  created_by text not null,
  meeting_date timestamptz not null,
  status text not null default 'planned' check (status in ('planned', 'ongoing', 'completed')),
  ai_generated boolean not null default false,
  public_join_token_hash text,
  public_join_token_expires_at timestamptz,
  public_join_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mod_reunion_participants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  meeting_id uuid not null references public.mod_reunion_meetings(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  role text not null default 'participant' check (role in ('organizer', 'participant', 'decision_maker')),
  source text not null default 'manual' check (source in ('manual', 'qr', 'ai')),
  created_at timestamptz not null default now()
);

create table if not exists public.mod_reunion_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  meeting_id uuid not null references public.mod_reunion_meetings(id) on delete cascade,
  audio_url text,
  transcript text,
  cleaned_transcript text,
  ai_summary text,
  ai_key_points jsonb not null default '[]'::jsonb,
  ai_decisions jsonb not null default '[]'::jsonb,
  ai_risks jsonb not null default '[]'::jsonb,
  ai_open_questions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.mod_reunion_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  meeting_id uuid not null references public.mod_reunion_meetings(id) on delete cascade,
  title text not null,
  description text not null default '',
  assigned_to text,
  assigned_email text,
  deadline date,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'done', 'late')),
  ai_score_importance integer not null default 5 check (ai_score_importance between 1 and 10),
  ai_score_urgency integer not null default 5 check (ai_score_urgency between 1 and 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mod_reunion_action_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action_id uuid not null references public.mod_reunion_actions(id) on delete cascade,
  previous_status text,
  new_status text not null,
  updated_by text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.mod_reunion_followups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  meeting_id uuid not null references public.mod_reunion_meetings(id) on delete cascade,
  type text not null check (type in ('daily', 'weekly')),
  sent_at timestamptz not null default now(),
  content text not null default ''
);

create index if not exists idx_mod_reunion_meetings_user_date
  on public.mod_reunion_meetings(user_id, meeting_date desc);
create index if not exists idx_mod_reunion_meetings_status
  on public.mod_reunion_meetings(user_id, status);
create index if not exists idx_mod_reunion_meetings_join_hash
  on public.mod_reunion_meetings(public_join_token_hash)
  where public_join_token_hash is not null;

create index if not exists idx_mod_reunion_participants_meeting
  on public.mod_reunion_participants(meeting_id, created_at desc);
create index if not exists idx_mod_reunion_participants_email
  on public.mod_reunion_participants(user_id, email)
  where email is not null;

create index if not exists idx_mod_reunion_records_meeting
  on public.mod_reunion_records(meeting_id, created_at desc);

create index if not exists idx_mod_reunion_actions_meeting_status
  on public.mod_reunion_actions(meeting_id, status, deadline);
create index if not exists idx_mod_reunion_actions_user_status
  on public.mod_reunion_actions(user_id, status, updated_at desc);

create index if not exists idx_mod_reunion_action_logs_action
  on public.mod_reunion_action_logs(action_id, created_at desc);

create index if not exists idx_mod_reunion_followups_meeting_sent
  on public.mod_reunion_followups(meeting_id, sent_at desc);

create or replace function public.mod_reunion_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

alter function public.mod_reunion_touch_updated_at() set search_path = public, pg_catalog;

drop trigger if exists trg_mod_reunion_meetings_updated_at on public.mod_reunion_meetings;
create trigger trg_mod_reunion_meetings_updated_at
before update on public.mod_reunion_meetings
for each row execute function public.mod_reunion_touch_updated_at();

drop trigger if exists trg_mod_reunion_actions_updated_at on public.mod_reunion_actions;
create trigger trg_mod_reunion_actions_updated_at
before update on public.mod_reunion_actions
for each row execute function public.mod_reunion_touch_updated_at();

alter table public.mod_reunion_meetings enable row level security;
alter table public.mod_reunion_participants enable row level security;
alter table public.mod_reunion_records enable row level security;
alter table public.mod_reunion_actions enable row level security;
alter table public.mod_reunion_action_logs enable row level security;
alter table public.mod_reunion_followups enable row level security;

drop policy if exists "mod_reunion_meetings_select_own" on public.mod_reunion_meetings;
create policy "mod_reunion_meetings_select_own"
  on public.mod_reunion_meetings for select
  using (auth.uid() = user_id);

drop policy if exists "mod_reunion_meetings_insert_own" on public.mod_reunion_meetings;
create policy "mod_reunion_meetings_insert_own"
  on public.mod_reunion_meetings for insert
  with check (auth.uid() = user_id);

drop policy if exists "mod_reunion_meetings_update_own" on public.mod_reunion_meetings;
create policy "mod_reunion_meetings_update_own"
  on public.mod_reunion_meetings for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "mod_reunion_meetings_delete_own" on public.mod_reunion_meetings;
create policy "mod_reunion_meetings_delete_own"
  on public.mod_reunion_meetings for delete
  using (auth.uid() = user_id);

drop policy if exists "mod_reunion_participants_select_own" on public.mod_reunion_participants;
create policy "mod_reunion_participants_select_own"
  on public.mod_reunion_participants for select
  using (auth.uid() = user_id);

drop policy if exists "mod_reunion_participants_insert_own" on public.mod_reunion_participants;
create policy "mod_reunion_participants_insert_own"
  on public.mod_reunion_participants for insert
  with check (auth.uid() = user_id);

drop policy if exists "mod_reunion_participants_update_own" on public.mod_reunion_participants;
create policy "mod_reunion_participants_update_own"
  on public.mod_reunion_participants for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "mod_reunion_participants_delete_own" on public.mod_reunion_participants;
create policy "mod_reunion_participants_delete_own"
  on public.mod_reunion_participants for delete
  using (auth.uid() = user_id);

drop policy if exists "mod_reunion_records_select_own" on public.mod_reunion_records;
create policy "mod_reunion_records_select_own"
  on public.mod_reunion_records for select
  using (auth.uid() = user_id);

drop policy if exists "mod_reunion_records_insert_own" on public.mod_reunion_records;
create policy "mod_reunion_records_insert_own"
  on public.mod_reunion_records for insert
  with check (auth.uid() = user_id);

drop policy if exists "mod_reunion_records_update_own" on public.mod_reunion_records;
create policy "mod_reunion_records_update_own"
  on public.mod_reunion_records for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "mod_reunion_records_delete_own" on public.mod_reunion_records;
create policy "mod_reunion_records_delete_own"
  on public.mod_reunion_records for delete
  using (auth.uid() = user_id);

drop policy if exists "mod_reunion_actions_select_own" on public.mod_reunion_actions;
create policy "mod_reunion_actions_select_own"
  on public.mod_reunion_actions for select
  using (auth.uid() = user_id);

drop policy if exists "mod_reunion_actions_insert_own" on public.mod_reunion_actions;
create policy "mod_reunion_actions_insert_own"
  on public.mod_reunion_actions for insert
  with check (auth.uid() = user_id);

drop policy if exists "mod_reunion_actions_update_own" on public.mod_reunion_actions;
create policy "mod_reunion_actions_update_own"
  on public.mod_reunion_actions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "mod_reunion_actions_delete_own" on public.mod_reunion_actions;
create policy "mod_reunion_actions_delete_own"
  on public.mod_reunion_actions for delete
  using (auth.uid() = user_id);

drop policy if exists "mod_reunion_action_logs_select_own" on public.mod_reunion_action_logs;
create policy "mod_reunion_action_logs_select_own"
  on public.mod_reunion_action_logs for select
  using (auth.uid() = user_id);

drop policy if exists "mod_reunion_action_logs_insert_own" on public.mod_reunion_action_logs;
create policy "mod_reunion_action_logs_insert_own"
  on public.mod_reunion_action_logs for insert
  with check (auth.uid() = user_id);

drop policy if exists "mod_reunion_followups_select_own" on public.mod_reunion_followups;
create policy "mod_reunion_followups_select_own"
  on public.mod_reunion_followups for select
  using (auth.uid() = user_id);

drop policy if exists "mod_reunion_followups_insert_own" on public.mod_reunion_followups;
create policy "mod_reunion_followups_insert_own"
  on public.mod_reunion_followups for insert
  with check (auth.uid() = user_id);

-- Fonction utilitaire lecture publique controlee via token hash
create or replace function public.mod_reunion_get_public_meeting_by_token(raw_token text)
returns table (
  meeting_id uuid,
  title text,
  objective text,
  meeting_date timestamptz,
  status text
)
language sql
security definer
set search_path = public, pg_catalog
as $$
  select
    m.id as meeting_id,
    m.title,
    m.objective,
    m.meeting_date,
    m.status
  from public.mod_reunion_meetings m
  where m.public_join_token_hash = encode(digest(raw_token, 'sha256'), 'hex')
    and (m.public_join_token_expires_at is null or m.public_join_token_expires_at >= now())
  limit 1;
$$;

grant execute on function public.mod_reunion_get_public_meeting_by_token(text) to anon, authenticated;
