/**
 * Global per-person rate limits and spend ceilings. PLAN.md §6.8, §7.7.
 *
 * Every limit in the nudge policy is scoped to one trip. A member of three
 * active trips can satisfy all of them and still be messaged nine times in a
 * day. The person experiences MakeItHappen as one sender, so ceilings are
 * enforced against the PERSON, across every trip. When a global limit blocks
 * a nudge, defer it rather than drop it.
 */

export interface OutboundCounts {
  /** Outbound WhatsApp/SMS to this user in the last 24h, all trips. */
  userToday: number;
  /** Direct nudges to this user in the last 20h, all trips. */
  userDm20h: number;
  /** Direct nudges to this user in the last 7 days, all trips. */
  userDmWeek: number;
  /** Trips currently nudging this user (active phases with pending nudge jobs). */
  userActiveTrips: number;
  /** Outbound messages for this trip, all time. */
  tripTotal: number;
  /** Outbound messages account-wide, last 24h and this calendar month. */
  accountToday: number;
  accountMonth: number;
}

export interface Ceilings {
  perTrip: number;
  perDay: number;
  perMonth: number;
}

export const DEFAULT_CEILINGS: Ceilings = { perTrip: 300, perDay: 2000, perMonth: 20000 };

export const PERSON_CAPS = {
  dmPer20h: 1,
  dmPerWeek: 3,
  totalPerDay: 4,
  concurrentNudgingTrips: 2,
} as const;

export type MessageKind = "nudge_dm" | "ask" | "confirmation" | "admin";

export type LimitVerdict =
  | { ok: true }
  | { ok: false; reason: string; /** When to try again, ms from now. null = don't retry. */ retryInMs: number | null };

const HOUR = 3600_000;

/**
 * Per-person caps. `kind` matters: an approval ask or a confirmation is not
 * a nudge, but it still counts toward the 4/day total.
 */
export function checkPersonCaps(kind: MessageKind, c: OutboundCounts): LimitVerdict {
  if (kind === "admin") return { ok: true }; // admins asked for this
  if (c.userToday >= PERSON_CAPS.totalPerDay) {
    return { ok: false, reason: "person cap: 4 messages in 24h", retryInMs: 6 * HOUR };
  }
  if (kind === "nudge_dm") {
    if (c.userDm20h >= PERSON_CAPS.dmPer20h) {
      return { ok: false, reason: "person cap: DM'd under 20h ago", retryInMs: 4 * HOUR };
    }
    if (c.userDmWeek >= PERSON_CAPS.dmPerWeek) {
      return { ok: false, reason: "person cap: 3 nudges this week", retryInMs: 24 * HOUR };
    }
    if (c.userActiveTrips > PERSON_CAPS.concurrentNudgingTrips) {
      return { ok: false, reason: "person cap: already nudged by 2 trips", retryInMs: 12 * HOUR };
    }
  }
  return { ok: true };
}

/**
 * Spend ceilings (§7.7). Enforced in the sender chokepoint, not trusted to
 * correct logic upstream. Hitting the trip budget pauses that trip; hitting
 * the account budget trips the circuit breaker.
 */
export type SpendVerdict =
  | { ok: true }
  | { ok: false; scope: "trip" | "account"; reason: string };

export function checkSpend(c: OutboundCounts, ceilings: Ceilings = DEFAULT_CEILINGS): SpendVerdict {
  if (c.accountMonth >= ceilings.perMonth) {
    return { ok: false, scope: "account", reason: `monthly budget ${ceilings.perMonth} reached` };
  }
  if (c.accountToday >= ceilings.perDay) {
    return { ok: false, scope: "account", reason: `daily budget ${ceilings.perDay} reached` };
  }
  if (c.tripTotal >= ceilings.perTrip) {
    return { ok: false, scope: "trip", reason: `trip budget ${ceilings.perTrip} reached` };
  }
  return { ok: true };
}
