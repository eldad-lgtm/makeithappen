/**
 * Hand-maintained Supabase schema types. Mirrors supabase/migrations.
 * Regenerate with `supabase gen types typescript --local > src/db/database.types.ts`
 * once a local stack is running; the shape below is compatible.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type TripStatusDb =
  | "draft" | "approval" | "approved" | "date_collection" | "date_proposed" | "date_locked"
  | "rejected" | "cancelled" | "sourcing" | "proposal_review" | "committed";
export type EscalationModeDb = "relay" | "managed" | "none";
export type PushLevelDb = "gentle" | "standard" | "spicy";
export type MemberRoleDb = "admin" | "member";
export type MemberStatusDb = "invited" | "active" | "declined" | "removed";
export type ApprovalDecisionDb = "yes" | "no";
export type DatePrefDb = "yes" | "maybe" | "no";
export type DateSourceDb = "system" | "admin" | "member";
export type JobStatusDb = "pending" | "running" | "done" | "cancelled" | "failed";
export type MsgDirectionDb = "inbound" | "outbound";
export type MsgChannelDb = "whatsapp" | "sms" | "deeplink" | "console" | "relay" | "suppressed";
export type NudgePhaseDb = "approval" | "dates";
export type NudgeTargetDb = "dm" | "group" | "admin";
export type NameSourceDb = "self" | "inviter";

export type UserRow = {
  id: string;
  phone_e164: string;
  display_name: string;
  avatar_url: string | null;
  timezone: string;
  locale: string;
  is_provisional: boolean;
  name_source: NameSourceDb;
  auth_user_id: string | null;
  claimed_at: string | null;
  messaging_opted_out_at: string | null;
  created_at: string;
}

export type TripRow = {
  id: string;
  title: string;
  destination: string;
  description: string;
  nights: number;
  window_start: string;
  window_end: string;
  quorum: number;
  response_deadline: string | null;
  status: TripStatusDb;
  escalation_mode: EscalationModeDb;
  push_level: PushLevelDb;
  locked_start_date: string | null;
  locked_end_date: string | null;
  locked_option_id: string | null;
  wa_group_id: string | null;
  wa_group_invite_link: string | null;
  approval_asked_at: string | null;
  dates_asked_at: string | null;
  automation_paused_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export type TripMemberRow = {
  trip_id: string;
  user_id: string;
  role: MemberRoleDb;
  is_essential: boolean;
  status: MemberStatusDb;
  invited_by: string | null;
  invited_at: string;
  joined_at: string | null;
}

export type ApprovalRow = {
  trip_id: string;
  user_id: string;
  decision: ApprovalDecisionDb;
  note: string | null;
  decided_at: string;
}

export type DateOptionRow = {
  id: string;
  trip_id: string;
  start_date: string;
  end_date: string;
  label: string;
  generated_by: DateSourceDb;
  suggested_by: string | null;
  created_at: string;
}

export type DateVoteRow = {
  date_option_id: string;
  user_id: string;
  preference: DatePrefDb;
  updated_at: string;
}

export type BlackoutRow = {
  id: string;
  trip_id: string;
  user_id: string;
  start_date: string;
  end_date: string;
  reason: string | null;
  created_at: string;
}

export type ScheduledJobRow = {
  id: string;
  trip_id: string | null;
  user_id: string | null;
  job_type: string;
  run_at: string;
  payload: Json;
  status: JobStatusDb;
  attempts: number;
  last_error: string | null;
  locked_at: string | null;
  created_at: string;
  updated_at: string;
}

export type NudgeRow = {
  id: string;
  trip_id: string;
  user_id: string;
  phase: NudgePhaseDb;
  level: number;
  target: NudgeTargetDb;
  sent_at: string;
  responded_at: string | null;
}

export type ActionTokenRow = {
  token_hash: string;
  trip_id: string;
  user_id: string;
  scope: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

export type RelayQueueRow = {
  id: string;
  trip_id: string;
  admin_user_id: string;
  nudge_id: string | null;
  level: number;
  rendered_body: string;
  created_at: string;
  expires_at: string;
  sent_at: string | null;
  dismissed_at: string | null;
}

export type MessageLogRow = {
  id: string;
  trip_id: string | null;
  user_id: string | null;
  direction: MsgDirectionDb;
  channel: MsgChannelDb;
  template_key: string | null;
  rendered_body: string;
  provider_sid: string | null;
  status: string;
  error: string | null;
  context: Json;
  created_at: string;
}

export type TripActivityRow = {
  id: string;
  trip_id: string;
  actor_user_id: string | null;
  kind: string;
  payload: Json;
  created_at: string;
}

export type AppSettingRow = {
  key: string;
  value: Json;
  updated_at: string;
}

export type MemberProfile = {
  user_id: string;
  display_name: string;
  phone_last4: string;
  is_provisional: boolean;
  timezone: string;
  opted_out: boolean;
  role: MemberRoleDb;
  is_essential: boolean;
  status: MemberStatusDb;
  invited_at: string;
}

type Table<R, I = Partial<R>, U = Partial<R>> = { Row: R; Insert: I; Update: U; Relationships: [] };

export type Database = {
  public: {
    Tables: {
      users: Table<UserRow>;
      trips: Table<TripRow>;
      trip_members: Table<TripMemberRow>;
      approvals: Table<ApprovalRow>;
      date_options: Table<DateOptionRow>;
      date_votes: Table<DateVoteRow>;
      blackout_dates: Table<BlackoutRow>;
      scheduled_jobs: Table<ScheduledJobRow>;
      nudges: Table<NudgeRow>;
      action_tokens: Table<ActionTokenRow>;
      relay_queue: Table<RelayQueueRow>;
      message_log: Table<MessageLogRow>;
      trip_activity: Table<TripActivityRow>;
      app_settings: Table<AppSettingRow>;
    };
    Views: Record<string, never>;
    Functions: {
      claim_current_user: { Args: { p_display_name?: string | null }; Returns: UserRow };
      invite_member: {
        Args: {
          p_trip_id: string;
          p_phone_e164: string;
          p_display_name: string;
          p_is_essential?: boolean;
          p_role?: MemberRoleDb;
        };
        Returns: TripMemberRow;
      };
      trip_member_profiles: { Args: { p_trip_id: string }; Returns: MemberProfile[] };
      claim_due_jobs: { Args: { p_limit?: number }; Returns: ScheduledJobRow[] };
      release_stale_jobs: { Args: Record<string, never>; Returns: number };
      outbound_counts: {
        Args: { p_user_id: string; p_trip_id: string };
        Returns: {
          user_today: number;
          user_dm_20h: number;
          user_dm_week: number;
          trip_total: number;
          account_today: number;
          account_month: number;
        }[];
      };
      engine_health: {
        Args: Record<string, never>;
        Returns: {
          pending_jobs: number;
          overdue_jobs: number;
          failed_jobs: number;
          running_jobs: number;
          outbound_24h: number;
          undelivered_24h: number;
          optouts_7d: number;
        }[];
      };
      is_trip_admin: { Args: { p_trip_id: string }; Returns: boolean };
      is_trip_member: { Args: { p_trip_id: string }; Returns: boolean };
      current_app_user_id: { Args: Record<string, never>; Returns: string | null };
    };
    Enums: {
      trip_status: TripStatusDb;
      escalation_mode: EscalationModeDb;
      push_level: PushLevelDb;
      member_role: MemberRoleDb;
      member_status: MemberStatusDb;
      approval_decision: ApprovalDecisionDb;
      date_pref: DatePrefDb;
      date_source: DateSourceDb;
      job_status: JobStatusDb;
      msg_direction: MsgDirectionDb;
      msg_channel: MsgChannelDb;
      nudge_phase: NudgePhaseDb;
      nudge_target: NudgeTargetDb;
      name_source: NameSourceDb;
    };
    CompositeTypes: Record<string, never>;
  };
}
