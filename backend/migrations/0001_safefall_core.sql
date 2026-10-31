-- SafeFall AI core schema. Additive and idempotent: safe to re-run, never drops or rewrites data.

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  -- Grants the detection configuration and calibration screens. Off by default.
  calibration_access boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists caretakers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  created_at timestamptz not null default now()
);

create table if not exists user_caretaker_links (
  user_id uuid not null references users (id) on delete restrict,
  caretaker_id uuid not null references caretakers (id) on delete restrict,
  relationship text not null default '' check (char_length(relationship) <= 60),
  created_at timestamptz not null default now(),
  primary key (user_id, caretaker_id)
);
create index if not exists user_caretaker_links_caretaker_idx on user_caretaker_links (caretaker_id);

-- The access code itself is never stored: only an HMAC keyed with a server-side pepper.
create table if not exists access_credentials (
  id uuid primary key default gen_random_uuid(),
  role text not null check (role in ('user', 'caretaker')),
  user_id uuid references users (id) on delete restrict,
  caretaker_id uuid references caretakers (id) on delete restrict,
  code_lookup text not null unique,
  label text not null default '',
  expires_at timestamptz,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  check ((role = 'user' and user_id is not null and caretaker_id is null)
      or (role = 'caretaker' and caretaker_id is not null and user_id is null))
);

create table if not exists refresh_tokens (
  id uuid primary key default gen_random_uuid(),
  credential_id uuid not null references access_credentials (id) on delete cascade,
  family_id uuid not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  replaced_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists refresh_tokens_family_idx on refresh_tokens (family_id);

-- Downsampled for storage: the phone uploads at a configurable interval, not every local sample.
create table if not exists sensor_readings (
  id bigint generated always as identity primary key,
  user_id uuid not null references users (id) on delete restrict,
  "timestamp" timestamptz not null,
  watch_epoch bigint not null,
  x double precision not null,
  y double precision not null,
  z double precision not null,
  received_at timestamptz not null default now(),
  unique (user_id, watch_epoch, x, y, z)
);
create index if not exists sensor_readings_user_time_idx on sensor_readings (user_id, "timestamp" desc);

create table if not exists fall_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete restrict,
  client_event_id text not null check (char_length(client_event_id) between 1 and 160),
  client_version integer not null default 1,
  event_timestamp timestamptz not null,
  event_type text not null check (event_type in ('fall', 'manual_sos')),
  detection_status text not null check (detection_status in (
    'NORMAL', 'UNUSUAL_MOVEMENT', 'POSSIBLE_FALL', 'FALL_VERIFICATION', 'CONFIRMED_FALL',
    'USER_NEEDS_ASSISTANCE', 'FALSE_ALARM', 'SENSOR_UNAVAILABLE')),
  -- Heuristic score from the uncalibrated rule engine. It is not a probability.
  detection_score double precision,
  sensor_quality text check (sensor_quality in ('good', 'degraded', 'poor')),
  movement_classification text,
  incident_state text not null check (incident_state in (
    'possible_fall', 'countdown', 'escalated', 'acknowledged', 'cancelled', 'resolved')),
  final_user_response text check (final_user_response in ('im_ok', 'requested_help', 'no_response')),
  details jsonb not null default '{}'::jsonb,
  acknowledged_at timestamptz,
  acknowledged_by uuid references caretakers (id) on delete set null,
  dispatched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, client_event_id)
);
create index if not exists fall_events_user_time_idx on fall_events (user_id, event_timestamp desc);
create index if not exists fall_events_unacked_idx on fall_events (dispatched_at) where acknowledged_at is null;

create table if not exists device_status (
  user_id uuid primary key references users (id) on delete restrict,
  watch_connection_status text not null,
  safety_state text not null default 'SENSOR_UNAVAILABLE',
  last_sync timestamptz,
  -- Null unless the watch actually reports a battery level. The current firmware does not.
  battery_level integer check (battery_level between 0 and 100),
  latest_epoch bigint,
  latest_x double precision,
  latest_y double precision,
  latest_z double precision,
  updated_at timestamptz not null default now()
);

create table if not exists push_tokens (
  id uuid primary key default gen_random_uuid(),
  caretaker_id uuid not null references caretakers (id) on delete cascade,
  token text not null unique,
  platform text not null check (platform in ('android', 'ios')),
  updated_at timestamptz not null default now()
);
create index if not exists push_tokens_caretaker_idx on push_tokens (caretaker_id);

-- delivery_status never says "delivered" on the provider's word alone:
--   queued / provider_accepted / failed / no_device come from this server,
--   device_received only from the recipient's own phone.
-- Acknowledgment is tracked separately on fall_events.
create table if not exists notification_logs (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references fall_events (id) on delete restrict,
  recipient_id uuid not null references caretakers (id) on delete restrict,
  push_token_id uuid references push_tokens (id) on delete set null,
  token_fingerprint text not null default '',
  delivery_status text not null check (delivery_status in (
    'queued', 'provider_accepted', 'failed', 'no_device', 'device_received')),
  provider_message_id text,
  error text,
  attempts integer not null default 1,
  sent_at timestamptz,
  device_received_at timestamptz,
  created_at timestamptz not null default now(),
  unique (incident_id, recipient_id, token_fingerprint)
);
create index if not exists notification_logs_incident_idx on notification_logs (incident_id);

-- Retention. Run on a schedule (for example pg_cron); fall_events are never purged by this.
create or replace function safefall_purge_sensor_readings(keep_days integer)
returns bigint language plpgsql as $$
declare removed bigint;
begin
  if keep_days < 1 then raise exception 'keep_days must be at least 1'; end if;
  delete from sensor_readings where "timestamp" < now() - make_interval(days => keep_days);
  get diagnostics removed = row_count;
  return removed;
end $$;
