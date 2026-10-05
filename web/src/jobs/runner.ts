import "server-only";

import type { ScheduledJobRow } from "@/db/database.types";
import { trusted, type Trusted } from "@/db/token-scope/client";
import { expireRelay, runNudgeJob } from "@/engine/nudges";
import {
  checkApprovalDeadline,
  closeDateCollection,
  expireTrip,
  sendApprovalAsk,
  sendDatesAsk,
  sendDeadlineWarning,
} from "@/engine/trip";
import { captureException, log } from "@/observability/log";
import { markDone, markFailed, type JobType } from "./scheduler";

/**
 * Job runner (§7.4). Called once a minute by pg_cron (or any scheduler).
 * Claims due jobs with SKIP LOCKED, runs each, records the result.
 *
 * Every handler is idempotent: a job may run twice and nothing may
 * double-send. Handlers re-check trip state before acting.
 */

type Handler = (t: Trusted, job: ScheduledJobRow) => Promise<void>;

const HANDLERS: Record<JobType, Handler> = {
  send_approval_ask: async (t, j) => {
    if (j.trip_id && j.user_id) await sendApprovalAsk(t, j.trip_id, j.user_id);
  },
  send_dates_ask: async (t, j) => {
    if (j.trip_id && j.user_id) await sendDatesAsk(t, j.trip_id, j.user_id);
  },
  send_nudge: async (t, j) => {
    if (j.trip_id && j.user_id) await runNudgeJob(t, j.id, j.trip_id, j.user_id);
  },
  deadline_warning: async (t, j) => {
    if (j.trip_id) await sendDeadlineWarning(t, j.trip_id);
  },
  check_approval_deadline: async (t, j) => {
    if (j.trip_id) await checkApprovalDeadline(t, j.trip_id);
  },
  close_date_collection: async (t, j) => {
    if (j.trip_id) await closeDateCollection(t, j.trip_id);
  },
  expire_relay: async (t, j) => {
    if (j.trip_id) await expireRelay(t, j.trip_id);
  },
  expire_trip: async (t, j) => {
    if (j.trip_id) await expireTrip(t, j.trip_id);
  },
};

/** send_nudge manages its own completion (done / deferred). Everything else is marked done here. */
const SELF_COMPLETING: JobType[] = ["send_nudge"];

export interface RunSummary {
  claimed: number;
  done: number;
  failed: number;
  reclaimed: number;
  ms: number;
}

export async function runDueJobs(limit = 50): Promise<RunSummary> {
  const t = trusted({ kind: "cron" });
  const started = Date.now();

  const { data: reclaimed } = await t.db.rpc("release_stale_jobs", {});
  const { data: jobs, error } = await t.db.rpc("claim_due_jobs", { p_limit: limit });
  if (error) throw new Error(`claim_due_jobs: ${error.message}`);

  let done = 0;
  let failed = 0;
  for (const job of jobs ?? []) {
    const handler = HANDLERS[job.job_type as JobType];
    const fields = { jobId: job.id, jobType: job.job_type, tripId: job.trip_id, userId: job.user_id, attempt: job.attempts };
    if (!handler) {
      await markFailed(t, job.id, 99, `unknown job type ${job.job_type}`);
      failed++;
      continue;
    }
    try {
      await handler(t, job);
      if (!SELF_COMPLETING.includes(job.job_type as JobType)) await markDone(t, job.id);
      done++;
      log.info("job done", fields);
    } catch (e) {
      failed++;
      captureException(e, fields);
      await markFailed(t, job.id, job.attempts, (e as Error).message);
    }
  }

  const summary = { claimed: jobs?.length ?? 0, done, failed, reclaimed: Number(reclaimed ?? 0), ms: Date.now() - started };
  log.info("runner tick", summary);
  return summary;
}
