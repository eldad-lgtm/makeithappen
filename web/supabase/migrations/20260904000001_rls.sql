-- Row-level security for the SESSION path (PLAN.md §7.6).
--
-- RLS keys off auth.uid(). The TOKEN path (WhatsApp participants, webhooks,
-- cron) has no session and is authorised in application code behind the
-- service-role chokepoint; the service role bypasses RLS entirely.

-- ------------------------------------------------------------- helpers ---

-- The app user row for the current auth session, or null.
create or replace function current_app_user_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from users where auth_user_id = auth.uid() limit 1
$$;

create or replace function is_trip_member(p_trip_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from trip_members tm
    where tm.trip_id = p_trip_id
      and tm.user_id = current_app_user_id()
      and tm.status in ('invited', 'active')
  )
$$;

create or replace function is_trip_admin(p_trip_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from trip_members tm
    where tm.trip_id = p_trip_id
      and tm.user_id = current_app_user_id()
      and tm.role = 'admin'
      and tm.status in ('invited', 'active')
  )
$$;

-- --------------------------------------------------------------- users ---

alter table users enable row level security;

create policy users_select_self on users
  for select using (auth_user_id = auth.uid());

create policy users_update_self on users
  for update using (auth_user_id = auth.uid())
  with check (auth_user_id = auth.uid());

-- Other members' profiles are exposed only through trip_member_profiles()
-- below, which masks the phone number to its last four digits (§9).

-- --------------------------------------------------------------- trips ---

alter table trips enable row level security;

create policy trips_select_member on trips
  for select using (is_trip_member(id));

create policy trips_insert_creator on trips
  for insert with check (created_by = current_app_user_id());

create policy trips_update_admin on trips
  for update using (is_trip_admin(id)) with check (is_trip_admin(id));

-- -------------------------------------------------------- trip_members ---

alter table trip_members enable row level security;

create policy trip_members_select_member on trip_members
  for select using (is_trip_member(trip_id));

-- The creator's own admin row, inserted right after the trip. Everyone else
-- arrives via invite_member() which runs as definer.
create policy trip_members_insert_self_admin on trip_members
  for insert with check (
    user_id = current_app_user_id()
    and role = 'admin'
    and exists (select 1 from trips t where t.id = trip_id and t.created_by = current_app_user_id())
  );

create policy trip_members_update_admin on trip_members
  for update using (is_trip_admin(trip_id)) with check (is_trip_admin(trip_id));

-- ----------------------------------------------------------- approvals ---

alter table approvals enable row level security;

create policy approvals_select_member on approvals
  for select using (is_trip_member(trip_id));

create policy approvals_write_own on approvals
  for all using (user_id = current_app_user_id() and is_trip_member(trip_id))
  with check (user_id = current_app_user_id() and is_trip_member(trip_id));

-- -------------------------------------------------------- date_options ---

alter table date_options enable row level security;

create policy date_options_select_member on date_options
  for select using (is_trip_member(trip_id));

create policy date_options_insert_admin on date_options
  for insert with check (is_trip_admin(trip_id));

create policy date_options_delete_admin on date_options
  for delete using (is_trip_admin(trip_id));

-- ---------------------------------------------------------- date_votes ---

alter table date_votes enable row level security;

create policy date_votes_select_member on date_votes
  for select using (
    exists (select 1 from date_options o where o.id = date_option_id and is_trip_member(o.trip_id))
  );

create policy date_votes_write_own on date_votes
  for all using (user_id = current_app_user_id())
  with check (
    user_id = current_app_user_id()
    and exists (select 1 from date_options o where o.id = date_option_id and is_trip_member(o.trip_id))
  );

-- ------------------------------------------------------ blackout_dates ---

alter table blackout_dates enable row level security;

create policy blackout_select_member on blackout_dates
  for select using (is_trip_member(trip_id));

create policy blackout_write_own on blackout_dates
  for all using (user_id = current_app_user_id() and is_trip_member(trip_id))
  with check (user_id = current_app_user_id() and is_trip_member(trip_id));

-- -------------------------------------------------------------- engine ---

-- No session policies: service role only.
alter table scheduled_jobs enable row level security;
alter table action_tokens  enable row level security;
alter table app_settings   enable row level security;

alter table nudges enable row level security;
create policy nudges_select_member on nudges
  for select using (is_trip_member(trip_id));

alter table relay_queue enable row level security;
create policy relay_select_admin on relay_queue
  for select using (admin_user_id = current_app_user_id());
create policy relay_update_admin on relay_queue
  for update using (admin_user_id = current_app_user_id())
  with check (admin_user_id = current_app_user_id());

alter table message_log enable row level security;
-- Members see the trip's outbound log entries addressed to themselves; admins
-- see everything for their trips. Phone numbers never appear in rendered_body.
create policy message_log_select on message_log
  for select using (
    (trip_id is not null and is_trip_admin(trip_id))
    or user_id = current_app_user_id()
  );

alter table trip_activity enable row level security;
create policy trip_activity_select_member on trip_activity
  for select using (is_trip_member(trip_id));
create policy trip_activity_insert_member on trip_activity
  for insert with check (is_trip_member(trip_id) and actor_user_id = current_app_user_id());
