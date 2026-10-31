-- Defense in depth for hosted Postgres (Supabase). Supabase grants broad default privileges on new
-- public tables to its `anon` and `authenticated` roles and exposes them through the Data API. Row
-- level security already denies everything the policies in 0002 do not allow; this removes the
-- privileges as well, so a missing or mistaken policy can never expose or change data.
--
-- After this, app tokens can only SELECT the tables below, and only through their RLS policies. All
-- writes go through the API, which uses the service role. Additive and idempotent.

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on all tables in schema public from anon;
    revoke all on all sequences in schema public from anon;
    alter default privileges in schema public revoke all on tables from anon;
    alter default privileges in schema public revoke all on sequences from anon;
  end if;
end $$;

revoke all on all tables in schema public from authenticated;
revoke all on all sequences in schema public from authenticated;
alter default privileges in schema public revoke all on tables from authenticated;
alter default privileges in schema public revoke all on sequences from authenticated;

grant select on users, caretakers, user_caretaker_links, sensor_readings, fall_events,
                device_status, notification_logs to authenticated;

-- The retention job deletes data, so only the service role (and database owner) may run it.
revoke execute on function safefall_purge_sensor_readings(integer) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function safefall_purge_sensor_readings(integer) from anon;
  end if;
  revoke execute on function safefall_purge_sensor_readings(integer) from authenticated;
end $$;
