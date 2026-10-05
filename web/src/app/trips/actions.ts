"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { addDays, inTripWindow, labelFor } from "@/core/dates";
import { normalizePhone } from "@/core/phone";
import type { EscalationMode, Pref, PushLevel } from "@/core/types";
import { trusted } from "@/db/token-scope/client";
import { dismissRelay, markRelaySent } from "@/engine/nudges";
import * as engine from "@/engine/trip";
import { cancelPending } from "@/jobs/scheduler";
import { requireUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { captureException } from "@/observability/log";

/**
 * Organizer actions. Authorisation is two-layered: the session client's
 * queries are subject to RLS, and anything that needs the engine (which runs
 * through the service-role chokepoint) first proves admin role via
 * `is_trip_admin` on the session path (PLAN.md §7.6).
 */

export interface ActionState {
  error?: string;
  ok?: boolean;
}

async function requireAdmin(tripId: string) {
  const s = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data: isAdmin } = await supabase.rpc("is_trip_admin", { p_trip_id: tripId });
  if (!isAdmin) throw new Error("Only trip admins can do that.");
  return { s, supabase, t: trusted({ kind: "session_admin", tripId, userId: s.appUser.id }) };
}

async function requireMember(tripId: string) {
  const s = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data: isMember } = await supabase.rpc("is_trip_member", { p_trip_id: tripId });
  if (!isMember) throw new Error("You are not a member of this trip.");
  return { s, supabase, t: trusted({ kind: "session_user", userId: s.appUser.id }) };
}

function fail(e: unknown): ActionState {
  captureException(e);
  return { error: e instanceof Error ? e.message : "Something went wrong." };
}

/* ------------------------------------------------------------ create ---- */

