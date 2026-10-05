import { notFound } from "next/navigation";
import { Shell } from "@/components/Shell";
import { trusted } from "@/db/token-scope/client";
import { isPlatformAdmin, requireUser } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { isOutboundEnabled } from "@/observability/guard";
import { toggleKillSwitch, retryJob, resetCircuit } from "./actions";

/**
 * Internal admin view (§7.7): recent jobs, message log, stuck trips, and the
 * kill switch. Gated to ADMIN_PHONES. Cheap to build on scheduled_jobs and
 * message_log; pays for itself in the first week of real use.
 */
export default async function AdminPage() {
  const s = await requireUser();
  if (!isPlatformAdmin(s.appUser, env.ADMIN_PHONES)) notFound();

  const t = trusted({ kind: "system", reason: "admin view" });
  const staleBefore = staleCutoff();
  const [health, enabled, settings, jobs, failed, msgs, stuck] = await Promise.all([
    t.db.rpc("engine_health", {}),
    isOutboundEnabled(t),
    t.db.from("app_settings").select("*"),
    t.db.from("scheduled_jobs").select("*").order("run_at", { ascending: false }).limit(40),
    t.db.from("scheduled_jobs").select("*").eq("status", "failed").order("updated_at", { ascending: false }).limit(20),
    t.db.from("message_log").select("*").order("created_at", { ascending: false }).limit(40),
    t.db.from("trips").select("id,title,status,updated_at").in("status", ["approval", "date_collection", "date_proposed"]).lt("updated_at", staleBefore).limit(20),
  ]);
  const h = health.data?.[0];
  const circuit = (settings.data ?? []).find((r) => r.key === "spend_circuit_open")?.value === true;

  return (
    <Shell userName={s.appUser.display_name}>
      <h1 className="text-2xl font-bold">Engine</h1>

      <section className={`card mt-4 ${enabled ? "" : "border-red-400 bg-red-50"}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Outbound</p>
            <p className="text-lg font-semibold">{enabled ? "Enabled" : circuit ? "HALTED — spend circuit open" : "HALTED — kill switch"}</p>
          </div>
          <div className="flex gap-2">
            <form action={toggleKillSwitch}>
              <input type="hidden" name="enable" value={enabled || circuit ? "0" : "1"} />
              <button className={enabled ? "btn-danger" : "btn-primary"}>{enabled ? "KILL all outbound" : "Enable outbound"}</button>
            </form>
            {circuit && (
              <form action={resetCircuit}>
                <button className="btn-secondary">Reset spend circuit</button>
              </form>
            )}
          </div>
        </div>
      </section>

      <section className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        <Stat label="Pending jobs" value={h?.pending_jobs} />
        <Stat label="Overdue >15m" value={h?.overdue_jobs} alert={(h?.overdue_jobs ?? 0) > 0} hint="Runner is dead if > 0" />
        <Stat label="Failed" value={h?.failed_jobs} alert={(h?.failed_jobs ?? 0) > 0} />
        <Stat label="Running" value={h?.running_jobs} />
        <Stat label="Sent 24h" value={h?.outbound_24h} />
        <Stat label="Undelivered 24h" value={h?.undelivered_24h} alert={(h?.undelivered_24h ?? 0) > 0} />
        <Stat label="Opt-outs 7d" value={h?.optouts_7d} alert={(h?.optouts_7d ?? 0) > 0} hint="Canary for tone" />
      </section>

      {(stuck.data ?? []).length > 0 && (
        <section className="card mt-6">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Trips with no activity for 3+ days</h2>
          <ul className="mt-2 text-sm">
            {stuck.data!.map((tr) => (
              <li key={tr.id}>
                <a className="underline" href={`/trips/${tr.id}`}>{tr.title}</a> — {tr.status} since {new Date(tr.updated_at).toLocaleDateString()}
              </li>
            ))}
          </ul>
        </section>
      )}

      {(failed.data ?? []).length > 0 && (
        <section className="card mt-6 border-red-200">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-danger">Failed jobs</h2>
          <table className="mt-2 w-full text-xs">
            <tbody>
              {failed.data!.map((j) => (
                <tr key={j.id} className="border-t border-border">
                  <td className="py-1 pr-2 font-mono">{j.job_type}</td>
                  <td className="py-1 pr-2 text-muted">{j.trip_id?.slice(0, 8)}</td>
                  <td className="py-1 pr-2">{j.attempts}×</td>
                  <td className="py-1 pr-2 text-danger">{j.last_error}</td>
                  <td className="py-1">
                    <form action={retryJob}>
                      <input type="hidden" name="job_id" value={j.id} />
                      <button className="btn-secondary px-2 py-0.5 text-xs">Retry</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="card mt-6">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Recent jobs</h2>
        <table className="mt-2 w-full text-xs">
          <thead className="text-left text-muted">
            <tr><th>Run at</th><th>Type</th><th>Status</th><th>Trip</th><th>User</th><th>Attempts</th><th>Error</th></tr>
          </thead>
          <tbody>
            {(jobs.data ?? []).map((j) => (
              <tr key={j.id} className="border-t border-border">
                <td className="py-1 pr-2 whitespace-nowrap">{new Date(j.run_at).toLocaleString("en-GB")}</td>
                <td className="py-1 pr-2 font-mono">{j.job_type}</td>
                <td className={`py-1 pr-2 ${j.status === "failed" ? "text-danger" : j.status === "pending" ? "text-warn" : ""}`}>{j.status}</td>
                <td className="py-1 pr-2 text-muted">{j.trip_id?.slice(0, 8)}</td>
                <td className="py-1 pr-2 text-muted">{j.user_id?.slice(0, 8)}</td>
                <td className="py-1 pr-2">{j.attempts}</td>
                <td className="py-1 text-danger">{j.last_error}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card mt-6">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Message log</h2>
        <table className="mt-2 w-full text-xs">
          <thead className="text-left text-muted">
            <tr><th>When</th><th>Dir</th><th>Channel</th><th>Template</th><th>Status</th><th>Body</th></tr>
          </thead>
          <tbody>
            {(msgs.data ?? []).map((m) => (
              <tr key={m.id} className="border-t border-border align-top">
                <td className="py-1 pr-2 whitespace-nowrap">{new Date(m.created_at).toLocaleString("en-GB")}</td>
                <td className="py-1 pr-2">{m.direction === "inbound" ? "←" : "→"}</td>
                <td className="py-1 pr-2">{m.channel}</td>
                <td className="py-1 pr-2 font-mono">{m.template_key}</td>
                <td className={`py-1 pr-2 ${["failed", "undelivered", "suppressed"].includes(m.status) ? "text-danger" : ""}`}>{m.status}{m.error ? ` (${m.error})` : ""}</td>
                <td className="max-w-md truncate py-1 text-muted" title={m.rendered_body}>{m.rendered_body}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </Shell>
  );
}

/** Server pages are request-scoped; "now" is an input, not render state. */
function staleCutoff(): string {
  return new Date(Date.now() - 3 * 86_400_000).toISOString();
}

function Stat({ label, value, alert, hint }: { label: string; value: number | undefined; alert?: boolean; hint?: string }) {
  return (
    <div className={`card p-3 ${alert ? "border-red-300 bg-red-50" : ""}`} title={hint}>
      <p className="text-xs text-muted">{label}</p>
      <p className="text-xl font-bold">{value ?? "–"}</p>
    </div>
  );
}
