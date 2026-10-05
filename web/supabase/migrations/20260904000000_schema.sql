-- MakeItHappen — core schema. PLAN.md §5.
--
-- Every table carries row-level security (next migration). The access rule
-- throughout: you can see a row if you are an active member of its trip.
-- `scheduled_jobs` and `action_tokens` have no session policies at all: they
-- are reachable only through the service-role chokepoint (§7.6).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- enums ---

create type trip_status as enum (
  'draft', 'approval', 'approved', 'date_collection', 'date_proposed',
  'date_locked', 'rejected', 'cancelled',
  -- Phase 2 (designed for, not built)
  'sourcing', 'proposal_review', 'committed'
);
create type escalation_mode as enum ('relay', 'managed', 'none');
create type push_level as enum ('gentle', 'standard', 'spicy');
create type member_role as enum ('admin', 'member');
create type member_status as enum ('invited', 'active', 'declined', 'removed');
create type approval_decision as enum ('yes', 'no');
create type date_pref as enum ('yes', 'maybe', 'no');
create type date_source as enum ('system', 'admin', 'member');
create type job_status as enum ('pending', 'running', 'done', 'cancelled', 'failed');
create type msg_direction as enum ('inbound', 'outbound');
create type msg_channel as enum ('whatsapp', 'sms', 'deeplink', 'console', 'relay', 'suppressed');
create type nudge_phase as enum ('approval', 'dates');
create type nudge_target as enum ('dm', 'group', 'admin');
create type name_source as enum ('self', 'inviter');

-- ------------------------------------------------------------- identity ---

create table users (
  id                        uuid primary key default gen_random_uuid(),
  phone_e164                text not null unique,
  display_name              text not null,
  avatar_url                text,
  timezone                  text not null default 'UTC',
  locale                    text not null default 'en',
  is_provisional            boolean not null default true,
  name_source               name_source not null default 'inviter',
  auth_user_id              uuid unique references auth.users (id) on delete set null,
  claimed_at                timestamptz,
  messaging_opted_out_at    timestamptz,
  created_at                timestamptz not null default now(),
  constraint phone_e164_format check (phone_e164 ~ '^\+[1-9][0-9]{6,14}$')
);
comment on table users is
  'One row per phone number. Provisional rows are created at invite time (§5.1) and claimed on OTP login. phone_e164 is PII: never exposed to other members beyond last 4 digits (§9).';

-- ---------------------------------------------------------------- trips ---

create table trips (
  id                     uuid primary key default gen_random_uuid(),
  title                  text not null,
  destination            text not null,
  description            text not null default '',
  nights                 int  not null check (nights between 1 and 30),
  window_start           date not null,
  window_end             date not null,
  quorum                 int  not null check (quorum >= 1),
  response_deadline      timestamptz,
  status                 trip_status not null default 'draft',
  escalation_mode        escalation_mode not null default 'relay',
  push_level             push_level not null default 'standard',
  locked_start_date      date,
  locked_end_date        date,
  locked_option_id       uuid,
  wa_group_id            text,
  wa_group_invite_link   text,
  approval_asked_at      timestamptz,
  dates_asked_at         timestamptz,
  automation_paused_at   timestamptz,
  created_by             uuid not null references users (id),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint window_order check (window_end > window_start)
);
create index trips_status_idx on trips (status);
create index trips_created_by_idx on trips (created_by);

create table trip_members (
  trip_id       uuid not null references trips (id) on delete cascade,
  user_id       uuid not null references users (id) on delete cascade,
  role          member_role not null default 'member',
  is_essential  boolean not null default false,
  status        member_status not null default 'invited',
  invited_by    uuid references users (id),
  invited_at    timestamptz not null default now(),
  joined_at     timestamptz,
  primary key (trip_id, user_id)
);
create index trip_members_user_idx on trip_members (user_id);

-- ------------------------------------------------------------- approval ---

create table approvals (
  trip_id     uuid not null references trips (id) on delete cascade,
  user_id     uuid not null references users (id) on delete cascade,
  decision    approval_decision not null,
  note        text,
  decided_at  timestamptz not null default now(),
  primary key (trip_id, user_id)
);

-- --------------------------------------------------------- availability ---

create table date_options (
  id            uuid primary key default gen_random_uuid(),
  trip_id       uuid not null references trips (id) on delete cascade,
  start_date    date not null,
  end_date      date not null,
  label         text not null,
  generated_by  date_source not null default 'system',
  suggested_by  uuid references users (id),
  created_at    timestamptz not null default now(),
  constraint option_order check (end_date > start_date),
  unique (trip_id, start_date, end_date)
);
create index date_options_trip_idx on date_options (trip_id);

alter table trips
  add constraint trips_locked_option_fk
  foreign key (locked_option_id) references date_options (id) on delete set null;

