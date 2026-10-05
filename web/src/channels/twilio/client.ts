import "server-only";

/**
 * Minimal Twilio REST client over fetch. No SDK: the surface we need is one
 * endpoint, and keeping the dependency out keeps the client bundle honest.
 */

export interface TwilioConfig {
  accountSid: string;
  authToken: string;
}

export interface TwilioMessageParams {
  From: string;
  To: string;
  Body?: string;
  ContentSid?: string;
  ContentVariables?: string;
  StatusCallback?: string;
}

export interface TwilioMessageResponse {
  sid: string;
  status: string;
  error_code?: number | null;
  error_message?: string | null;
}

export async function twilioCreateMessage(
  cfg: TwilioConfig,
  params: TwilioMessageParams,
): Promise<TwilioMessageResponse> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${cfg.accountSid}/Messages.json`;
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) body.set(k, v);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${cfg.accountSid}:${cfg.authToken}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const json = (await res.json().catch(() => ({}))) as Partial<TwilioMessageResponse> & { message?: string };
  if (!res.ok) {
    throw new Error(`twilio ${res.status}: ${json.message ?? json.error_message ?? "request failed"}`);
  }
  return json as TwilioMessageResponse;
}

/**
 * Optional mapping of template keys → Twilio Content SIDs for approved
 * templates. Set TWILIO_CONTENT_SIDS='{"approval.ask":"HX...","nudge.standard.dm.1":"HX..."}'.
 * Unmapped keys fall back to plain Body (fine in the sandbox and inside a 24h session).
 */
export function contentSidFor(templateKey: string, raw = process.env.TWILIO_CONTENT_SIDS): string | undefined {
  if (!raw) return undefined;
  try {
    const map = JSON.parse(raw) as Record<string, string>;
    const base = templateKey.split("#")[0];
    return map[templateKey] ?? map[base];
  } catch {
    return undefined;
  }
}
