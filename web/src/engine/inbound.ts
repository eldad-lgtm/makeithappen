import "server-only";

import type { Trusted } from "@/db/token-scope/client";
import { env } from "@/lib/env";
import { parseIntent, type Intent } from "@/messages/inbound";
import { message, render } from "@/messages/render";
import { cancelPending } from "@/jobs/scheduler";
import { log } from "@/observability/log";
import { logMessage, sendToUser } from "./send";
import {
  closeDateCollection,
  extendDeadline,
  mustLoad,
  recordApproval,
  recordVote,
  sendApprovalMore,
} from "./trip";
import { tokenUrlFor } from "@/db/token-scope/client";
import { tripVars } from "./vars";

export interface InboundParams {
  fromE164: string;
  body: string | null;
  buttonPayload: string | null;
  providerSid: string | null;
  channel: "whatsapp" | "sms";
}

/**
 * One inbound message from a person. Finds who they are, logs it (idempotent
 * on provider_sid), works out which trip they mean, and acts.
 */
export async function handleInbound(t: Trusted, p: InboundParams): Promise<void> {
  const { data: user } = await t.db.from("users").select("*").eq("phone_e164", p.fromE164).maybeSingle();
  if (!user) {
    log.info("inbound from unknown number; ignored", { channel: p.channel });
    return;
  }

  const logId = await logMessage(t, {
    tripId: null,
    userId: user.id,
    direction: "inbound",
    channel: p.channel,
    body: p.buttonPayload ?? p.body ?? "",
    providerSid: p.providerSid,
    status: "received",
    context: { payload: p.buttonPayload },
  });
  if (logId === "duplicate") {
    log.info("duplicate inbound (provider retry); ignored", { userId: user.id });
    return;
  }

  let intent = parseIntent(p.buttonPayload, p.body);

  // Context: the most recent outbound to this person tells us which trip and
  // which numbered choices they were looking at.
  const { data: lastOut } = await t.db
    .from("message_log")
    .select("trip_id, context")
    .eq("user_id", user.id)
    .eq("direction", "outbound")
    .in("channel", ["whatsapp", "sms", "console", "deeplink"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const ctx = (lastOut?.context ?? {}) as { choices?: string[] };
  const contextTripId = lastOut?.trip_id ?? null;

  if (intent.kind === "index") {
    const payload = ctx.choices?.[intent.index];
    if (payload) {
      const mapped = parseIntent(payload, null);
      if (mapped.kind === "vote" && intent.pref !== "yes") mapped.pref = intent.pref;
      intent = mapped;
    } else {
      intent = { kind: "unknown", text: String(intent.index + 1) };
    }
  }

  await t.db.from("message_log").update({ trip_id: tripIdOf(intent) ?? contextTripId }).eq("id", logId);

  await dispatch(t, user.id, user.phone_e164, intent, contextTripId);
}

function tripIdOf(i: Intent): string | null {
  return "tripId" in i && i.tripId ? i.tripId : null;
}

async function dispatch(t: Trusted, userId: string, phone: string, intent: Intent, contextTripId: string | null) {
  const tripId = tripIdOf(intent) ?? contextTripId;

  switch (intent.kind) {
    case "stop": {
      await t.db.from("users").update({ messaging_opted_out_at: new Date().toISOString() }).eq("id", userId);
      const { data: trips } = await t.db.from("trip_members").select("trip_id").eq("user_id", userId);
      for (const row of trips ?? []) await cancelPending(t, { tripId: row.trip_id, userId });
      log.warn("OPT-OUT", { userId });
      await reply(t, userId, phone, null, "system.optout_confirmed", {});
      return;
    }
    case "start": {
      await t.db.from("users").update({ messaging_opted_out_at: null }).eq("id", userId);
      await reply(t, userId, phone, null, "system.optin_confirmed", {});
      return;
    }
    case "help": {
      if (!tripId) return reply(t, userId, phone, null, "system.unknown", {});
      const agg = await mustLoad(t, tripId);
      return reply(t, userId, phone, tripId, "system.help", tripVars(agg));
    }
    case "approve":
    case "decline": {
      if (!tripId) return reply(t, userId, phone, null, "system.unknown", {});
      const r = await recordApproval(t, tripId, userId, intent.kind === "approve" ? "yes" : "no");
      if (!r.accepted) log.info("approval not accepted", { tripId, userId, reason: r.reason });
      return;
    }
    case "more": {
      if (!tripId) return;
      return sendApprovalMore(t, tripId, userId);
    }
    case "vote": {
      const { data: opt } = await t.db.from("date_options").select("trip_id").eq("id", intent.optionId).maybeSingle();
      if (!opt) return reply(t, userId, phone, tripId, "system.unknown", {});
      await recordVote(t, opt.trip_id, userId, intent.optionId, intent.pref);
      return;
    }
    case "none": {
      if (!tripId) return;
      const agg = await mustLoad(t, tripId);
      const link = await tokenUrlFor(t, { tripId, userId, scope: "availability", responseDeadline: agg.row.response_deadline, appUrl: env.APP_URL });
      return reply(t, userId, phone, tripId, "dates.none_work", { ...tripVars(agg), link });
    }
    case "done": {
      if (!tripId) return;
      const agg = await mustLoad(t, tripId);
      await cancelPending(t, { tripId, userId, types: ["send_nudge"] });
      return reply(t, userId, phone, tripId, "dates.votes_complete", tripVars(agg));
    }
    case "extend":
    case "proceed": {
      if (!tripId) return;
      const agg = await mustLoad(t, tripId);
      const me = agg.members.find((m) => m.id === userId);
      if (!me || me.role !== "admin") return reply(t, userId, phone, tripId, "system.unknown", {});
      if (intent.kind === "extend") await extendDeadline(t, tripId, 7, userId);
      else await closeDateCollection(t, tripId);
      return;
    }
    case "unknown":
    default:
      return reply(t, userId, phone, tripId, "system.unknown", {});
  }
}

async function reply(t: Trusted, userId: string, phone: string, tripId: string | null, key: string, vars: Parameters<typeof render>[1]) {
  const rendered = render(key, vars, { footer: false });
  // Replies to an inbound are inside the 24h session and are a response the
  // person asked for; they bypass the per-person nudge caps.
  await sendToUser(t, { userId, phoneE164: phone, tripId, kind: "admin", message: message(rendered, { tripId: tripId ?? undefined, userId, kind: "admin" }) });
}

/** Twilio status callback: delivered / undelivered / failed. */
export async function handleStatus(t: Trusted, p: { providerSid: string; status: string; errorCode: string | null }): Promise<void> {
  const { data: row } = await t.db
    .from("message_log")
    .update({ status: p.status, error: p.errorCode })
    .eq("provider_sid", p.providerSid)
    .select("id, user_id, trip_id, channel, rendered_body, context")
    .maybeSingle();
  if (!row) return;
  if ((p.status === "undelivered" || p.status === "failed") && row.channel === "whatsapp") {
    log.warn("whatsapp undelivered; member may be unreachable", { tripId: row.trip_id, userId: row.user_id, errorCode: p.errorCode });
    if (row.trip_id) {
      await t.db.from("trip_activity").insert({ trip_id: row.trip_id, actor_user_id: null, kind: "undelivered", payload: { userId: row.user_id, errorCode: p.errorCode } as never });
    }
  }
}
