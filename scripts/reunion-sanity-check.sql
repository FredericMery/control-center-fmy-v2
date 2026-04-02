-- Reunion module sanity checks
-- Run after executing:
-- 1) migrations/create-meeting-intelligence-module.sql
-- 2) migrations/setup-meeting-recordings-storage.sql

select to_regclass('public.mod_reunion_meetings') as meeting_table;
select to_regclass('public.mod_reunion_participants') as participants_table;
select to_regclass('public.mod_reunion_records') as records_table;
select to_regclass('public.mod_reunion_actions') as actions_table;
select to_regclass('public.mod_reunion_action_logs') as action_logs_table;
select to_regclass('public.mod_reunion_followups') as followups_table;

select id, name, public
from storage.buckets
where id = 'meeting-recordings';

select policyname, cmd
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and policyname = 'meeting-recordings: owner access';

select proname
from pg_proc
where proname = 'mod_reunion_get_public_meeting_by_token';

-- Optional: refresh PostgREST schema cache
notify pgrst, 'reload schema';
