import "server-only";

import { generateOptions, rankOptions, shouldAutoLock } from "@/core/dates";
import { activeMembers, hasVotedAll, invitees, pendingFor, quorumState } from "@/core/quorum";
import { assertTransition, nudgePhaseFor } from "@/core/state";
import type { ApprovalDecision, Pref, TripStatus } from "@/core/types";
import { ladderFor } from "@/core/nudge";
import { deriveVotesFromBlackouts } from "@/core/dates";
import { loadMemberPhones, loadTrip, type TripAggregate } from "@/db/queries";
import { revokeTokensForPhase, tokenUrlFor, type Trusted } from "@/db/token-scope/client";
import { env } from "@/lib/env";
import {
  adminDecisionButtons,
  approvalButtons,
  dateChoices,
  message,
  render,
} from "@/messages/render";
import { cancelPending, schedule } from "@/jobs/scheduler";
import { log } from "@/observability/log";
import { lastInboundAt, sendToUser } from "./send";
import { decisionVars, memberVars, tripVars } from "./vars";

const DAY = 86_400_000;
const HOUR = 3_600_000;

/* --------------------------------------------------------------- shared --- */

export async function mustLoad(t: Trusted, tripId: string): Promise<TripAggregate> {
  const agg = await loadTrip(t.db, tripId, "service");
  if (!agg) throw new Error(`trip ${tripId} not found`);
  return agg;
}

export async function recordActivity(
  t: Trusted,
  tripId: string,
  kind: string,
  payload: Record<string, unknown> = {},
  actorUserId: string | null = null,
): Promise<void> {
  await t.db.from("trip_activity").insert({
    trip_id: tripId,
    actor_user_id: actorUserId,
    kind,
    payload: { ...payload, principal: t.principal.kind } as never,
  });
}

export async function transition(
  t: Trusted,
  agg: TripAggregate,
  to: TripStatus,
  extra: Record<string, unknown> = {},
  actorUserId: string | null = null,
): Promise<void> {
  assertTransition(agg.trip.status, to);
  const { error } = await t.db
    .from("trips")
    .update({ status: to, ...extra })
    .eq("id", agg.trip.id)
    .eq("status", agg.trip.status); // optimistic: someone else may have moved it
  if (error) throw new Error(`transition: ${error.message}`);
  await recordActivity(t, agg.trip.id, "transition", { from: agg.trip.status, to }, actorUserId);
  log.info("trip transition", { tripId: agg.trip.id, from: agg.trip.status, to, principal: t.principal.kind });
  agg.trip.status = to;
}

function actorOf(t: Trusted): string | null {
  return "userId" in t.principal ? t.principal.userId : null;
}

async function dashboardUrl(tripId: string): Promise<string> {
  return `${env.APP_URL}/trips/${tripId}`;
}

async function dm(
  t: Trusted,
  agg: TripAggregate,
  userId: string,
  templateKey: string,
  vars: Parameters<typeof render>[1],
  kind: "ask" | "confirmation" | "admin" | "nudge_dm",
  extras: Parameters<typeof message>[2] = {},
  salt = 0,
) {
  const phones = await loadMemberPhones(t.db, agg.trip.id);
  const u = phones.get(userId);
  if (!u) return { sent: false as const, failed: "no phone" };
  if (u.messaging_opted_out_at) return { sent: false as const, failed: "opted out" };
  const rendered = render(templateKey, vars, { salt });
  return sendToUser(t, {
    userId,
    phoneE164: u.phone_e164,
    tripId: agg.trip.id,
    kind,
    message: message(rendered, { tripId: agg.trip.id, userId, kind }, extras),
    lastInboundAt: await lastInboundAt(t, userId),
  });
}

async function admins(agg: TripAggregate): Promise<string[]> {
  return agg.members.filter((m) => m.role === "admin" && m.status !== "removed").map((m) => m.id);
}

/* ------------------------------------------------------------- send it --- */

