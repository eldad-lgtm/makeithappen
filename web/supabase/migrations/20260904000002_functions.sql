-- RPC functions. Security-definer where a session user legitimately needs to
-- touch rows RLS would otherwise hide (another person's provisional user row),
-- always with an explicit authorisation check at the top.

-- -------------------------------------------------- claim_current_user ---
-- Called right after OTP verification. Links the auth user to the app user
-- for that phone, creating or CLAIMING the row (§5.1). Every historical vote
-- and membership is already theirs because phone_e164 is the identity key.

create or replace function claim_current_user(p_display_name text default null)
returns users
language plpgsql security definer set search_path = public as $$
declare
  v_auth_id uuid := auth.uid();
  v_phone   text := nullif(auth.jwt() ->> 'phone', '');
  v_user    users;
begin
  if v_auth_id is null or v_phone is null then
    raise exception 'not authenticated with a phone' using errcode = '28000';
  end if;
  if left(v_phone, 1) <> '+' then
    v_phone := '+' || v_phone;
  end if;

  select * into v_user from users where phone_e164 = v_phone;

  if v_user.id is null then
    insert into users (phone_e164, display_name, is_provisional, name_source, auth_user_id, claimed_at)
    values (v_phone, coalesce(nullif(trim(p_display_name), ''), 'New member'), false, 'self', v_auth_id, now())
    returning * into v_user;
  else
    update users
       set auth_user_id   = v_auth_id,
           claimed_at     = coalesce(claimed_at, now()),
           is_provisional = false,
           display_name   = coalesce(nullif(trim(p_display_name), ''), display_name),
           name_source    = case when nullif(trim(p_display_name), '') is not null then 'self'::name_source else name_source end
     where id = v_user.id
     returning * into v_user;
  end if;

  return v_user;
end $$;

revoke all on function claim_current_user(text) from public;
grant execute on function claim_current_user(text) to authenticated;

-- -------------------------------------------------------- invite_member ---
-- Upserts a provisional user for the phone and adds them to the trip. A
-- display name is REQUIRED: the nudge has to say "Dani", not a number (§5.1).

create or replace function invite_member(
  p_trip_id      uuid,
  p_phone_e164   text,
  p_display_name text,
  p_is_essential boolean default false,
  p_role         member_role default 'member'
) returns trip_members
language plpgsql security definer set search_path = public as $$
declare
  v_me       uuid := current_app_user_id();
  v_trip     trips;
  v_user_id  uuid;
  v_member   trip_members;
  v_tz       text;
begin
  if v_me is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if not is_trip_admin(p_trip_id) then
    raise exception 'only trip admins can invite' using errcode = '42501';
  end if;
  if coalesce(trim(p_display_name), '') = '' then
    raise exception 'display name is required' using errcode = '22023';
  end if;

  select * into v_trip from trips where id = p_trip_id;
  select timezone into v_tz from users where id = v_trip.created_by;

  insert into users (phone_e164, display_name, is_provisional, name_source, timezone)
  values (p_phone_e164, trim(p_display_name), true, 'inviter', coalesce(v_tz, 'UTC'))
  on conflict (phone_e164) do update
    set display_name = case when users.is_provisional and users.name_source = 'inviter'
                            then excluded.display_name else users.display_name end
  returning id into v_user_id;

  insert into trip_members (trip_id, user_id, role, is_essential, status, invited_by)
  values (p_trip_id, v_user_id, p_role, p_is_essential, 'invited', v_me)
  on conflict (trip_id, user_id) do update
    set is_essential = excluded.is_essential,
        role         = greatest(trip_members.role, excluded.role),
        status       = case when trip_members.status = 'removed' then 'invited'::member_status else trip_members.status end
  returning * into v_member;

  insert into trip_activity (trip_id, actor_user_id, kind, payload)
  values (p_trip_id, v_me, 'member_invited', jsonb_build_object('user_id', v_user_id, 'name', trim(p_display_name)));

  return v_member;
end $$;

revoke all on function invite_member(uuid, text, text, boolean, member_role) from public;
grant execute on function invite_member(uuid, text, text, boolean, member_role) to authenticated;

-- ------------------------------------------------ trip_member_profiles ---
-- Members see each other's names and the last four digits of the phone.
-- Never the full number (§9).

create or replace function trip_member_profiles(p_trip_id uuid)
returns table (
  user_id        uuid,
  display_name   text,
  phone_last4    text,
  is_provisional boolean,
  timezone       text,
  opted_out      boolean,
  role           member_role,
  is_essential   boolean,
  status         member_status,
  invited_at     timestamptz
)
language sql stable security definer set search_path = public as $$
  select u.id, u.display_name, right(u.phone_e164, 4), u.is_provisional, u.timezone,
         u.messaging_opted_out_at is not null,
         tm.role, tm.is_essential, tm.status, tm.invited_at
    from trip_members tm
    join users u on u.id = tm.user_id
   where tm.trip_id = p_trip_id
     and is_trip_member(p_trip_id)
   order by tm.role desc, tm.invited_at
$$;

revoke all on function trip_member_profiles(uuid) from public;
grant execute on function trip_member_profiles(uuid) to authenticated;

-- ------------------------------------------------------ claim_due_jobs ---
-- Service role only. Claims due jobs with SKIP LOCKED so concurrent runners
-- never execute the same job twice (§7.4).

create or replace function claim_due_jobs(p_limit int default 50)
returns setof scheduled_jobs
language plpgsql security definer set search_path = public as $$
begin
  return query
  with due as (
    select id from scheduled_jobs
     where status = 'pending' and run_at <= now()
     order by run_at
     limit p_limit
     for update skip locked
  )
  update scheduled_jobs j
     set status = 'running', attempts = j.attempts + 1, locked_at = now()
    from due
   where j.id = due.id
  returning j.*;
end $$;

revoke all on function claim_due_jobs(int) from public;
grant execute on function claim_due_jobs(int) to service_role;

-- Reclaim jobs whose runner died mid-flight (locked > 10 minutes).
create or replace function release_stale_jobs()
returns int
language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  update scheduled_jobs
     set status = 'pending', locked_at = null,
         last_error = coalesce(last_error, '') || ' [reclaimed after stale lock]'
   where status = 'running' and locked_at < now() - interval '10 minutes';
  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke all on function release_stale_jobs() from public;
grant execute on function release_stale_jobs() to service_role;

-- ---------------------------------------------------- outbound counters ---
-- Used by the sender chokepoint for §6.8 per-person caps and §7.7 budgets.

create or replace function outbound_counts(p_user_id uuid, p_trip_id uuid)
returns table (
  user_today      bigint,
  user_dm_20h     bigint,
  user_dm_week    bigint,
  trip_total      bigint,
  account_today   bigint,
  account_month   bigint
)
language sql stable security definer set search_path = public as $$
  select
    (select count(*) from message_log
      where user_id = p_user_id and direction = 'outbound'
        and channel in ('whatsapp', 'sms') and created_at > now() - interval '24 hours'),
    (select count(*) from nudges
      where user_id = p_user_id and target = 'dm' and sent_at > now() - interval '20 hours'),
    (select count(*) from nudges
      where user_id = p_user_id and target = 'dm' and sent_at > now() - interval '7 days'),
    (select count(*) from message_log
      where trip_id = p_trip_id and direction = 'outbound' and channel in ('whatsapp', 'sms')),
    (select count(*) from message_log
      where direction = 'outbound' and channel in ('whatsapp', 'sms')
        and created_at > now() - interval '24 hours'),
    (select count(*) from message_log
      where direction = 'outbound' and channel in ('whatsapp', 'sms')
        and created_at > date_trunc('month', now()))
$$;

revoke all on function outbound_counts(uuid, uuid) from public;
grant execute on function outbound_counts(uuid, uuid) to service_role;

-- --------------------------------------------------------- stuck_trips ---
-- Internal admin view (§7.7): the alert that matters most is jobs pending
-- past run_at — the runner is dead.

create or replace function engine_health()
returns table (
  pending_jobs       bigint,
  overdue_jobs       bigint,
  failed_jobs        bigint,
  running_jobs       bigint,
  outbound_24h       bigint,
  undelivered_24h    bigint,
  optouts_7d         bigint
)
language sql stable security definer set search_path = public as $$
  select
    (select count(*) from scheduled_jobs where status = 'pending'),
    (select count(*) from scheduled_jobs where status = 'pending' and run_at < now() - interval '15 minutes'),
    (select count(*) from scheduled_jobs where status = 'failed'),
    (select count(*) from scheduled_jobs where status = 'running'),
    (select count(*) from message_log where direction = 'outbound' and created_at > now() - interval '24 hours'),
    (select count(*) from message_log where direction = 'outbound' and status in ('undelivered', 'failed') and created_at > now() - interval '24 hours'),
    (select count(*) from users where messaging_opted_out_at > now() - interval '7 days')
$$;

revoke all on function engine_health() from public;
grant execute on function engine_health() to service_role;
