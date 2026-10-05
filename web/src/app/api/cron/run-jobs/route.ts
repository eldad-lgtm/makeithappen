import { timingSafeEqual } from "node:crypto";
import { runDueJobs } from "@/jobs/runner";
import { env } from "@/lib/env";
import { captureException } from "@/observability/log";

export const maxDuration = 60;

/**
 * Job-runner tick (§7.4). pg_cron (or any scheduler) POSTs here once a
 * minute with `Authorization: Bearer $CRON_SECRET`. Bypasses RLS, so it
 * authorises in application code with the shared secret.
 */
export async function POST(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  const presented = auth.replace(/^Bearer\s+/i, "");
  if (!safeEqual(presented, env.CRON_SECRET)) return new Response("unauthorized", { status: 401 });

  try {
    const summary = await runDueJobs(50);
    return Response.json(summary);
  } catch (e) {
    captureException(e, { jobType: "runner" });
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function GET() {
  return Response.json({ ok: true, hint: "POST with Authorization: Bearer <CRON_SECRET>" });
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length === 0 || ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
