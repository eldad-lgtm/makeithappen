import "server-only";

import { getChannel } from "@/channels";
import { waShareLink } from "@/channels/deeplink";
import { decide, ladderFor, nextStepAt } from "@/core/nudge";
import { localHour } from "@/core/phone";
import { hasVotedAny, invitees } from "@/core/quorum";
import { nudgePhaseFor } from "@/core/state";
import type { NudgeRecord } from "@/core/types";
import { loadMemberPhones, type TripAggregate } from "@/db/queries";
import type { Trusted } from "@/db/token-scope/client";
import { env } from "@/lib/env";
import { adminDecisionButtons, message, render } from "@/messages/render";
import { nudgeTemplateKey } from "@/messages/templates";
import { defer, markDone, schedule } from "@/jobs/scheduler";
import { log } from "@/observability/log";
import { logMessage, sendToUser } from "./send";
import { mustLoad, recordActivity } from "./trip";
import { memberVars } from "./vars";

const HOUR = 3_600_000;
const RELAY_TTL_MS = 36 * HOUR;

/**
 * One `send_nudge` job = "look at this member now and do the right thing".
 * The policy (core/nudge) decides; this file carries out the decision and
 * schedules the next look.
 */
export async function runNudgeJob(t: Trusted, jobId: string, tripId: string, userId: string): Promise<void> {
  const agg = await mustLoad(t, tripId);
  const phase = nudgePhaseFor(agg.trip.status);
  if (!phase || agg.row.automation_paused_at) {
    await markDone(t, jobId);
    return;
  }
  const member = agg.members.find((m) => m.id === userId);
  if (!member) {
    await markDone(t, jobId);
    return;
  }

  const askedAt = phase === "approval" ? agg.trip.approvalAskedAt : agg.trip.datesAskedAt;
  if (!askedAt) {
    await markDone(t, jobId);
    return;
  }

  const now = Date.now();
  const optionIds = agg.options.map((o) => o.id);
  const hasResponded = phase === "approval" ? member.approval !== null : hasVotedAny(member, optionIds);

  const [history, globalHistory, tripGroup] = await Promise.all([
    t.db.from("nudges").select("*").eq("trip_id", tripId).eq("user_id", userId).eq("phase", phase).gte("sent_at", new Date(askedAt).toISOString()),
    t.db.from("nudges").select("*").eq("user_id", userId).gte("sent_at", new Date(now - 7 * 86_400_000).toISOString()),
    t.db.from("nudges").select("id", { count: "exact", head: true }).eq("trip_id", tripId).eq("target", "group").gte("sent_at", new Date(now - 48 * HOUR).toISOString()),
  ]);

  const toRec = (r: { id: string; user_id: string; trip_id: string; phase: "approval" | "dates"; level: number; target: "dm" | "group" | "admin"; sent_at: string }): NudgeRecord => ({
    id: r.id,
    memberId: r.user_id,
    tripId: r.trip_id,
    phase: r.phase,
    level: r.level,
    target: r.target,
    at: new Date(r.sent_at).getTime(),
  });

  const decision = decide({
    member,
    phase,
    mode: agg.trip.escalationMode,
    pushLevel: agg.trip.pushLevel,
    askedAt,
    now,
    history: (history.data ?? []).map(toRec),
    globalHistory: (globalHistory.data ?? []).map(toRec),
    hasResponded,
    localHour: localHour(now, member.timezone),
    tripGroupCallouts48h: tripGroup.count ?? 0,
  });

  if ("skip" in decision) {
    log.info("nudge skipped", { tripId, userId, jobId, reason: decision.skip });
    if (decision.retryInMs !== undefined && !hasResponded && !member.optedOut) {
      await defer(t, jobId, Math.max(60_000, decision.retryInMs));
    } else {
      await markDone(t, jobId);
    }
    return;
  }

  const { level, target, publicSuppressed } = decision.send;
  const vars = memberVars(agg, member, phase, now);
  const salt = (history.data?.length ?? 0) + hashSalt(userId);

  let delivered = false;

  if (target === "dm") {
    const key = nudgeTemplateKey(agg.trip.pushLevel, "dm", level);
    const phones = await loadMemberPhones(t.db, tripId);
    const u = phones.get(userId);
    if (!u) {
      await markDone(t, jobId);
      return;
    }
    const rendered = render(key, vars, { salt });
    const outcome = await sendToUser(t, {
      userId,
      phoneE164: u.phone_e164,
      tripId,
      kind: "nudge_dm",
      message: message(rendered, { tripId, userId, phase, kind: "nudge_dm" }),
    });
    if (!outcome.sent && "blocked" in outcome) {
      // Defer rather than drop: the ladder resumes intact (§6.8).
      await defer(t, jobId, outcome.blocked.retryInMs ?? 6 * HOUR);
      return;
    }
    delivered = outcome.sent;
    if (delivered) {
      await recordActivity(t, tripId, "nudge", { userId, level, target: "dm", publicSuppressed }, null);
    }
  } else if (target === "group") {
    delivered = await publicCallout(t, agg, member.id, level, vars, salt);
  } else {
    delivered = await adminEscalation(t, agg, vars, phase);
  }

  if (delivered) {
    await t.db.from("nudges").insert({ trip_id: tripId, user_id: userId, phase, level, target });
  }
  await markDone(t, jobId);

  // Schedule the next look at the next ladder step.
  const sentLevels = [...(history.data ?? []).map((h) => h.level), ...(delivered ? [level] : [])];
  const next = nextStepAt(agg.trip.pushLevel, askedAt, sentLevels);
  if (next !== null) {
    await schedule(t, { type: "send_nudge", runAt: new Date(Math.max(next, now + 60_000)), tripId, userId });
  }
}

