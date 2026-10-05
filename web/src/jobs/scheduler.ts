import "server-only";

import type { Trusted } from "@/db/token-scope/client";
import { log } from "@/observability/log";

/**
 * `scheduled_jobs` is the only source of future action (§5.2, §7.4).
 * Restart-safe by construction. Nothing here runs a timer.
 */

export type JobType =
  | "send_approval_ask"
  | "send_dates_ask"
  | "send_nudge"
  | "deadline_warning"
  | "check_approval_deadline"
  | "close_date_collection"
  | "expire_relay"
  | "expire_trip";

export interface ScheduleParams {
  type: JobType;
  runAt: Date;
  tripId: string | null;
  userId?: string | null;
  payload?: Record<string, unknown>;
}

export async function schedule(t: Trusted, p: ScheduleParams): Promise<string> {
  const { data, error } = await t.db
    .from("scheduled_jobs")
    .insert({
      job_type: p.type,
      run_at: p.runAt.toISOString(),
      trip_id: p.tripId,
      user_id: p.userId ?? null,
      payload: (p.payload ?? {}) as never,
      status: "pending",
    })
    .select("id")
    .single();
  if (error) throw new Error(`schedule ${p.type}: ${error.message}`);
  log.debug("job scheduled", { jobId: data.id, jobType: p.type, tripId: p.tripId, userId: p.userId ?? null, runAt: p.runAt.toISOString() });
  return data.id;
}

/**
 * Cancellation on state change (§7.4): when a member responds, their pending
 * nudges go away in the same breath. Nudging someone who already answered is
 * the fastest way to get the number blocked.
 */
export async function cancelPending(
  t: Trusted,
  p: { tripId: string; userId?: string | null; types?: JobType[] },
): Promise<number> {
  let q = t.db.from("scheduled_jobs").update({ status: "cancelled" }).eq("trip_id", p.tripId).eq("status", "pending");
  if (p.userId) q = q.eq("user_id", p.userId);
  if (p.types && p.types.length > 0) q = q.in("job_type", p.types);
  const { data, error } = await q.select("id");
  if (error) throw new Error(`cancelPending: ${error.message}`);
  const n = data?.length ?? 0;
  if (n > 0) log.info("jobs cancelled", { tripId: p.tripId, userId: p.userId ?? null, count: n, types: p.types });
  return n;
}

/** Replace: cancel any pending job of this type for (trip,user) and schedule a new one. */
export async function reschedule(t: Trusted, p: ScheduleParams & { userId: string | null }): Promise<string> {
  if (p.tripId) await cancelPending(t, { tripId: p.tripId, userId: p.userId, types: [p.type] });
  return schedule(t, p);
}

export async function markDone(t: Trusted, jobId: string): Promise<void> {
  await t.db.from("scheduled_jobs").update({ status: "done", locked_at: null }).eq("id", jobId);
}

export async function markFailed(t: Trusted, jobId: string, attempts: number, err: string, maxAttempts = 5): Promise<void> {
  if (attempts >= maxAttempts) {
    await t.db.from("scheduled_jobs").update({ status: "failed", last_error: err, locked_at: null }).eq("id", jobId);
    log.error("job FAILED permanently", { jobId, attempts, error: err });
    return;
  }
  // Bounded retries with backoff: 1m, 4m, 9m, 16m.
  const backoffMs = attempts * attempts * 60_000;
  await t.db
    .from("scheduled_jobs")
    .update({ status: "pending", last_error: err, locked_at: null, run_at: new Date(Date.now() + backoffMs).toISOString() })
    .eq("id", jobId);
  log.warn("job retry scheduled", { jobId, attempts, error: err, backoffMs });
}

/** Defer: a guard blocked the job; push run_at forward keeping the ladder intact (§6.8). */
export async function defer(t: Trusted, jobId: string, byMs: number): Promise<void> {
  await t.db
    .from("scheduled_jobs")
    .update({ status: "pending", locked_at: null, run_at: new Date(Date.now() + byMs).toISOString() })
    .eq("id", jobId);
}
