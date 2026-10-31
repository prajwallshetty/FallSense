-- Row-level security. The API uses the service role and authorizes in code; these policies protect
-- every other path into the database, including Supabase Realtime subscriptions from the app.
-- Identity comes from the signed JWT (`sub`, `app_role`) that the API issues.

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end $$;

create or replace function safefall_subject() returns uuid
language sql stable as $$
  select nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid
$$;

create or replace function safefall_app_role() returns text
language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'app_role'
$$;

-- SECURITY DEFINER so the link lookup is not itself filtered by RLS.
create or replace function safefall_can_view_user(target uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select (safefall_app_role() = 'user' and safefall_subject() = target)
      or (safefall_app_role() = 'caretaker' and exists (
            select 1 from user_caretaker_links l
            where l.user_id = target and l.caretaker_id = safefall_subject()))
$$;

alter table users enable row level security;
alter table caretakers enable row level security;
alter table user_caretaker_links enable row level security;
alter table access_credentials enable row level security;
alter table refresh_tokens enable row level security;
alter table sensor_readings enable row level security;
alter table fall_events enable row level security;
alter table device_status enable row level security;
alter table push_tokens enable row level security;
alter table notification_logs enable row level security;

-- Read-only for app tokens. access_credentials, refresh_tokens and push_tokens have no policy
-- at all, so they are unreachable except through the service role.
grant select on users, caretakers, user_caretaker_links, sensor_readings, fall_events,
                 device_status, notification_logs to authenticated;

drop policy if exists users_read on users;
create policy users_read on users for select to authenticated using (safefall_can_view_user(id));

drop policy if exists caretakers_read on caretakers;
create policy caretakers_read on caretakers for select to authenticated using (
  (safefall_app_role() = 'caretaker' and id = safefall_subject())
  or exists (select 1 from user_caretaker_links l
             where l.caretaker_id = caretakers.id and safefall_can_view_user(l.user_id)));

drop policy if exists links_read on user_caretaker_links;
create policy links_read on user_caretaker_links for select to authenticated
  using (safefall_can_view_user(user_id));

drop policy if exists readings_read on sensor_readings;
create policy readings_read on sensor_readings for select to authenticated
  using (safefall_can_view_user(user_id));

drop policy if exists events_read on fall_events;
create policy events_read on fall_events for select to authenticated
  using (safefall_can_view_user(user_id));

drop policy if exists status_read on device_status;
create policy status_read on device_status for select to authenticated
  using (safefall_can_view_user(user_id));

drop policy if exists notifications_read on notification_logs;
create policy notifications_read on notification_logs for select to authenticated using (
  (safefall_app_role() = 'caretaker' and recipient_id = safefall_subject())
  or exists (select 1 from fall_events e where e.id = incident_id and safefall_can_view_user(e.user_id)));

-- Realtime publication exists on Supabase only. Adding a table twice is an error, so check first.
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['fall_events', 'device_status'] loop
      if not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and tablename = t) then
        execute format('alter publication supabase_realtime add table %I', t);
      end if;
    end loop;
  end if;
end $$;
