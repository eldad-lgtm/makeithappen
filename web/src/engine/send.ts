import "server-only";

import { getChannel, getFallbackChannel } from "@/channels";
import type { SendResult } from "@/channels/types";
import type { MessageKind } from "@/core/limits";
import type { MsgChannelDb } from "@/db/database.types";
import type { Trusted } from "@/db/token-scope/client";
import type { OutboundMessage } from "@/messages/types";
import { guardOutbound, type GuardVerdict } from "@/observability/guard";
import { log } from "@/observability/log";

/**
 * The single outbound path. Every message to a person goes through here:
 * guard (kill switch, budgets, per-person caps) → channel → message_log.
 */

export type SendOutcome =
  | { sent: true; result: SendResult; logId: string }
  | { sent: false; blocked: GuardVerdict & { ok: false } }
  | { sent: false; failed: string };

export interface SendParams {
  userId: string;
  phoneE164: string;
  tripId: string | null;
  message: OutboundMessage;
  kind: MessageKind;
  /** Last inbound from this person, for the 24h session rule. */
  lastInboundAt?: number | null;
}

export async function sendToUser(t: Trusted, p: SendParams): Promise<SendOutcome> {
  const guard = await guardOutbound(t, { userId: p.userId, tripId: p.tripId, kind: p.kind });
  if (!guard.ok) {
    await logMessage(t, {
      tripId: p.tripId,
      userId: p.userId,
      channel: "suppressed",
      templateKey: p.message.templateKey,
      body: p.message.body,
      status: "suppressed",
      error: guard.reason,
      context: { ...p.message.context, guard: guard.kind },
    });
    log.info("outbound suppressed", { tripId: p.tripId, userId: p.userId, reason: guard.reason, templateKey: p.message.templateKey });
    return { sent: false, blocked: guard };
  }

  const channel = getChannel();
  let result = await channel.send(p.phoneE164, p.message);

  if (!result.ok) {
    const fb = getFallbackChannel();
    if (fb) {
      log.warn("primary channel failed; trying SMS fallback", { tripId: p.tripId, userId: p.userId, error: result.error });
      result = await fb.send(p.phoneE164, p.message);
    }
  }

  const logId = await logMessage(t, {
    tripId: p.tripId,
    userId: p.userId,
    channel: result.channel,
    templateKey: p.message.templateKey,
    body: result.renderedBody,
    providerSid: result.providerSid ?? null,
    status: result.ok ? (result.shareUrl ? "handoff" : "queued") : "failed",
    error: result.error ?? null,
    context: {
      ...p.message.context,
      choices: result.choices ?? [],
      shareUrl: result.shareUrl ?? null,
    },
  });

  if (!result.ok) {
    log.error("outbound failed", { tripId: p.tripId, userId: p.userId, error: result.error, templateKey: p.message.templateKey });
    return { sent: false, failed: result.error ?? "send failed" };
  }
  log.info("outbound sent", { tripId: p.tripId, userId: p.userId, channel: result.channel, templateKey: p.message.templateKey, principal: t.principal.kind });
  return { sent: true, result, logId };
}

export async function logMessage(
  t: Trusted,
  p: {
    tripId: string | null;
    userId: string | null;
    direction?: "inbound" | "outbound";
    channel: MsgChannelDb;
    templateKey?: string | null;
    body: string;
    providerSid?: string | null;
    status: string;
    error?: string | null;
    context?: Record<string, unknown>;
  },
): Promise<string> {
  const { data, error } = await t.db
    .from("message_log")
    .insert({
      trip_id: p.tripId,
      user_id: p.userId,
      direction: p.direction ?? "outbound",
      channel: p.channel,
      template_key: p.templateKey ?? null,
      rendered_body: p.body,
      provider_sid: p.providerSid ?? null,
      status: p.status,
      error: p.error ?? null,
      context: (p.context ?? {}) as never,
    })
    .select("id")
    .single();
  if (error) {
    // A duplicate provider_sid means a retried webhook; that's fine.
    if (error.code === "23505") return "duplicate";
    throw new Error(`message_log: ${error.message}`);
  }
  return data.id;
}

/** Last inbound from a phone, for the 24h session window. */
export async function lastInboundAt(t: Trusted, userId: string): Promise<number | null> {
  const { data } = await t.db
    .from("message_log")
    .select("created_at")
    .eq("user_id", userId)
    .eq("direction", "inbound")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? new Date(data.created_at).getTime() : null;
}