export async function createTrip(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const s = await requireUser();
  const title = String(formData.get("title") ?? "").trim();
  const destination = String(formData.get("destination") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const nights = Number(formData.get("nights") ?? 3);
  const windowStart = String(formData.get("window_start") ?? "");
  const windowEnd = String(formData.get("window_end") ?? "");
  const quorumRaw = String(formData.get("quorum") ?? "").trim();
  const deadlineDays = Number(formData.get("deadline_days") ?? 7);
  const escalationMode = String(formData.get("escalation_mode") ?? "relay") as EscalationMode;
  const pushLevel = String(formData.get("push_level") ?? "standard") as PushLevel;

  if (title.length < 2) return { error: "Give the trip a title." };
  if (destination.length < 2) return { error: "Where are you going?" };
  if (!Number.isInteger(nights) || nights < 1 || nights > 30) return { error: "Nights must be between 1 and 30." };
  if (!windowStart || !windowEnd || windowEnd <= windowStart) return { error: "Pick a valid date window." };
  if (addDays(windowStart, nights) > windowEnd) return { error: "The window is shorter than the trip." };
  if (!["relay", "none", "managed"].includes(escalationMode)) return { error: "Invalid escalation mode." };
  if (!["gentle", "standard", "spicy"].includes(pushLevel)) return { error: "Invalid push level." };

  // Quorum: blank = "everyone", resolved when the trip is sent. Store 1 now and
  // let the members page show the effective value; `sendTrip` validates.
  const quorum = quorumRaw === "" ? 0 : Number(quorumRaw);
  if (quorumRaw !== "" && (!Number.isInteger(quorum) || quorum < 1)) return { error: "Quorum must be a whole number." };

  const supabase = await createSupabaseServerClient();
  const deadline = new Date(Date.now() + Math.max(1, deadlineDays) * 86_400_000).toISOString();
  const { data: trip, error } = await supabase
    .from("trips")
    .insert({
      title,
      destination,
      description,
      nights,
      window_start: windowStart,
      window_end: windowEnd,
      quorum: Math.max(1, quorum),
      response_deadline: deadline,
      escalation_mode: escalationMode,
      push_level: pushLevel,
      created_by: s.appUser.id,
    })
    .select("id")
    .single();
  if (error || !trip) return fail(error ?? new Error("insert failed"));

  const { error: memberErr } = await supabase.from("trip_members").insert({
    trip_id: trip.id,
    user_id: s.appUser.id,
    role: "admin",
    status: "active",
    invited_by: s.appUser.id,
    joined_at: new Date().toISOString(),
  });
  if (memberErr) return fail(memberErr);

  // The creator is in by definition.
  await supabase.from("approvals").upsert({ trip_id: trip.id, user_id: s.appUser.id, decision: "yes" });
  if (quorum === 0) {
    // "everyone" — remember the intent so the members page can keep it in sync
    await supabase.from("trip_activity").insert({ trip_id: trip.id, actor_user_id: s.appUser.id, kind: "quorum_everyone", payload: {} });
  }

  redirect(`/trips/${trip.id}/members`);
}

/* ------------------------------------------------------------ members ---- */

export async function inviteMember(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const tripId = String(formData.get("trip_id"));
  const name = String(formData.get("name") ?? "").trim();
  const phoneRaw = String(formData.get("phone") ?? "");
  const country = String(formData.get("country") ?? "IL");
  const essential = formData.get("essential") === "on";
  if (name.length < 2) return { error: "A display name is required — nudges have to say “Dani”, not a number." };
  const parsed = normalizePhone(phoneRaw, country);
  if (!parsed) return { error: "That phone number doesn't look right." };

  try {
    const { supabase } = await requireAdmin(tripId);
    const { error } = await supabase.rpc("invite_member", {
      p_trip_id: tripId,
      p_phone_e164: parsed.e164,
      p_display_name: name,
      p_is_essential: essential,
      p_role: "member",
    });
    if (error) return { error: error.message };
    await syncEveryoneQuorum(tripId);
    revalidatePath(`/trips/${tripId}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** If the admin chose "everyone" at creation, keep quorum = invitee count until sent. */
async function syncEveryoneQuorum(tripId: string) {
  const supabase = await createSupabaseServerClient();
  const [{ data: trip }, { data: flag }, { count }] = await Promise.all([
    supabase.from("trips").select("status").eq("id", tripId).maybeSingle(),
    supabase.from("trip_activity").select("id").eq("trip_id", tripId).eq("kind", "quorum_everyone").limit(1),
    supabase.from("trip_members").select("user_id", { count: "exact", head: true }).eq("trip_id", tripId).neq("status", "removed"),
  ]);
  if (trip?.status === "draft" && flag && flag.length > 0 && count) {
    await supabase.from("trips").update({ quorum: count }).eq("id", tripId);
  }
}

export async function updateMember(formData: FormData): Promise<void> {
  const tripId = String(formData.get("trip_id"));
  const userId = String(formData.get("user_id"));
  const op = String(formData.get("op"));
  const { supabase, s } = await requireAdmin(tripId);

  if (op === "promote") await supabase.from("trip_members").update({ role: "admin" }).eq("trip_id", tripId).eq("user_id", userId);
  else if (op === "demote" && userId !== s.appUser.id) await supabase.from("trip_members").update({ role: "member" }).eq("trip_id", tripId).eq("user_id", userId);
  else if (op === "essential") await supabase.from("trip_members").update({ is_essential: true }).eq("trip_id", tripId).eq("user_id", userId);
  else if (op === "unessential") await supabase.from("trip_members").update({ is_essential: false }).eq("trip_id", tripId).eq("user_id", userId);
  else if (op === "remove" && userId !== s.appUser.id) {
    await supabase.from("trip_members").update({ status: "removed" }).eq("trip_id", tripId).eq("user_id", userId);
    const t = trusted({ kind: "session_admin", tripId, userId: s.appUser.id });
    await cancelPending(t, { tripId, userId });
    await syncEveryoneQuorum(tripId);
  }
  revalidatePath(`/trips/${tripId}`);
}

export async function updateQuorum(formData: FormData): Promise<void> {
  const tripId = String(formData.get("trip_id"));
  const quorum = Number(formData.get("quorum"));
  const { supabase } = await requireAdmin(tripId);
  if (Number.isInteger(quorum) && quorum >= 1) {
    await supabase.from("trips").update({ quorum }).eq("id", tripId).eq("status", "draft");
    await supabase.from("trip_activity").delete().eq("trip_id", tripId).eq("kind", "quorum_everyone");
  }
  revalidatePath(`/trips/${tripId}`);
}

/* ------------------------------------------------------------- engine ---- */

export async function sendIt(formData: FormData): Promise<void> {
  const tripId = String(formData.get("trip_id"));
  const { t } = await requireAdmin(tripId);
  await engine.sendTrip(t, tripId);
  revalidatePath(`/trips/${tripId}`);
  redirect(`/trips/${tripId}`);
}

export async function lockDates(formData: FormData): Promise<void> {
  const tripId = String(formData.get("trip_id"));
  const optionId = String(formData.get("option_id"));
  const { t, s } = await requireAdmin(tripId);
  await engine.lockDates(t, tripId, optionId, s.appUser.id);
  revalidatePath(`/trips/${tripId}`);
  redirect(`/trips/${tripId}`);
}

export async function extendDeadline(formData: FormData): Promise<void> {
  const tripId = String(formData.get("trip_id"));
  const { t, s } = await requireAdmin(tripId);
  await engine.extendDeadline(t, tripId, 7, s.appUser.id);
  revalidatePath(`/trips/${tripId}`);
}

export async function proceedWithout(formData: FormData): Promise<void> {
  const tripId = String(formData.get("trip_id"));
  const { t, s } = await requireAdmin(tripId);
  await engine.proceedWithoutStragglers(t, tripId, s.appUser.id);
  revalidatePath(`/trips/${tripId}`);
}

export async function cancelTrip(formData: FormData): Promise<void> {
  const tripId = String(formData.get("trip_id"));
  const { t, s } = await requireAdmin(tripId);
  await engine.cancelTrip(t, tripId, s.appUser.id);
  revalidatePath(`/trips/${tripId}`);
  redirect(`/trips`);
}

export async function addDateOption(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const tripId = String(formData.get("trip_id"));
  const start = String(formData.get("start") ?? "");
  try {
    const { supabase } = await requireAdmin(tripId);
    const { data: trip } = await supabase.from("trips").select("nights, window_start, window_end").eq("id", tripId).single();
    if (!trip) return { error: "Trip not found." };
    const end = addDays(start, trip.nights);
    if (!inTripWindow(start, end, trip.window_start, trip.window_end)) return { error: "That window is outside the trip's date range." };
    const { error } = await supabase.from("date_options").insert({ trip_id: tripId, start_date: start, end_date: end, label: labelFor(start, end), generated_by: "admin" });
    if (error) return { error: error.code === "23505" ? "That window is already on the ballot." : error.message };
    revalidatePath(`/trips/${tripId}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function updateTripSettings(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const tripId = String(formData.get("trip_id"));
  const escalationMode = String(formData.get("escalation_mode") ?? "relay") as EscalationMode;
  const pushLevel = String(formData.get("push_level") ?? "standard") as PushLevel;
  const description = String(formData.get("description") ?? "").trim();
  if (!["relay", "none", "managed"].includes(escalationMode)) return { error: "Invalid escalation mode." };
  if (!["gentle", "standard", "spicy"].includes(pushLevel)) return { error: "Invalid push level." };
  try {
    const { supabase } = await requireAdmin(tripId);
    const { error } = await supabase.from("trips").update({ escalation_mode: escalationMode, push_level: pushLevel, description }).eq("id", tripId);
    if (error) return { error: error.message };
    revalidatePath(`/trips/${tripId}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/* -------------------------------------------------------------- relay ---- */

export async function relayMarkSent(formData: FormData): Promise<void> {
  const relayId = String(formData.get("relay_id"));
  const tripId = String(formData.get("trip_id"));
  const { t, s } = await requireAdmin(tripId);
  await markRelaySent(t, relayId, s.appUser.id);
  revalidatePath(`/trips/${tripId}`);
}

export async function relayDismiss(formData: FormData): Promise<void> {
  const relayId = String(formData.get("relay_id"));
  const tripId = String(formData.get("trip_id"));
  const { t, s } = await requireAdmin(tripId);
  await dismissRelay(t, relayId, s.appUser.id);
  revalidatePath(`/trips/${tripId}`);
}

/* ------------------------------------------- member actions from the web -- */

export async function approveWeb(formData: FormData): Promise<void> {
  const tripId = String(formData.get("trip_id"));
  const decision = String(formData.get("decision")) === "yes" ? "yes" : "no";
  const { t, s } = await requireMember(tripId);
  await engine.recordApproval(t, tripId, s.appUser.id, decision);
  revalidatePath(`/trips/${tripId}`);
}

export async function voteWeb(formData: FormData): Promise<void> {
  const tripId = String(formData.get("trip_id"));
  const optionId = String(formData.get("option_id"));
  const pref = String(formData.get("pref")) as Pref;
  if (!["yes", "maybe", "no"].includes(pref)) return;
  const { t, s } = await requireMember(tripId);
  await engine.recordVote(t, tripId, s.appUser.id, optionId, pref, { notify: false });
  revalidatePath(`/trips/${tripId}`);
}