/** Draft → approval. From here the engine drives (§3.1 step 4). */
export async function sendTrip(t: Trusted, tripId: string): Promise<void> {
  const agg = await mustLoad(t, tripId);
  const inv = invitees(agg.members);
  if (inv.length === 0) throw new Error("invite at least one person first");
  if (agg.trip.quorum > inv.length) throw new Error("quorum cannot exceed the number of people invited");

  const now = new Date();
  const deadline = agg.trip.responseDeadline ? new Date(agg.trip.responseDeadline) : new Date(now.getTime() + 7 * DAY);

  await transition(t, agg, "approval", {
    approval_asked_at: now.toISOString(),
    response_deadline: deadline.toISOString(),
  }, actorOf(t));

  for (const m of inv) {
    await schedule(t, { type: "send_approval_ask", runAt: now, tripId, userId: m.id });
  }
  await scheduleNudgeLadder(t, agg, inv.map((m) => m.id), now.getTime());

  if (deadline.getTime() - now.getTime() > DAY) {
    await schedule(t, { type: "deadline_warning", runAt: new Date(deadline.getTime() - DAY), tripId });
  }
  await schedule(t, { type: "check_approval_deadline", runAt: deadline, tripId });

  for (const adminId of await admins(agg)) {
    await dm(t, agg, adminId, "admin.trip_sent", { ...tripVars(agg), link: await dashboardUrl(tripId) }, "admin");
  }
}

async function scheduleNudgeLadder(t: Trusted, agg: TripAggregate, userIds: string[], askedAtMs: number) {
  const first = ladderFor(agg.trip.pushLevel)[0];
  const runAt = new Date(askedAtMs + first.afterHours * HOUR);
  for (const userId of userIds) {
    await schedule(t, { type: "send_nudge", runAt, tripId: agg.trip.id, userId });
  }
}

/* ---------------------------------------------------------- approval ask --- */

export async function sendApprovalAsk(t: Trusted, tripId: string, userId: string): Promise<void> {
  const agg = await mustLoad(t, tripId);
  if (agg.trip.status !== "approval") return; // moved on; nothing to ask
  const m = agg.members.find((x) => x.id === userId);
  if (!m || m.approval !== null || m.status === "removed") return;
  await dm(t, agg, userId, "approval.ask", tripVars(agg), "ask", { buttons: approvalButtons(tripId) });
}

export async function sendApprovalMore(t: Trusted, tripId: string, userId: string): Promise<void> {
  const agg = await mustLoad(t, tripId);
  const link = await tokenUrlFor(t, {
    tripId,
    userId,
    scope: "approve",
    responseDeadline: agg.row.response_deadline,
    appUrl: env.APP_URL,
  });
  await dm(t, agg, userId, "approval.more", { ...tripVars(agg), link }, "confirmation", {
    buttons: approvalButtons(tripId),
  });
}

/* ------------------------------------------------------------ approvals --- */

export async function recordApproval(
  t: Trusted,
  tripId: string,
  userId: string,
  decision: ApprovalDecision,
  note: string | null = null,
): Promise<{ accepted: boolean; reason?: string }> {
  const agg = await mustLoad(t, tripId);
  const m = agg.members.find((x) => x.id === userId);
  if (!m || m.status === "removed") return { accepted: false, reason: "not a member" };

  const open: TripStatus[] = ["approval", "approved", "date_collection", "date_proposed"];
  if (!open.includes(agg.trip.status)) return { accepted: false, reason: `trip is ${agg.trip.status}` };

  const isLate = agg.trip.status !== "approval" && m.approval === null;
  const changed = m.approval !== null && m.approval !== decision;

  await t.db.from("approvals").upsert({ trip_id: tripId, user_id: userId, decision, note, decided_at: new Date().toISOString() });
  await t.db
    .from("trip_members")
    .update({ status: decision === "yes" ? "active" : "declined", joined_at: decision === "yes" ? new Date().toISOString() : null })
    .eq("trip_id", tripId)
    .eq("user_id", userId);

  // Cancellation on response — same breath (§7.4).
  await cancelPending(t, { tripId, userId, types: ["send_nudge", "send_approval_ask"] });
  await t.db.from("nudges").update({ responded_at: new Date().toISOString() }).eq("trip_id", tripId).eq("user_id", userId).eq("phase", "approval").is("responded_at", null);
  await recordActivity(t, tripId, "approval", { decision, late: isLate, changed }, userId);

  const fresh = await mustLoad(t, tripId);
  if (decision === "yes") {
    await dm(t, fresh, userId, isLate ? "approval.late_arrival" : "approval.received_yes", memberVars(fresh, m, "approval"), "confirmation", {}, hashSalt(userId));
  } else {
    await dm(t, fresh, userId, "approval.received_no", memberVars(fresh, m, "approval"), "confirmation");
  }

  await evaluateApproval(t, tripId);

  // Late yes while dates are being collected: ask them for dates too.
  const after = await mustLoad(t, tripId);
  if (decision === "yes" && isLate && after.trip.status === "date_collection") {
    await schedule(t, { type: "send_dates_ask", runAt: new Date(), tripId, userId });
    await scheduleNudgeLadder(t, after, [userId], Date.now());
  }
  return { accepted: true };
}

