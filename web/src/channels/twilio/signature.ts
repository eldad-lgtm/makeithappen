import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Validate `X-Twilio-Signature` (§7.2). An unvalidated webhook lets anyone
 * vote as anyone.
 *
 * Algorithm: take the full webhook URL (with query string), append every
 * POST parameter as key+value sorted by key, HMAC-SHA1 with the auth token,
 * base64-encode, compare.
 */
export function computeTwilioSignature(
  authToken: string,
  url: string,
  params: Record<string, string>,
): string {
  const keys = Object.keys(params).sort();
  let data = url;
  for (const k of keys) data += k + params[k];
  return createHmac("sha1", authToken).update(Buffer.from(data, "utf8")).digest("base64");
}

export function validateTwilioSignature(
  authToken: string,
  url: string,
  params: Record<string, string>,
  signature: string | null | undefined,
): boolean {
  if (!signature) return false;
  const expected = computeTwilioSignature(authToken, url, params);
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
