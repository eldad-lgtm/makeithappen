import { after } from "next/server";
import { validateTwilioSignature } from "@/channels/twilio/signature";
import { trusted } from "@/db/token-scope/client";
import { handleStatus } from "@/engine/inbound";
import { env } from "@/lib/env";
import { captureException, log } from "@/observability/log";

/** Delivery status callbacks: queued → sent → delivered | undelivered | failed. */
export async function POST(request: Request) {
  const raw = await request.text();
  const params = Object.fromEntries(new URLSearchParams(raw)) as Record<string, string>;

  if (env.MESSAGING_CHANNEL === "twilio") {
    const ok = validateTwilioSignature(env.TWILIO_AUTH_TOKEN, `${env.TWILIO_WEBHOOK_URL}/status`, params, request.headers.get("x-twilio-signature"));
    if (!ok) {
      log.warn("twilio status: bad signature");
      return new Response("forbidden", { status: 403 });
    }
  }

  const sid = params.MessageSid ?? params.SmsSid;
  const status = params.MessageStatus ?? params.SmsStatus;
  if (sid && status) {
    after(async () => {
      try {
        await handleStatus(trusted({ kind: "webhook", provider: "twilio" }), { providerSid: sid, status, errorCode: params.ErrorCode ?? null });
      } catch (e) {
        captureException(e, { channel: "twilio-status" });
      }
    });
  }
  return new Response(null, { status: 204 });
}
