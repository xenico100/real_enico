-- Target: Enico project gkfupegrduencknzpzok ONLY, after the SMS retirement release is active.
-- Draft: the remote management connector returned INVALID_ARGUMENT; this has NOT been applied.
-- Verify aggregate row counts, sizes and dependencies before execution.
-- Does not alter orders, members, general email notifications, signup jobs or storage buckets.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
select pg_catalog.pg_advisory_xact_lock(904022061015::bigint);

do $retire$
declare related_job record;
begin
  if pg_catalog.to_regclass('cron.job') is not null then
    for related_job in execute $query$
      select jobid, command from cron.job where jobname = 'enico_phone_relay_cleanup'
    $query$ loop
      if pg_catalog.regexp_replace(related_job.command, '\s', '', 'g')
        not in ('selectpublic.phone_relay_cleanup();', 'selectpublic.phone_relay_cleanup()') then
        raise exception 'Unexpected command for SMS cleanup job; inspect before retirement';
      end if;
      execute 'select cron.unschedule($1)' using related_job.jobid;
    end loop;
  end if;
end
$retire$;

drop function if exists public.phone_relay_cleanup() restrict;
drop function if exists public.phone_relay_ack(text, uuid, text, text) restrict;
drop function if exists public.phone_relay_claim(text, text) restrict;
drop function if exists public.phone_relay_enqueue(text, text, text, text, text, uuid, text, jsonb, timestamptz) restrict;
drop function if exists public.phone_relay_control(text) restrict;
drop function if exists public.phone_relay_replace_device(text, text, timestamptz) restrict;
drop function if exists public.phone_relay_source_time(jsonb, text, text) restrict;
drop function if exists public.phone_relay_current_event(jsonb) restrict;
drop function if exists public.phone_relay_order_revision(jsonb) restrict;
drop function if exists public.phone_relay_normalize_phone(text) restrict;
drop table if exists public.phone_relay_jobs restrict;
drop table if exists public.phone_relay_devices restrict;
commit;

-- Postcheck (counts only): both relations and all phone_relay_* routines must be absent.
select pg_catalog.to_regclass('public.phone_relay_jobs') is null as jobs_absent,
  pg_catalog.to_regclass('public.phone_relay_devices') is null as devices_absent,
  (select count(*) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'phone_relay_%') as remaining_routines;