/** Advance early, fail early (§4.1). */
export async function evaluateApproval(t: Trusted, tripId: string): Promise<void> {
  const agg = await mustLoad(t, tripId);
  const q = quorumState(agg.members, agg.trip.quorum);

  if (agg.trip.status === "approval") {
    if (q === "reached") {
      await transition(t, agg, "approved");
      await announceQuorum(t, agg);
      await startDateCollection(t, tripId);
    } else if (q === "unreachable") {
      await transition(t, agg, "rejected");
      await cancelPending(t, { tripId });
      await revokeTokensForPhase(t, tripId, "approve");
      for (const m of invitees(agg.members).filter((x) => x.approval !== "no")) {
        await dm(t, agg, m.id, "approval.rejected", tripVars(agg), "confirmation");
      }
    }
    return;
  }

  // A yes → no after quorum was reached re-evaluates and can send it back (§4.1).
  if ((agg.trip.status === "approved" || agg.trip.status === "date_collection") && q !== "reached") {
    await transition(t, agg, "approval");
    await cancelPending(t, { tripId, types: ["send_dates_ask", "close_date_collection"] });
    log.warn("quorum lost after approval; back to approval", { tripId });
  }
}

async function announceQuorum(t: Trusted, agg: TripAggregate) {
  for (const m of activeMembers(agg.members)) {
    await dm(t, agg, m.id, "approval.quorum_reached", tripVars(agg), "confirmation");
  }
}

/* ------------------------------------------------------- date collection --- */

export async function startDateCollection(t: Trusted, tripId: string): Promise<void> {
  const agg = await mustLoad(t, tripId);
  if (agg.trip.status !== "approved") return;

  if (agg.options.length === 0) {
    const opts = generateOptions(agg.trip.windowStart, agg.trip.windowEnd, agg.trip.nights, 3);
    if (opts.length > 0) {
      await t.db.from("date_options").insert(
        opts.map((o) => ({ trip_id: tripId, start_date: o.start, end_date: o.end, label: o.label, generated_by: "system" as const })),
      );
    }
  }

  const now = new Date();
  await transition(t, agg, "date_collection", { dates_asked_at: now.toISOString() });
  // Approve tokens outlive their phase only for late arrivals via buttons; web tokens are revoked.
  await revokeTokensForPhase(t, tripId, "approve");

  const active = activeMembers(agg.members);
  for (const m of active) {
    await schedule(t, { type: "send_dates_ask", runAt: now, tripId, userId: m.id });
  }
  await scheduleNudgeLadder(t, agg, active.map((m) => m.id), now.getTime());

  const close = new Date(now.getTime() + 7 * DAY);
  await schedule(t, { type: "close_date_collection", runAt: close, tripId });
}

export async function sendDatesAsk(t: Trusted, tripId: string, userId: string): Promise<void> {
  const agg = await mustLoad(t, tripId);
  if (agg.trip.status !== "date_collection") return;
  const m = agg.members.find((x) => x.id === userId);
  if (!m || m.approval !== "yes") return;
  if (hasVotedAll(m, agg.options.map((o) => o.id))) return;

  const link = await tokenUrlFor(t, {
    tripId,
    userId,
    scope: "availability",
    responseDeadline: agg.row.response_deadline,
    appUrl: env.APP_URL,
  });
  await dm(t, agg, userId, "dates.ask", { ...tripVars(agg), link }, "ask", dateChoices(tripId, agg.options));
}