/**
 * Levels 3–4. What "public" means depends on escalation_mode (§3.5, §7.3):
 *   relay   — compose, queue for an admin tap, DM the admin a prompt
 *   managed — post to the native group ourselves (Phase 2; needs wa_group_id)
 *   none    — never reaches here (policy converts to DM), but log if it does
 */
async function publicCallout(
  t: Trusted,
  agg: TripAggregate,
  userId: string,
  level: number,
  vars: ReturnType<typeof memberVars>,
  salt: number,
): Promise<boolean> {
  const key = nudgeTemplateKey(agg.trip.pushLevel, "group", level);
  const rendered = render(key, vars, { salt, footer: false });
  const tripId = agg.trip.id;

  if (agg.trip.escalationMode === "managed" && agg.row.wa_group_id) {
    const res = await getChannel().sendToGroup(agg.row.wa_group_id, message(rendered, { tripId, kind: "nudge_dm" }));
    await logMessage(t, {
      tripId,
      userId: null,
      channel: res.ok ? res.channel : "suppressed",
      templateKey: rendered.templateKey,
      body: rendered.body,
      providerSid: res.providerSid ?? null,
      status: res.ok ? "queued" : "failed",
      error: res.error ?? null,
      context: { group: agg.row.wa_group_id, level, about: userId },
    });
    if (res.ok) {
      await recordActivity(t, tripId, "callout", { level, mode: "managed", about: userId });
      return true;
    }
    log.warn("managed group send failed; falling back to relay", { tripId, error: res.error });
  }

  if (agg.trip.escalationMode === "none") {
    await logMessage(t, { tripId, userId: null, channel: "suppressed", templateKey: rendered.templateKey, body: rendered.body, status: "suppressed", context: { level, about: userId, mode: "none" } });
    return false;
  }

  // relay
  const adminIds = agg.members.filter((m) => m.role === "admin" && m.status !== "removed").map((m) => m.id);
  const expiresAt = new Date(Date.now() + RELAY_TTL_MS).toISOString();
  const { data: nudgeRow } = await t.db
    .from("nudges")
    .insert({ trip_id: tripId, user_id: userId, phase: nudgePhaseFor(agg.trip.status)!, level, target: "group" })
    .select("id")
    .single();

  for (const adminId of adminIds) {
    await t.db.from("relay_queue").insert({
      trip_id: tripId,
      admin_user_id: adminId,
      nudge_id: nudgeRow?.id ?? null,
      level,
      rendered_body: rendered.body,
      expires_at: expiresAt,
    });
  }
  await logMessage(t, {
    tripId,
    userId: null,
    channel: "relay",
    templateKey: rendered.templateKey,
    body: rendered.body,
    status: "queued_for_admin",
    context: { level, about: userId, admins: adminIds, shareUrl: waShareLink(rendered.body) },
  });
  await recordActivity(t, tripId, "callout_queued", { level, mode: "relay", about: userId });

  const phones = await loadMemberPhones(t.db, tripId);
  const link = `${env.APP_URL}/trips/${tripId}#relay`;
  for (const adminId of adminIds) {
    const u = phones.get(adminId);
    if (!u) continue;
    const prompt = render("relay.prompt", { ...vars, link }, { footer: false });
    await sendToUser(t, {
      userId: adminId,
      phoneE164: u.phone_e164,
      tripId,
      kind: "admin",
      message: message(prompt, { tripId, userId: adminId, kind: "admin" }),
    });
  }
  await schedule(t, { type: "expire_relay", runAt: new Date(expiresAt), tripId });
  await offerSwitchIfIgnored(t, agg, adminIds);
  // Already inserted the nudges row above.
  return false;
}