create table date_votes (
  date_option_id  uuid not null references date_options (id) on delete cascade,
  user_id         uuid not null references users (id) on delete cascade,
  preference      date_pref not null,
  updated_at      timestamptz not null default now(),
  primary key (date_option_id, user_id)
);
create index date_votes_user_idx on date_votes (user_id);

create table blackout_dates (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid not null references trips (id) on delete cascade,
  user_id     uuid not null references users (id) on delete cascade,
  start_date  date not null,
  end_date    date not null,
  reason      text,
  created_at  timestamptz not null default now(),
  constraint blackout_order check (end_date >= start_date)
);
create index blackout_dates_trip_user_idx on blackout_dates (trip_id, user_id);

-- --------------------------------------------------------------- engine ---

create table scheduled_jobs (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid references trips (id) on delete cascade,
  user_id     uuid references users (id) on delete cascade,
  job_type    text not null,
  run_at      timestamptz not null,
  payload     jsonb not null default '{}'::jsonb,
  status      job_status not null default 'pending',
  attempts    int not null default 0,
  last_error  text,
  locked_at   timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table scheduled_jobs is
  'The durable spine of all automation (§7.4). Nothing in the system relies on an in-memory timer.';
create index scheduled_jobs_due_idx on scheduled_jobs (run_at) where status = 'pending';
create index scheduled_jobs_trip_user_idx on scheduled_jobs (trip_id, user_id, status);

create table nudges (
  id            uuid primary key default gen_random_uuid(),
  trip_id       uuid not null references trips (id) on delete cascade,
  user_id       uuid not null references users (id) on delete cascade,
  phase         nudge_phase not null,
  level         int not null check (level between 1 and 5),
  target        nudge_target not null,
  sent_at       timestamptz not null default now(),
  responded_at  timestamptz
);
create index nudges_user_sent_idx on nudges (user_id, sent_at desc);
create index nudges_trip_idx on nudges (trip_id, user_id, phase);

create table action_tokens (
  token_hash  text primary key,
  trip_id     uuid not null references trips (id) on delete cascade,
  user_id     uuid not null references users (id) on delete cascade,
  scope       text not null,
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);
comment on table action_tokens is
  'No-login web access (§7.6). Hashed at rest; single scope; expires with its phase.';
create index action_tokens_trip_user_idx on action_tokens (trip_id, user_id, scope);

create table relay_queue (
  id             uuid primary key default gen_random_uuid(),
  trip_id        uuid not null references trips (id) on delete cascade,
  admin_user_id  uuid not null references users (id) on delete cascade,
  nudge_id       uuid references nudges (id) on delete set null,
  level          int not null,
  rendered_body  text not null,
  created_at     timestamptz not null default now(),
  expires_at     timestamptz not null,
  sent_at        timestamptz,
  dismissed_at   timestamptz
);
comment on table relay_queue is
  'Group callouts awaiting an admin tap (relay mode, §7.3). A callout past expires_at is dropped, never sent late.';
create index relay_queue_admin_idx on relay_queue (admin_user_id) where sent_at is null and dismissed_at is null;

create table message_log (
  id             uuid primary key default gen_random_uuid(),
  trip_id        uuid references trips (id) on delete set null,
  user_id        uuid references users (id) on delete set null,
  direction      msg_direction not null,
  channel        msg_channel not null,
  template_key   text,
  rendered_body  text not null,
  provider_sid   text,
  status         text not null default 'queued',
  error          text,
  context        jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);
comment on table message_log is 'Full audit trail of every message in and out (§9). Indispensable for debugging the engine.';
create unique index message_log_provider_sid_idx on message_log (provider_sid) where provider_sid is not null;
create index message_log_user_created_idx on message_log (user_id, created_at desc);
create index message_log_trip_idx on message_log (trip_id, created_at desc);

create table trip_activity (
  id             uuid primary key default gen_random_uuid(),
  trip_id        uuid not null references trips (id) on delete cascade,
  actor_user_id  uuid references users (id) on delete set null,
  kind           text not null,
  payload        jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);
comment on table trip_activity is 'Append-only. Powers the timeline UI and digests.';
create index trip_activity_trip_idx on trip_activity (trip_id, created_at desc);

-- Operational flags: the kill switch lives here so it flips without a deploy (§7.7).
create table app_settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);
insert into app_settings (key, value) values
  ('outbound_enabled', 'true'::jsonb),
  ('spend_circuit_open', 'false'::jsonb);

-- ------------------------------------------------------------- triggers ---

create or replace function set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger trips_updated_at before update on trips
  for each row execute function set_updated_at();
create trigger scheduled_jobs_updated_at before update on scheduled_jobs
  for each row execute function set_updated_at();
