import { after } from "next/server";
import { validateTwilioSignature } from "@/channels/twilio/signature";
import { trusted } from "@/db/token-scope/client";
import { handleInbound } from "@/engine/inbound";
import { env } from "@/lib/env";
import { captureException, log } from "@/observability/log";

/**
 * Inbound WhatsApp/SMS (§7.2). Mandatory:
 *  - validate X-Twilio-Signature (an unvalidated webhook lets anyone vote as anyone)
 *  - idempotency on provider_sid (Twilio retries; a double-counted vote corrupts a quorum)
 *  - respond fast, process after the response is sent
 */
export async function POST(request: Request) {
  const raw = await request.text();
  const params = Object.fromEntries(new URLSearchParams(raw)) as Record<string, string>;

  if (env.MESSAGING_CHANNEL === "twilio") {
    const ok = validateTwilioSignature(env.TWILIO_AUTH_TOKEN, env.TWILIO_WEBHOOK_URL, params, request.headers.get("x-twilio-signature"));
    if (!ok) {
      log.warn("twilio webhook: bad signature");
      return new Response("forbidden", { status: 403 });
    }
  } else if (process.env.NODE_ENV === "production") {
    return new Response("messaging channel is not twilio", { status: 404 });
  }

  const from = (params.From ?? "").replace(/^whatsapp:/, "");
  const channel = (params.From ?? "").startsWith("whatsapp:") ? "whatsapp" : "sms";
  if (!from) return twiml();

  after(async () => {
    try {
      await handleInbound(trusted({ kind: "webhook", provider: "twilio" }), {
        fromE164: from,
        body: params.Body ?? null,
        buttonPayload: params.ButtonPayload ?? params.ListId ?? null,
        providerSid: params.MessageSid ?? params.SmsMessageSid ?? null,
        channel,
      });
    } catch (e) {
      captureException(e, { channel: "twilio-inbound" });
    }
  });

  return twiml();
}

/** Empty TwiML: we reply through the API, not inline. */
function twiml() {
  return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}
