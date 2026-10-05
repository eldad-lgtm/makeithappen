"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { trusted } from "@/db/token-scope/client";
import { cancelPending } from "@/jobs/scheduler";
import { requireUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { TIMEZONES } from "@/lib/timezones";
import { log } from "@/observability/log";

export async function updateProfile(formData: FormData): Promise<void> {
  const s = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  const timezone = String(formData.get("timezone") ?? "UTC");
  if (name.length < 2 || !TIMEZONES.includes(timezone)) return;
  const supabase = await createSupabaseServerClient();
  await supabase.from("users").update({ display_name: name, name_source: "self", timezone }).eq("id", s.appUser.id);
  revalidatePath("/settings");
}

/** Opt-out is absolute: number-level, across all trips (§9). */
export async function setOptOut(formData: FormData): Promise<void> {
  const s = await requireUser();
  const optOut = String(formData.get("opt_out")) === "1";
  const supabase = await createSupabaseServerClient();
  await supabase.from("users").update({ messaging_opted_out_at: optOut ? new Date().toISOString() : null }).eq("id", s.appUser.id);
  if (optOut) {
    const t = trusted({ kind: "session_user", userId: s.appUser.id });
    const { data: trips } = await t.db.from("trip_members").select("trip_id").eq("user_id", s.appUser.id);
    for (const row of trips ?? []) await cancelPending(t, { tripId: row.trip_id, userId: s.appUser.id });
    log.warn("OPT-OUT (web)", { userId: s.appUser.id });
  }
  revalidatePath("/settings");
}

/** GDPR deletion with full cascade (§9). Provisional data is theirs too. */
export async function deleteAccount(): Promise<void> {
  const s = await requireUser();
  const t = trusted({ kind: "session_user", userId: s.appUser.id });
  // Cascades: trip_members, approvals, date_votes, blackouts, nudges, tokens.
  await t.db.from("users").delete().eq("id", s.appUser.id);
  await t.db.auth.admin.deleteUser(s.authUserId).catch(() => undefined);
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  log.warn("account deleted", { userId: s.appUser.id });
  redirect("/");
}
