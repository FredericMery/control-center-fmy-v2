alter table if exists public.scheduling_preferences
  add column if not exists professional_email text,
  add column if not exists holiday_country text not null default 'FR';

alter table if exists public.calendar_events
  add column if not exists planner_type text,
  add column if not exists workflow_status text not null default 'confirmed';

alter table if exists public.scheduling_requests
  add column if not exists workflow_status text not null default 'created',
  add column if not exists progression integer not null default 0,
  add column if not exists proposal_mode text not null default 'proposal',
  add column if not exists target_event_type text not null default 'pro',
  add column if not exists first_sent_at timestamptz,
  add column if not exists last_relance_at timestamptz,
  add column if not exists next_relance_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'calendar_events_planner_type_check'
  ) then
    alter table public.calendar_events
      add constraint calendar_events_planner_type_check
      check (planner_type in ('pro', 'perso') or planner_type is null);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'calendar_events_workflow_status_check'
  ) then
    alter table public.calendar_events
      add constraint calendar_events_workflow_status_check
      check (workflow_status in ('confirmed', 'pending_confirmation', 'relance_sent', 'finalized', 'cancelled'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'scheduling_requests_workflow_status_check'
  ) then
    alter table public.scheduling_requests
      add constraint scheduling_requests_workflow_status_check
      check (workflow_status in ('created', 'sent', 'relanced', 'confirmed', 'cancelled'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'scheduling_requests_progression_check'
  ) then
    alter table public.scheduling_requests
      add constraint scheduling_requests_progression_check
      check (progression >= 0 and progression <= 100);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'scheduling_requests_proposal_mode_check'
  ) then
    alter table public.scheduling_requests
      add constraint scheduling_requests_proposal_mode_check
      check (proposal_mode in ('direct', 'proposal'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'scheduling_requests_target_event_type_check'
  ) then
    alter table public.scheduling_requests
      add constraint scheduling_requests_target_event_type_check
      check (target_event_type in ('pro', 'perso'));
  end if;
end $$;

create index if not exists idx_calendar_events_user_planner_type
  on public.calendar_events(user_id, planner_type);

create index if not exists idx_calendar_events_user_workflow_status
  on public.calendar_events(user_id, workflow_status);

create index if not exists idx_scheduling_requests_user_workflow_status
  on public.scheduling_requests(user_id, workflow_status, updated_at desc);

create index if not exists idx_scheduling_requests_next_relance
  on public.scheduling_requests(next_relance_at)
  where next_relance_at is not null;