/** Level 5: "Proceed without them, or extend?" to each admin. */
async function adminEscalation(t: Trusted, agg: TripAggregate, vars: ReturnType<typeof memberVars>, phase: "approval" | "dates"): Promise<boolean> {
  const tripId = agg.trip.id;
  const link = `${env.APP_URL}/trips/${tripId}`;
  const phones = await loadMemberPhones(t.db, tripId);
  let any = false;
  for (const admin of agg.members.filter((m) => m.role === "admin" && m.status !== "removed")) {
    const u = phones.get(admin.id);
    if (!u) continue;
    const rendered = render("nudge.admin.5", { ...vars, link }, { footer: false });
    const out = await sendToUser(t, {
      userId: admin.id,
      phoneE164: u.phone_e164,
      tripId,
      kind: "admin",
      message: message(rendered, { tripId, userId: admin.id, phase, kind: "admin" }, { buttons: adminDecisionButtons(tripId) }),
    });
    any = any || out.sent;
  }
  if (any) await recordActivity(t, tripId, "admin_escalation", { ghosts: vars.ghosts });
  return any;
}

/** An admin who ignores three consecutive relay prompts is offered `none` rather than nagged about nagging (§6.7). */
async function offerSwitchIfIgnored(t: Trusted, agg: TripAggregate, adminIds: string[]) {
  const tripId = agg.trip.id;
  const { data: recent } = await t.db
    .from("relay_queue")
    .select("sent_at, dismissed_at, expires_at")
    .eq("trip_id", tripId)
    .order("created_at", { ascending: false })
    .limit(3 * Math.max(1, adminIds.length));
  const ignored = (recent ?? []).filter((r) => !r.sent_at && (r.dismissed_at || new Date(r.expires_at).getTime() < Date.now()));
  if (ignored.length < 3) return;
  const { data: already } = await t.db.from("trip_activity").select("id").eq("trip_id", tripId).eq("kind", "relay_switch_offered").limit(1);
  if (already && already.length > 0) return;

  const phones = await loadMemberPhones(t.db, tripId);
  const link = `${env.APP_URL}/trips/${tripId}/settings`;
  for (const adminId of adminIds) {
    const u = phones.get(adminId);
    if (!u) continue;
    const rendered = render("relay.switch_offer", { tripTitle: agg.trip.title, link }, { footer: false });
    await sendToUser(t, { userId: adminId, phoneE164: u.phone_e164, tripId, kind: "admin", message: message(rendered, { tripId, userId: adminId, kind: "admin" }) });
  }
  await recordActivity(t, tripId, "relay_switch_offered", {});
}

/** Drop stale callouts: sending stale peer pressure is worse than sending none (§7.3). */
export async function expireRelay(t: Trusted, tripId: string): Promise<void> {
  const { data } = await t.db
    .from("relay_queue")
    .update({ dismissed_at: new Date().toISOString() })
    .eq("trip_id", tripId)
    .is("sent_at", null)
    .is("dismissed_at", null)
    .lt("expires_at", new Date().toISOString())
    .select("id");
  if (data && data.length > 0) {
    log.info("relay callouts expired", { tripId, count: data.length });
    await recordActivity(t, tripId, "callout_expired", { count: data.length });
  }
}

/** Admin tapped send. */
export async function markRelaySent(t: Trusted, relayId: string, adminUserId: string): Promise<void> {
  const { data } = await t.db
    .from("relay_queue")
    .update({ sent_at: new Date().toISOString() })
    .eq("id", relayId)
    .eq("admin_user_id", adminUserId)
    .is("sent_at", null)
    .select("trip_id, level")
    .maybeSingle();
  if (data) await recordActivity(t, data.trip_id, "callout_sent", { level: data.level }, adminUserId);
}

export async function dismissRelay(t: Trusted, relayId: string, adminUserId: string): Promise<void> {
  await t.db.from("relay_queue").update({ dismissed_at: new Date().toISOString() }).eq("id", relayId).eq("admin_user_id", adminUserId).is("sent_at", null);
}

/** For the dashboard: how many invitees/active still owe an answer. */
export function pendingCount(agg: TripAggregate): number {
  const phase = nudgePhaseFor(agg.trip.status);
  if (phase === "approval") return invitees(agg.members).filter((m) => m.approval === null).length;
  if (phase === "dates") return agg.members.filter((m) => m.approval === "yes" && !hasVotedAny(m, agg.options.map((o) => o.id))).length;
  return 0;
}

function hashSalt(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export { ladderFor };
