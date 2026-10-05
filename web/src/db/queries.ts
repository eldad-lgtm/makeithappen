import type { SupabaseClient } from "@supabase/supabase-js";
import type { BlackoutRange, DateOption, Member, Trip } from "@/core/types";
import type {
  ApprovalRow,
  BlackoutRow,
  Database,
  DateOptionRow,
  DateVoteRow,
  MemberProfile,
  TripRow,
  UserRow,
} from "./database.types";

/**
 * Read-side mappers from rows to `core` shapes. Work with either client:
 * the session client (RLS applies) or the service client (chokepoint).
 */

export type AnyClient = SupabaseClient<Database>;

export interface TripAggregate {
  trip: Trip;
  row: TripRow;
  members: Member[];
  profiles: MemberProfile[];
  options: DateOption[];
  blackouts: BlackoutRange[];
  creatorName: string;
}

export function toTrip(r: TripRow): Trip {
  return {
    id: r.id,
    title: r.title,
    destination: r.destination,
    description: r.description,
    nights: r.nights,
    windowStart: r.window_start,
    windowEnd: r.window_end,
    quorum: r.quorum,
    escalationMode: r.escalation_mode,
    pushLevel: r.push_level,
    status: r.status,
    approvalAskedAt: ms(r.approval_asked_at),
    datesAskedAt: ms(r.dates_asked_at),
    responseDeadline: ms(r.response_deadline),
    lockedOptionId: r.locked_option_id,
  };
}

export function toOption(r: DateOptionRow): DateOption {
  return {
    id: r.id,
    start: r.start_date,
    end: r.end_date,
    label: r.label,
    generatedBy: r.generated_by,
    suggestedById: r.suggested_by ?? undefined,
  };
}

function ms(iso: string | null): number | null {
  return iso ? new Date(iso).getTime() : null;
}

/**
 * Load everything the engine needs for one trip. Members are built from
 * `trip_member_profiles` (masked phones) when using the session client; the
 * service client gets the same shape from the raw tables.
 */
export async function loadTrip(db: AnyClient, tripId: string, mode: "session" | "service"): Promise<TripAggregate | null> {
  const { data: row } = await db.from("trips").select("*").eq("id", tripId).maybeSingle();
  if (!row) return null;

  const [profiles, approvals, options, votes, blackouts] = await Promise.all([
    loadProfiles(db, tripId, mode),
    db.from("approvals").select("*").eq("trip_id", tripId),
    db.from("date_options").select("*").eq("trip_id", tripId).order("start_date"),
    db.from("date_votes").select("*, date_options!inner(trip_id)").eq("date_options.trip_id", tripId),
    db.from("blackout_dates").select("*").eq("trip_id", tripId),
  ]);

  const approvalBy = new Map<string, ApprovalRow>();
  for (const a of approvals.data ?? []) approvalBy.set(a.user_id, a);

  const votesBy = new Map<string, Record<string, "yes" | "maybe" | "no">>();
  for (const v of (votes.data ?? []) as unknown as DateVoteRow[]) {
    const m = votesBy.get(v.user_id) ?? {};
    m[v.date_option_id] = v.preference;
    votesBy.set(v.user_id, m);
  }

  const members: Member[] = profiles.map((p) => ({
    id: p.user_id,
    name: p.display_name,
    role: p.role,
    status: p.status,
    isEssential: p.is_essential,
    timezone: p.timezone,
    approval: approvalBy.get(p.user_id)?.decision ?? null,
    votes: votesBy.get(p.user_id) ?? {},
    optedOut: p.opted_out,
  }));

  const creator = profiles.find((p) => p.user_id === row.created_by);

  return {
    trip: toTrip(row),
    row,
    members,
    profiles,
    options: (options.data ?? []).map(toOption),
    blackouts: ((blackouts.data ?? []) as BlackoutRow[]).map((b) => ({
      userId: b.user_id,
      start: b.start_date,
      end: b.end_date,
    })),
    creatorName: creator?.display_name ?? "Your friend",
  };
}

async function loadProfiles(db: AnyClient, tripId: string, mode: "session" | "service"): Promise<MemberProfile[]> {
  if (mode === "session") {
    const { data, error } = await db.rpc("trip_member_profiles", { p_trip_id: tripId });
    if (error) throw new Error(`trip_member_profiles: ${error.message}`);
    return (data ?? []) as MemberProfile[];
  }
  const { data, error } = await db
    .from("trip_members")
    .select("*, users!inner(id, display_name, phone_e164, is_provisional, timezone, messaging_opted_out_at)")
    .eq("trip_id", tripId)
    .order("invited_at");
  if (error) throw new Error(`trip_members: ${error.message}`);
  type Joined = Database["public"]["Tables"]["trip_members"]["Row"] & {
    users: Pick<UserRow, "id" | "display_name" | "phone_e164" | "is_provisional" | "timezone" | "messaging_opted_out_at">;
  };
  return ((data ?? []) as unknown as Joined[]).map((r) => ({
    user_id: r.user_id,
    display_name: r.users.display_name,
    phone_last4: r.users.phone_e164.slice(-4),
    is_provisional: r.users.is_provisional,
    timezone: r.users.timezone,
    opted_out: r.users.messaging_opted_out_at !== null,
    role: r.role,
    is_essential: r.is_essential,
    status: r.status,
    invited_at: r.invited_at,
  }));
}

/** Service path only: full phone numbers for sending. */
export async function loadMemberPhones(db: AnyClient, tripId: string): Promise<Map<string, UserRow>> {
  const { data, error } = await db
    .from("trip_members")
    .select("user_id, users!inner(*)")
    .eq("trip_id", tripId);
  if (error) throw new Error(`loadMemberPhones: ${error.message}`);
  const out = new Map<string, UserRow>();
  for (const r of (data ?? []) as unknown as { user_id: string; users: UserRow }[]) out.set(r.user_id, r.users);
  return out;
}
