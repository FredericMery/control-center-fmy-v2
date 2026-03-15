create table if not exists public.calendar_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('blackwaves','microsoft','google','manual','hplus')),
  label text not null,
  is_enabled boolean not null default true,
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  external_account_id text,
  external_calendar_id text,
  sync_mode text not null default 'read' check (sync_mode in ('read','read_write')),
  last_sync_at timestamptz,
  last_sync_status text,
  last_sync_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_calendar_sources_user_id on public.calendar_sources(user_id);
create index if not exists idx_calendar_sources_provider on public.calendar_sources(provider);
create index if not exists idx_calendar_sources_enabled on public.calendar_sources(is_enabled);

create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_id uuid references public.calendar_sources(id) on delete set null,
  source_provider text not null,
  source_event_id text,
  external_etag text,
  title text not null,
  description text,
  location text,
  start_at timestamptz not null,
  end_at timestamptz not null,
  timezone text,
  all_day boolean not null default false,
  status text not null default 'confirmed' check (status in ('confirmed','tentative','cancelled')),
  visibility text not null default 'default',
  meeting_url text,
  organizer_email text,
  attendees jsonb not null default '[]'::jsonb,
  category text,
  event_type text,
  priority integer not null default 3,
  is_read_only boolean not null default false,
  is_blocking boolean not null default true,
  created_by_ai boolean not null default false,
  ai_context jsonb not null default '{}'::jsonb,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint uq_calendar_events_source unique (source_provider, source_event_id, user_id)
);

create index if not exists idx_calendar_events_user_id on public.calendar_events(user_id);
create index if not exists idx_calendar_events_source_id on public.calendar_events(source_id);
create index if not exists idx_calendar_events_start_at on public.calendar_events(start_at);
create index if not exists idx_calendar_events_end_at on public.calendar_events(end_at);
create index if not exists idx_calendar_events_status on public.calendar_events(status);
create index if not exists idx_calendar_events_category on public.calendar_events(category);

create table if not exists public.calendar_sync_runs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.calendar_sources(id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text check (status in ('running','success','partial','failed')),
  items_created integer not null default 0,
  items_updated integer not null default 0,
  items_deleted integer not null default 0,
  items_skipped integer not null default 0,
  error_message text,
  details jsonb not null default '{}'::jsonb
);

create table if not exists public.scheduling_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  day_start_time time not null default '09:00',
  day_end_time time not null default '18:00',
  lunch_start_time time,
  lunch_end_time time,
  minimum_buffer_minutes integer not null default 15,
  max_meetings_per_day integer not null default 6,
  default_meeting_duration_minutes integer not null default 60,
  allow_meetings_on_weekends boolean not null default false,
  preferred_focus_blocks jsonb not null default '[]'::jsonb,
  protected_time_blocks jsonb not null default '[]'::jsonb,
  preferred_meeting_windows jsonb not null default '[]'::jsonb,
  avoid_back_to_back boolean not null default true,
  timezone text not null default 'Europe/Paris',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.scheduling_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  request_text text not null,
  parsed_intent jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft','proposed','confirmed','scheduled','failed','cancelled')),
  requested_duration_minutes integer,
  requested_date_range jsonb not null default '{}'::jsonb,
  requested_attendees jsonb not null default '[]'::jsonb,
  proposed_slots jsonb not null default '[]'::jsonb,
  selected_slot jsonb not null default '{}'::jsonb,
  linked_event_id uuid references public.calendar_events(id) on delete set null,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.scheduling_actions_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid references public.scheduling_requests(id) on delete set null,
  action_type text not null,
  action_payload jsonb not null default '{}'::jsonb,
  result_status text,
  message text,
  created_at timestamptz not null default now()
);

alter table public.calendar_sources enable row level security;
alter table public.calendar_events enable row level security;
alter table public.calendar_sync_runs enable row level security;
alter table public.scheduling_preferences enable row level security;
alter table public.scheduling_requests enable row level security;
alter table public.scheduling_actions_log enable row level security;