export async function recordVote(
  t: Trusted,
  tripId: string,
  userId: string,
  optionId: string,
  pref: Pref,
  opts: { notify?: boolean } = { notify: true },
): Promise<{ accepted: boolean; reason?: string }> {
  const agg = await mustLoad(t, tripId);
  const m = agg.members.find((x) => x.id === userId);
  if (!m || m.approval !== "yes") return { accepted: false, reason: "not an active member" };
  if (!["date_collection", "date_proposed"].includes(agg.trip.status)) return { accepted: false, reason: `trip is ${agg.trip.status}` };
  const option = agg.options.find((o) => o.id === optionId);
  if (!option) return { accepted: false, reason: "unknown option" };

  await t.db.from("date_votes").upsert({ date_option_id: optionId, user_id: userId, preference: pref, updated_at: new Date().toISOString() });
  await respondedToDates(t, tripId, userId);
  await recordActivity(t, tripId, "vote", { optionId, pref, label: option.label }, userId);

  if (opts.notify) {
    const fresh = await mustLoad(t, tripId);
    const fm = fresh.members.find((x) => x.id === userId)!;
    const ids = fresh.options.map((o) => o.id);
    if (hasVotedAll(fm, ids)) {
      await dm(t, fresh, userId, "dates.votes_complete", tripVars(fresh), "confirmation");
    } else {
      const link = await tokenUrlFor(t, { tripId, userId, scope: "availability", responseDeadline: fresh.row.response_deadline, appUrl: env.APP_URL });
      const remaining = fresh.options.filter((o) => fm.votes[o.id] === undefined);
      await dm(
        t,
        fresh,
        userId,
        pref === "no" ? "dates.vote_no_received" : "dates.vote_received",
        { ...tripVars(fresh), topOption: option.label, link },
        "confirmation",
        dateChoices(tripId, remaining),
      );
    }
  }

  await evaluateDates(t, tripId);
  return { accepted: true };
}

/** Web calendar: replace this user's blackouts, derive `no` votes for overlapping options. */
export async function recordBlackouts(
  t: Trusted,
  tripId: string,
  userId: string,
  ranges: { start: string; end: string }[],
  explicit: { optionId: string; pref: Pref }[] = [],
): Promise<void> {
  const agg = await mustLoad(t, tripId);
  const m = agg.members.find((x) => x.id === userId);
  if (!m || m.approval !== "yes") throw new Error("not an active member");

  await t.db.from("blackout_dates").delete().eq("trip_id", tripId).eq("user_id", userId);
  if (ranges.length > 0) {
    await t.db.from("blackout_dates").insert(ranges.map((r) => ({ trip_id: tripId, user_id: userId, start_date: r.start, end_date: r.end })));
  }

  const derived = deriveVotesFromBlackouts(agg.options, ranges.map((r) => ({ userId, ...r })));
  const explicitIds = new Set(explicit.map((e) => e.optionId));
  const rows = [
    ...explicit.map((e) => ({ date_option_id: e.optionId, user_id: userId, preference: e.pref })),
    ...derived.filter((d) => !explicitIds.has(d.optionId)).map((d) => ({ date_option_id: d.optionId, user_id: userId, preference: d.preference })),
  ];
  // Options not blacked out and not explicitly voted default to "yes" from a calendar submission.
  for (const o of agg.options) {
    if (!rows.some((r) => r.date_option_id === o.id)) rows.push({ date_option_id: o.id, user_id: userId, preference: "yes" });
  }
  if (rows.length > 0) await t.db.from("date_votes").upsert(rows.map((r) => ({ ...r, updated_at: new Date().toISOString() })));

  await respondedToDates(t, tripId, userId);
  await recordActivity(t, tripId, "calendar", { blackouts: ranges.length }, userId);
  await evaluateDates(t, tripId);
}

