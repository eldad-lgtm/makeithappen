/**
 * Phone identity. E.164 is the identity key throughout the system (§5.1), so
 * normalisation has to be deterministic and strict.
 */

import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

export interface ParsedPhone {
  e164: string;
  country: string | undefined;
}

/**
 * Normalise user input to E.164. `defaultCountry` is used when the number
 * has no international prefix (e.g. a local "054-..." Israeli number).
 */
export function normalizePhone(
  input: string,
  defaultCountry: string = "IL",
): ParsedPhone | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const parsed = parsePhoneNumberFromString(trimmed, defaultCountry as CountryCode);
  if (!parsed || !parsed.isValid()) return null;
  return { e164: parsed.number, country: parsed.country };
}

export function isE164(value: string): boolean {
  return /^\+[1-9][0-9]{6,14}$/.test(value);
}

/** Members see each other as name + last 4 digits. Never the full number (§9). */
export function maskPhone(e164: string): string {
  const last4 = e164.slice(-4);
  return `•••• ${last4}`;
}

/**
 * Best-effort timezone inference from a country code (§5.1). Never assume
 * the server's timezone — that's how you text someone at 4am. The person
 * can always correct it.
 */
const COUNTRY_TZ: Record<string, string> = {
  IL: "Asia/Jerusalem",
  GB: "Europe/London",
  IE: "Europe/Dublin",
  PT: "Europe/Lisbon",
  ES: "Europe/Madrid",
  FR: "Europe/Paris",
  DE: "Europe/Berlin",
  NL: "Europe/Amsterdam",
  BE: "Europe/Brussels",
  CH: "Europe/Zurich",
  AT: "Europe/Vienna",
  IT: "Europe/Rome",
  GR: "Europe/Athens",
  CY: "Asia/Nicosia",
  TR: "Europe/Istanbul",
  PL: "Europe/Warsaw",
  CZ: "Europe/Prague",
  HU: "Europe/Budapest",
  RO: "Europe/Bucharest",
  SE: "Europe/Stockholm",
  NO: "Europe/Oslo",
  DK: "Europe/Copenhagen",
  FI: "Europe/Helsinki",
  UA: "Europe/Kyiv",
  AE: "Asia/Dubai",
  IN: "Asia/Kolkata",
  SG: "Asia/Singapore",
  TH: "Asia/Bangkok",
  JP: "Asia/Tokyo",
  KR: "Asia/Seoul",
  CN: "Asia/Shanghai",
  HK: "Asia/Hong_Kong",
  AU: "Australia/Sydney",
  NZ: "Pacific/Auckland",
  ZA: "Africa/Johannesburg",
  EG: "Africa/Cairo",
  BR: "America/Sao_Paulo",
  AR: "America/Argentina/Buenos_Aires",
  MX: "America/Mexico_City",
  CA: "America/Toronto",
  US: "America/New_York",
};

export function inferTimezone(country: string | undefined, fallback = "UTC"): string {
  if (!country) return fallback;
  return COUNTRY_TZ[country] ?? fallback;
}

export function inferLocale(country: string | undefined, fallback = "en"): string {
  // English only at launch (§14). Hebrew is the expected first addition; the
  // messages layer is keyed by locale so this is a data change later.
  void country;
  return fallback;
}

/** Local hour (0–23) in a timezone, for quiet-hours checks (§6.7). */
export function localHour(atMs: number, timezone: string): number {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone: timezone,
    }).formatToParts(new Date(atMs));
    const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
    return h === 24 ? 0 : h;
  } catch {
    return new Date(atMs).getUTCHours();
  }
}
