import "server-only";

import { env } from "@/lib/env";
import { ConsoleChannel } from "./console";
import { DeepLinkChannel } from "./deeplink";
import { TwilioSmsChannel } from "./twilio/sms";
import { TwilioWhatsAppChannel } from "./twilio/whatsapp";
import type { MessagingChannel } from "./types";

export type { MessagingChannel, SendResult, SessionState } from "./types";

let primary: MessagingChannel | null = null;
let fallback: MessagingChannel | null = null;

/** The configured primary channel (MESSAGING_CHANNEL). */
export function getChannel(): MessagingChannel {
  if (primary) return primary;
  switch (env.MESSAGING_CHANNEL) {
    case "twilio":
      primary = new TwilioWhatsAppChannel({
        accountSid: env.TWILIO_ACCOUNT_SID,
        authToken: env.TWILIO_AUTH_TOKEN,
        from: env.TWILIO_WHATSAPP_FROM,
        statusCallbackUrl: `${env.TWILIO_WEBHOOK_URL}/status`,
      });
      break;
    case "deeplink":
      primary = new DeepLinkChannel();
      break;
    default:
      primary = new ConsoleChannel();
  }
  return primary;
}

/** SMS fallback, when configured. */
export function getFallbackChannel(): MessagingChannel | null {
  if (fallback) return fallback;
  if (env.MESSAGING_CHANNEL === "twilio" && env.TWILIO_SMS_FROM) {
    fallback = new TwilioSmsChannel({
      accountSid: env.TWILIO_ACCOUNT_SID,
      authToken: env.TWILIO_AUTH_TOKEN,
      from: env.TWILIO_SMS_FROM,
      statusCallbackUrl: `${env.TWILIO_WEBHOOK_URL}/status`,
    });
  }
  return fallback;
}

/** Tests inject their own. */
export function setChannelForTests(c: MessagingChannel | null): void {
  primary = c;
}