async function respondedToDates(t: Trusted, tripId: string, userId: string) {
  await cancelPending(t, { tripId, userId, types: ["send_nudge", "send_dates_ask"] });
  await t.db.from("nudges").update({ responded_at: new Date().toISOString() }).eq("trip_id", tripId).eq("user_id", userId).eq("phase", "dates").is("responded_at", null);
}

/** Propose when everyone has answered (or when forced by the deadline/admin). Auto-lock when unanimous (§6.6). */
export async function evaluateDates(t: Trusted, tripId: string, force = false): Promise<void> {
  const agg = await mustLoad(t, tripId);
  if (agg.trip.status !== "date_collection") return;

  const active = activeMembers(agg.members);
  const ids = agg.options.map((o) => o.id);
  const pending = pendingFor(agg.members, "dates", ids);
  const responded = active.filter((m) => !pending.some((p) => p.id === m.id));
  if (!force && pending.length > 0) return;
  if (responded.length === 0) return; // nothing to rank yet

  const ranked = rankOptions(agg.options, active, agg.trip.quorum);
  if (pending.length === 0 && shouldAutoLock(ranked, active.length)) {
    await lockDates(t, tripId, ranked[0].option.id, null, true);
    return;
  }

  await transition(t, agg, "date_proposed");
  await cancelPending(t, { tripId, types: ["close_date_collection"] });
  const link = await dashboardUrl(tripId);
  for (const adminId of await admins(agg)) {
    const a = agg.members.find((m) => m.id === adminId)!;
    await dm(t, agg, adminId, "dates.proposed_admin", { ...decisionVars(agg), name: a.name.split(" ")[0], link }, "admin");
  }
}

export async function lockDates(
  t: Trusted,
  tripId: string,
  optionId: string,
  actorUserId: string | null,
  auto = false,
): Promise<void> {
  const agg = await mustLoad(t, tripId);
  const option = agg.options.find((o) => o.id === optionId);
  if (!option) throw new Error("unknown option");

  await transition(t, agg, "date_locked", {
    locked_option_id: optionId,
    locked_start_date: option.start,
    locked_end_date: option.end,
  }, actorUserId);
  await cancelPending(t, { tripId });
  await revokeTokensForPhase(t, tripId, "availability");
  await recordActivity(t, tripId, "locked", { optionId, label: option.label, auto }, actorUserId);

  const fresh = await mustLoad(t, tripId);
  const vars = { ...decisionVars(fresh), topOption: option.label };
  const ranked = rankOptions(fresh.options, activeMembers(fresh.members), fresh.trip.quorum);
  const chosen = ranked.find((r) => r.option.id === optionId);
  if (chosen) {
    vars.topCount = chosen.couldAttend;
    vars.cannot = chosen.cannotAttend.length ? `${chosen.cannotAttend.join(", ")} can't make it.` : "Everyone can make it.";
  }
  for (const m of activeMembers(fresh.members)) {
    await dm(t, fresh, m.id, auto ? "dates.auto_locked" : "dates.locked", vars, "confirmation");
  }
  // Retention (§9): purge 12 months after completion.
  await schedule(t, { type: "expire_trip", runAt: new Date(Date.now() + 365 * DAY), tripId });
}

/* ---------------------------------------------------------------- admin --- */

export async function extendDeadline(t: Trusted, tripId: string, days = 7, actorUserId: string | null = null): Promise<void> {
  const agg = await mustLoad(t, tripId);
  const phase = nudgePhaseFor(agg.trip.status);
  if (!phase) throw new Error(`cannot extend a trip that is ${agg.trip.status}`);

  const now = Date.now();
  const base = Math.max(now, agg.trip.responseDeadline ?? now);
  const deadline = new Date(base + days * DAY);

  // Restart the clock the ladder runs against so escalation re-arms (§6.7).
  const clock = phase === "approval" ? { approval_asked_at: new Date(now).toISOString() } : { dates_asked_at: new Date(now).toISOString() };
  await t.db.from("trips").update({ response_deadline: deadline.toISOString(), ...clock }).eq("id", tripId);
  await recordActivity(t, tripId, "deadline_extended", { days, deadline: deadline.toISOString() }, actorUserId);

  await cancelPending(t, { tripId, types: ["deadline_warning", "check_approval_deadline", "close_date_collection", "send_nudge"] });
  const ids = agg.options.map((o) => o.id);
  const pending = pendingFor(agg.members, phase, ids);
  await scheduleNudgeLadder(t, agg, pending.map((m) => m.id), now);

  if (phase === "approval") {
    await schedule(t, { type: "deadline_warning", runAt: new Date(deadline.getTime() - DAY), tripId });
    await schedule(t, { type: "check_approval_deadline", runAt: deadline, tripId });
  } else {
    await schedule(t, { type: "close_date_collection", runAt: deadline, tripId });
  }
}

