import type { OutboundMessage } from "@/messages/types";
import { renderChoicesAsText, type MessagingChannel, type SendResult } from "./types";

/**
 * Renders share text plus `wa.me` links for manual sending (§7.3).
 *
 * This is what lets you build and demo the entire product before Meta
 * approves your sender, and it doubles as the degraded mode if a number ever
 * gets restricted. Nothing is actually transmitted: the admin's dashboard
 * shows the link and a human taps it.
 */
export class DeepLinkChannel implements MessagingChannel {
  readonly name = "deeplink" as const;
  readonly supportsButtons = false;

  supportsFreeform(): boolean {
    return true; // a human is sending it
  }

  async send(toE164: string, message: OutboundMessage): Promise<SendResult> {
    const { body, choices } = renderChoicesAsText(message);
    return {
      ok: true,
      channel: "deeplink",
      shareUrl: waMeLink(toE164, body),
      renderedBody: body,
      choices,
    };
  }

  async sendToGroup(_groupId: string, message: OutboundMessage): Promise<SendResult> {
    return { ok: true, channel: "deeplink", shareUrl: waShareLink(message.body), renderedBody: message.body };
  }
}

/** Opens a 1:1 chat with the text prefilled. */
export function waMeLink(toE164: string, text: string): string {
  return `https://wa.me/${toE164.replace(/^\+/, "")}?text=${encodeURIComponent(text)}`;
}

/** Opens WhatsApp's share sheet so the sender picks the group themselves (relay mode). */
export function waShareLink(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
