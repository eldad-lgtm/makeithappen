import "server-only";

import type { OutboundMessage } from "@/messages/types";
import {
  renderChoicesAsText,
  withinSession,
  type MessagingChannel,
  type SendResult,
  type SessionState,
} from "../types";
import { contentSidFor, twilioCreateMessage, type TwilioConfig } from "./client";

export interface TwilioWhatsAppOptions extends TwilioConfig {
  from: string; // "whatsapp:+1415..."
  statusCallbackUrl?: string;
}

/**
 * Production channel via Twilio's WhatsApp Business API (§7.2).
 *
 * Interactive buttons on WhatsApp require an approved Content Template. When a
 * ContentSid is mapped for the template key we send that; otherwise we fall
 * back to a plain body with numbered choices, which is valid in the sandbox
 * and inside a live 24h session.
 */
export class TwilioWhatsAppChannel implements MessagingChannel {
  readonly name = "whatsapp" as const;
  readonly supportsButtons = true;

  constructor(private readonly opts: TwilioWhatsAppOptions) {}

  supportsFreeform(session: SessionState): boolean {
    return withinSession(session);
  }

  async send(toE164: string, message: OutboundMessage): Promise<SendResult> {
    const contentSid = contentSidFor(message.templateKey);
    const { body, choices } = renderChoicesAsText(message);
    try {
      const res = await twilioCreateMessage(this.opts, {
        From: this.opts.from,
        To: `whatsapp:${toE164}`,
        ...(contentSid
          ? { ContentSid: contentSid, ContentVariables: JSON.stringify({ body: message.body }) }
          : { Body: body }),
        StatusCallback: this.opts.statusCallbackUrl,
      });
      return { ok: true, channel: "whatsapp", providerSid: res.sid, renderedBody: body, choices };
    } catch (e) {
      return { ok: false, channel: "whatsapp", renderedBody: body, choices, error: (e as Error).message };
    }
  }

  async sendToGroup(groupId: string, message: OutboundMessage): Promise<SendResult> {
    // Phase 2 — Meta Groups API via Twilio. Group ids are addressed like
    // participants; interactive messages are unsupported in groups (§7.3).
    try {
      const res = await twilioCreateMessage(this.opts, {
        From: this.opts.from,
        To: `whatsapp:${groupId}`,
        Body: message.body,
        StatusCallback: this.opts.statusCallbackUrl,
      });
      return { ok: true, channel: "whatsapp", providerSid: res.sid, renderedBody: message.body };
    } catch (e) {
      return { ok: false, channel: "whatsapp", renderedBody: message.body, error: (e as Error).message };
    }
  }
}
