/**
 * Channel abstraction. PLAN.md §7.3.
 *
 * Domain code never imports Twilio. It emits an `OutboundMessage` describing
 * intent and the channel decides how to deliver it. Adding Telegram later is
 * one new implementation and zero changes to the engine.
 */

import type { OutboundMessage } from "@/messages/types";

export type ChannelName = "whatsapp" | "sms" | "deeplink" | "console";

export interface SendResult {
  ok: boolean;
  channel: ChannelName;
  /** Provider message id, for idempotency and status callbacks. */
  providerSid?: string;
  /** For DeepLinkChannel: the share link an admin opens. */
  shareUrl?: string;
  /** Exactly what went out, after channel-specific rendering (buttons → numbered list, etc.). */
  renderedBody: string;
  /** Ordered payload ids corresponding to numbered choices in the rendered body. */
  choices?: string[];
  error?: string;
}

export interface SessionState {
  /** Last inbound message from this person, ms epoch. Free-form text is allowed within 24h. */
  lastInboundAt: number | null;
}

export interface MessagingChannel {
  readonly name: ChannelName;
  readonly supportsButtons: boolean;
  supportsFreeform(session: SessionState): boolean;
  send(toE164: string, message: OutboundMessage): Promise<SendResult>;
  /** Native group post (managed mode). Most channels cannot do this. */
  sendToGroup(groupId: string, message: OutboundMessage): Promise<SendResult>;
}

/** Render buttons/list rows as a numbered footer for channels without interactive messages. */
export function renderChoicesAsText(message: OutboundMessage): { body: string; choices: string[] } {
  const items =
    message.buttons?.map((b) => ({ id: b.id, label: b.label })) ??
    message.list?.rows.map((r) => ({ id: r.id, label: r.label })) ??
    [];
  if (items.length === 0) return { body: message.body, choices: [] };
  const digits = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣"];
  const lines = items.map((it, i) => `${digits[i] ?? `${i + 1}.`} ${it.label}`);
  return {
    body: `${message.body}\n\n${lines.join("\n")}\n\n_Reply with a number._`,
    choices: items.map((it) => it.id),
  };
}

export const SESSION_WINDOW_MS = 24 * 3600_000;

export function withinSession(session: SessionState, now = Date.now()): boolean {
  return session.lastInboundAt !== null && now - session.lastInboundAt < SESSION_WINDOW_MS;
}