drop policy if exists "calendar_sources_select_own" on public.calendar_sources;
create policy "calendar_sources_select_own" on public.calendar_sources for select using (auth.uid() = user_id);
drop policy if exists "calendar_sources_insert_own" on public.calendar_sources;
create policy "calendar_sources_insert_own" on public.calendar_sources for insert with check (auth.uid() = user_id);
drop policy if exists "calendar_sources_update_own" on public.calendar_sources;
create policy "calendar_sources_update_own" on public.calendar_sources for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "calendar_sources_delete_own" on public.calendar_sources;
create policy "calendar_sources_delete_own" on public.calendar_sources for delete using (auth.uid() = user_id);

drop policy if exists "calendar_events_select_own" on public.calendar_events;
create policy "calendar_events_select_own" on public.calendar_events for select using (auth.uid() = user_id);
drop policy if exists "calendar_events_insert_own" on public.calendar_events;
create policy "calendar_events_insert_own" on public.calendar_events for insert with check (auth.uid() = user_id);
drop policy if exists "calendar_events_update_own" on public.calendar_events;
create policy "calendar_events_update_own" on public.calendar_events for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "calendar_events_delete_own" on public.calendar_events;
create policy "calendar_events_delete_own" on public.calendar_events for delete using (auth.uid() = user_id);

drop policy if exists "calendar_sync_runs_select_own" on public.calendar_sync_runs;
create policy "calendar_sync_runs_select_own" on public.calendar_sync_runs for select using (
  exists (select 1 from public.calendar_sources s where s.id = source_id and s.user_id = auth.uid())
);
drop policy if exists "calendar_sync_runs_insert_own" on public.calendar_sync_runs;
create policy "calendar_sync_runs_insert_own" on public.calendar_sync_runs for insert with check (
  exists (select 1 from public.calendar_sources s where s.id = source_id and s.user_id = auth.uid())
);
drop policy if exists "calendar_sync_runs_update_own" on public.calendar_sync_runs;
create policy "calendar_sync_runs_update_own" on public.calendar_sync_runs for update using (
  exists (select 1 from public.calendar_sources s where s.id = source_id and s.user_id = auth.uid())
);

drop policy if exists "scheduling_preferences_select_own" on public.scheduling_preferences;
create policy "scheduling_preferences_select_own" on public.scheduling_preferences for select using (auth.uid() = user_id);
drop policy if exists "scheduling_preferences_insert_own" on public.scheduling_preferences;
create policy "scheduling_preferences_insert_own" on public.scheduling_preferences for insert with check (auth.uid() = user_id);
drop policy if exists "scheduling_preferences_update_own" on public.scheduling_preferences;
create policy "scheduling_preferences_update_own" on public.scheduling_preferences for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "scheduling_requests_select_own" on public.scheduling_requests;
create policy "scheduling_requests_select_own" on public.scheduling_requests for select using (auth.uid() = user_id);
drop policy if exists "scheduling_requests_insert_own" on public.scheduling_requests;
create policy "scheduling_requests_insert_own" on public.scheduling_requests for insert with check (auth.uid() = user_id);
drop policy if exists "scheduling_requests_update_own" on public.scheduling_requests;
create policy "scheduling_requests_update_own" on public.scheduling_requests for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "scheduling_requests_delete_own" on public.scheduling_requests;
create policy "scheduling_requests_delete_own" on public.scheduling_requests for delete using (auth.uid() = user_id);

drop policy if exists "scheduling_actions_log_select_own" on public.scheduling_actions_log;
create policy "scheduling_actions_log_select_own" on public.scheduling_actions_log for select using (auth.uid() = user_id);
drop policy if exists "scheduling_actions_log_insert_own" on public.scheduling_actions_log;
create policy "scheduling_actions_log_insert_own" on public.scheduling_actions_log for insert with check (auth.uid() = user_id);
