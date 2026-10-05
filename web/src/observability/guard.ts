import "server-only";

import { checkPersonCaps, checkSpend, type MessageKind, type OutboundCounts, type SpendVerdict, type LimitVerdict } from "@/core/limits";
import type { Trusted } from "@/db/token-scope/client";
import { env } from "@/lib/env";
import { log } from "./log";

/**
 * Pre-send guard (§7.7). Hard limits enforced in the sender chokepoint rather
 * than trusted to correct logic upstream:
 *   1. global kill switch   — config flag, flips without a deploy
 *   2. circuit breaker      — account budget tripped
 *   3. per-trip budget      — pauses that trip's automation
 *   4. per-person caps      — §6.8
 */

export type GuardVerdict =
  | { ok: true; counts: OutboundCounts }
  | { ok: false; reason: string; kind: "kill_switch" | "circuit" | "trip_budget" | "person_cap"; retryInMs: number | null; counts?: OutboundCounts };

export async function isOutboundEnabled(t: Trusted): Promise<boolean> {
  const { data } = await t.db.from("app_settings").select("key,value").in("key", ["outbound_enabled", "spend_circuit_open"]);
  const map = new Map((data ?? []).map((r) => [r.key, r.value]));
  return map.get("outbound_enabled") === true && map.get("spend_circuit_open") !== true;
}

export async function setKillSwitch(t: Trusted, enabled: boolean): Promise<void> {
  await t.db.from("app_settings").upsert({ key: "outbound_enabled", value: enabled, updated_at: new Date().toISOString() });
  log.warn(enabled ? "outbound ENABLED" : "outbound DISABLED (kill switch)", { principal: t.principal.kind });
}

export async function tripCircuit(t: Trusted, open: boolean): Promise<void> {
  await t.db.from("app_settings").upsert({ key: "spend_circuit_open", value: open, updated_at: new Date().toISOString() });
  log.error(open ? "spend circuit OPEN — all outbound halted" : "spend circuit closed", { principal: t.principal.kind });
}

export async function outboundCounts(t: Trusted, userId: string, tripId: string | null): Promise<OutboundCounts> {
  const { data } = await t.db.rpc("outbound_counts", { p_user_id: userId, p_trip_id: tripId ?? "00000000-0000-0000-0000-000000000000" });
  const r = data?.[0];
  const { count: activeTrips } = await t.db
    .from("scheduled_jobs")
    .select("trip_id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("job_type", "send_nudge")
    .eq("status", "pending");
  return {
    userToday: Number(r?.user_today ?? 0),
    userDm20h: Number(r?.user_dm_20h ?? 0),
    userDmWeek: Number(r?.user_dm_week ?? 0),
    userActiveTrips: Number(activeTrips ?? 0),
    tripTotal: Number(r?.trip_total ?? 0),
    accountToday: Number(r?.account_today ?? 0),
    accountMonth: Number(r?.account_month ?? 0),
  };
}

export async function guardOutbound(
  t: Trusted,
  params: { userId: string; tripId: string | null; kind: MessageKind },
): Promise<GuardVerdict> {
  if (!(await isOutboundEnabled(t))) {
    return { ok: false, kind: "kill_switch", reason: "outbound disabled (kill switch / circuit)", retryInMs: 15 * 60_000 };
  }

  const counts = await outboundCounts(t, params.userId, params.tripId);

  const spend: SpendVerdict = checkSpend(counts, {
    perTrip: env.MESSAGE_BUDGET_PER_TRIP,
    perDay: env.MESSAGE_BUDGET_PER_DAY,
    perMonth: env.MESSAGE_BUDGET_PER_MONTH,
  });
  if (!spend.ok) {
    if (spend.scope === "account") {
      await tripCircuit(t, true);
      return { ok: false, kind: "circuit", reason: spend.reason, retryInMs: null, counts };
    }
    if (params.tripId) {
      await t.db.from("trips").update({ automation_paused_at: new Date().toISOString() }).eq("id", params.tripId);
      log.warn("trip automation paused: budget", { tripId: params.tripId, reason: spend.reason });
    }
    return { ok: false, kind: "trip_budget", reason: spend.reason, retryInMs: null, counts };
  }

  const caps: LimitVerdict = checkPersonCaps(params.kind, counts);
  if (!caps.ok) {
    return { ok: false, kind: "person_cap", reason: caps.reason, retryInMs: caps.retryInMs, counts };
  }

  return { ok: true, counts };
}
