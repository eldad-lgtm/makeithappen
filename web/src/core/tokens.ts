/**
 * Action-token rules. PLAN.md §7.6.
 *
 * Pure validation over an already-loaded token row. Hashing and lookup are
 * I/O and live in db/token-scope. A leaked availability token should cost
 * you one wrong vote, not the trip — so scope, phase, expiry and single-use
 * are all checked here, in one place.
 */

import type { TokenScope, TripStatus } from "./types";

export interface TokenRow {
  tripId: string;
  userId: string;
  scope: TokenScope;
  expiresAt: number;
  usedAt: number | null;
}

/** Which trip states each scope is valid in. A token outlives its phase, not the trip. */
const SCOPE_PHASES: Record<TokenScope, readonly TripStatus[]> = {
  approve: ["approval"],
  availability: ["approved", "date_collection", "date_proposed"],
  view: [
    "approval",
    "approved",
    "date_collection",
    "date_proposed",
    "date_locked",
  ],
};

/** Single-use scopes burn on first successful action; others are reusable until expiry. */
const SINGLE_USE: Record<TokenScope, boolean> = {
  approve: false, // vote changes are allowed until the phase closes (§4.1)
  availability: false,
  view: false,
};

export type TokenVerdict =
  | { ok: true }
  | { ok: false; reason: "expired" | "used" | "wrong_phase" | "wrong_scope" };

export function validateToken(
  row: TokenRow,
  requiredScope: TokenScope,
  tripStatus: TripStatus,
  now: number,
): TokenVerdict {
  if (row.scope !== requiredScope) return { ok: false, reason: "wrong_scope" };
  if (row.expiresAt <= now) return { ok: false, reason: "expired" };
  if (SINGLE_USE[row.scope] && row.usedAt !== null) return { ok: false, reason: "used" };
  if (!SCOPE_PHASES[row.scope].includes(tripStatus)) return { ok: false, reason: "wrong_phase" };
  return { ok: true };
}

/** How long a token for this scope lives. Expires with its phase (§7.6). */
export function tokenTtlMs(scope: TokenScope, responseDeadline: number | null, now: number): number {
  const DAY = 86_400_000;
  const base = scope === "view" ? 30 * DAY : 14 * DAY;
  if (responseDeadline && responseDeadline > now) {
    // Live until the deadline plus a grace day for late arrivals.
    return Math.min(base, responseDeadline - now + DAY);
  }
  return base;
}