export async function cancelTrip(t: Trusted, tripId: string, actorUserId: string | null): Promise<void> {
  const agg = await mustLoad(t, tripId);
  if (agg.trip.status === "cancelled" || agg.trip.status === "rejected") return;
  const wasLive = agg.trip.status !== "draft";
  await transition(t, agg, "cancelled", {}, actorUserId);
  await cancelPending(t, { tripId });
  await revokeTokensForPhase(t, tripId, "approve");
  await revokeTokensForPhase(t, tripId, "availability");
  if (wasLive) {
    for (const m of invitees(agg.members).filter((x) => x.approval !== "no")) {
      await dm(t, agg, m.id, "approval.cancelled", tripVars(agg), "confirmation");
    }
  }
}

/** Admin "proceed without them": close the current phase with what's in. */
export async function proceedWithoutStragglers(t: Trusted, tripId: string, actorUserId: string | null): Promise<void> {
  const agg = await mustLoad(t, tripId);
  if (agg.trip.status === "date_collection") {
    await recordActivity(t, tripId, "proceed_without", {}, actorUserId);
    await cancelPending(t, { tripId, types: ["send_nudge"] });
    await evaluateDates(t, tripId, true);
  } else if (agg.trip.status === "approval") {
    // Can't manufacture quorum. Stop nudging and let the deadline decide.
    await cancelPending(t, { tripId, types: ["send_nudge"] });
    await recordActivity(t, tripId, "nudges_stopped", {}, actorUserId);
  }
}

/* ------------------------------------------------------------ job hooks --- */

export async function checkApprovalDeadline(t: Trusted, tripId: string): Promise<void> {
  const agg = await mustLoad(t, tripId);
  if (agg.trip.status !== "approval") return;
  if (agg.trip.responseDeadline && agg.trip.responseDeadline > Date.now() + 60_000) return; // extended since
  await transition(t, agg, "cancelled");
  await cancelPending(t, { tripId });
  await revokeTokensForPhase(t, tripId, "approve");
  for (const m of invitees(agg.members).filter((x) => x.approval !== "no")) {
    await dm(t, agg, m.id, "approval.cancelled", tripVars(agg), "confirmation");
  }
}

export async function sendDeadlineWarning(t: Trusted, tripId: string): Promise<void> {
  const agg = await mustLoad(t, tripId);
  if (agg.trip.status !== "approval") return;
  const link = await dashboardUrl(tripId);
  for (const adminId of await admins(agg)) {
    await dm(t, agg, adminId, "admin.deadline_warning", { ...tripVars(agg), link }, "admin", { buttons: adminDecisionButtons(tripId) });
  }
}

export async function closeDateCollection(t: Trusted, tripId: string): Promise<void> {
  await evaluateDates(t, tripId, true);
}

export async function expireTrip(t: Trusted, tripId: string): Promise<void> {
  const { data } = await t.db.from("trips").select("status, updated_at").eq("id", tripId).maybeSingle();
  if (!data) return;
  const terminal = ["date_locked", "cancelled", "rejected", "committed"].includes(data.status);
  if (!terminal) return;
  if (Date.now() - new Date(data.updated_at).getTime() < 365 * DAY) return;
  await t.db.from("trips").delete().eq("id", tripId); // cascades
  log.info("trip purged (retention)", { tripId });
}

function hashSalt(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
