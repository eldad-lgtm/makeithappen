import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "node:crypto";
import type { TokenScope, TripStatus } from "@/core/types";
import { tokenTtlMs, validateToken, type TokenVerdict } from "@/core/tokens";
import type { Database } from "@/db/database.types";

/**
 * THE SERVICE-ROLE CHOKEPOINT. PLAN.md §7.6.
 *
 * This is the only module in the codebase allowed to hold a service-role
 * client. Everything that bypasses RLS — action-token pages, the Twilio
 * webhook, the cron runner, and the engine they drive — comes through here
 * with an already-validated `Principal` that says who authorised the call.
 *
 * Rules:
 *  - server-only; never imported by anything that reaches a browser bundle
 *  - the key is read from SUPABASE_SERVICE_ROLE_KEY and never NEXT_PUBLIC_
 *  - callers receive a client bound to a principal, and the principal is
 *    logged with every mutation the engine performs
 */

export type Principal =
  | { kind: "token"; tripId: string; userId: string; scope: TokenScope }
  | { kind: "session_admin"; tripId: string; userId: string }
  | { kind: "session_user"; userId: string }
  | { kind: "webhook"; provider: "twilio" }
  | { kind: "cron" }
  | { kind: "system"; reason: string };

export type ServiceClient = SupabaseClient<Database>;

export interface Trusted {
  db: ServiceClient;
  principal: Principal;
}

let cached: ServiceClient | null = null;

function serviceClient(): ServiceClient {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL are not configured");
  }
  cached = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

/** Trusted context for a validated principal. The only way to get a service client. */
export function trusted(principal: Principal): Trusted {
  return { db: serviceClient(), principal };
}

/* ------------------------------ action tokens ------------------------------ */

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export interface MintedToken {
  raw: string;
  url: string;
  expiresAt: Date;
}

export async function mintToken(
  t: Trusted,
  params: { tripId: string; userId: string; scope: TokenScope; responseDeadline: string | null; appUrl: string },
): Promise<MintedToken> {
  const raw = randomBytes(24).toString("base64url");
  const now = Date.now();
  const ttl = tokenTtlMs(
    params.scope,
    params.responseDeadline ? new Date(params.responseDeadline).getTime() : null,
    now,
  );
  const expiresAt = new Date(now + ttl);
  const { error } = await t.db.from("action_tokens").insert({
    token_hash: hashToken(raw),
    trip_id: params.tripId,
    user_id: params.userId,
    scope: params.scope,
    expires_at: expiresAt.toISOString(),
  });
  if (error) throw new Error(`mintToken: ${error.message}`);
  return { raw, url: `${params.appUrl}/a/${raw}`, expiresAt };
}

/** Reuse a live token for the same (trip, user, scope) rather than minting a pile of them. */
export async function tokenUrlFor(
  t: Trusted,
  params: { tripId: string; userId: string; scope: TokenScope; responseDeadline: string | null; appUrl: string },
): Promise<string> {
  // We can't recover the raw token from its hash, so always mint. Old tokens
  // for the same scope are revoked to keep the live set small.
  await t.db
    .from("action_tokens")
    .delete()
    .eq("trip_id", params.tripId)
    .eq("user_id", params.userId)
    .eq("scope", params.scope)
    .is("used_at", null);
  const minted = await mintToken(t, params);
  return minted.url;
}

export interface ResolvedToken {
  principal: Extract<Principal, { kind: "token" }>;
  tripStatus: TripStatus;
}

export type TokenFailure = Extract<TokenVerdict, { ok: false }>["reason"] | "not_found";
export type ResolveResult = { ok: true; token: ResolvedToken } | { ok: false; reason: TokenFailure };

/**
 * Validate first, act second: hash lookup, scope, expiry, single-use, phase.
 * Returns a token principal scoped to exactly one user in one trip.
 */
export async function resolveToken(raw: string, requiredScope: TokenScope): Promise<ResolveResult> {
  const db = serviceClient();
  const { data: row } = await db
    .from("action_tokens")
    .select("trip_id,user_id,scope,expires_at,used_at")
    .eq("token_hash", hashToken(raw))
    .maybeSingle();
  if (!row) return { ok: false, reason: "not_found" };

  const { data: trip } = await db.from("trips").select("status").eq("id", row.trip_id).maybeSingle();
  if (!trip) return { ok: false, reason: "not_found" };

  const verdict = validateToken(
    {
      tripId: row.trip_id,
      userId: row.user_id,
      scope: row.scope as TokenScope,
      expiresAt: new Date(row.expires_at).getTime(),
      usedAt: row.used_at ? new Date(row.used_at).getTime() : null,
    },
    requiredScope,
    trip.status,
    Date.now(),
  );
  if (!verdict.ok) return { ok: false, reason: verdict.reason };

  return {
    ok: true,
    token: {
      principal: { kind: "token", tripId: row.trip_id, userId: row.user_id, scope: row.scope as TokenScope },
      tripStatus: trip.status,
    },
  };
}

export async function revokeTokensForPhase(t: Trusted, tripId: string, scope: TokenScope): Promise<void> {
  await t.db.from("action_tokens").delete().eq("trip_id", tripId).eq("scope", scope);
}
