import "server-only";

import type { OutboundMessage } from "@/messages/types";
import { renderChoicesAsText, type MessagingChannel, type SendResult } from "../types";
import { twilioCreateMessage, type TwilioConfig } from "./client";

export interface TwilioSmsOptions extends TwilioConfig {
  from: string; // "+1415..."
  statusCallbackUrl?: string;
}

/** Fallback when WhatsApp reports `undelivered` (§7.2). No buttons, no groups. */
export class TwilioSmsChannel implements MessagingChannel {
  readonly name = "sms" as const;
  readonly supportsButtons = false;

  constructor(private readonly opts: TwilioSmsOptions) {}

  supportsFreeform(): boolean {
    return true;
  }

  async send(toE164: string, message: OutboundMessage): Promise<SendResult> {
    const { body, choices } = renderChoicesAsText(message);
    const plain = body.replace(/[*_]/g, ""); // no WhatsApp markdown over SMS
    try {
      const res = await twilioCreateMessage(this.opts, {
        From: this.opts.from,
        To: toE164,
        Body: plain,
        StatusCallback: this.opts.statusCallbackUrl,
      });
      return { ok: true, channel: "sms", providerSid: res.sid, renderedBody: plain, choices };
    } catch (e) {
      return { ok: false, channel: "sms", renderedBody: plain, choices, error: (e as Error).message };
    }
  }

  async sendToGroup(): Promise<SendResult> {
    return { ok: false, channel: "sms", renderedBody: "", error: "SMS has no groups" };
  }
}
