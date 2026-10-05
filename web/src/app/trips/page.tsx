import Link from "next/link";
import { Shell } from "@/components/Shell";
import { StatusPill } from "@/components/StatusPill";
import { tally } from "@/core/quorum";
import { blockingReason, isTerminal } from "@/core/state";
import type { TripStatus } from "@/core/types";
import { loadTrip } from "@/db/queries";
import { requireUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function TripsPage() {
  const s = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data: rows } = await supabase.from("trips").select("id").order("created_at", { ascending: false });

  const aggs = (await Promise.all((rows ?? []).map((r) => loadTrip(supabase, r.id, "session")))).filter(
    (a): a is NonNullable<typeof a> => a !== null,
  );

  const live = aggs.filter((a) => !isTerminal(a.trip.status) && a.trip.status !== "date_locked");
  const done = aggs.filter((a) => a.trip.status === "date_locked");
  const dead = aggs.filter((a) => isTerminal(a.trip.status));

  return (
    <Shell userName={s.appUser.display_name}>
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold">My trips</h1>
          <p className="text-sm text-muted">What&rsquo;s blocking each one, at a glance.</p>
        </div>
        <Link href="/trips/new" className="btn-primary">
          New trip
        </Link>
      </div>

      {aggs.length === 0 && (
        <div className="card mt-8 text-center">
          <p className="text-lg font-medium">No trips yet.</p>
          <p className="mt-1 text-sm text-muted">Start one. Your friends won&rsquo;t need to install anything.</p>
          <Link href="/trips/new" className="btn-primary mt-4">
            Create your first trip
          </Link>
        </div>
      )}

      <Group title="In motion" aggs={live} />
      <Group title="Locked" aggs={done} />
      <Group title="Didn't happen" aggs={dead} muted />
    </Shell>
  );
}

function Group({ title, aggs, muted }: { title: string; aggs: Awaited<ReturnType<typeof loadTrip>>[]; muted?: boolean }) {
  const list = aggs.filter((a): a is NonNullable<typeof a> => a !== null);
  if (list.length === 0) return null;
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">{title}</h2>
      <ul className="grid gap-3 sm:grid-cols-2">
        {list.map((a) => {
          const t = tally(a.members);
          const pending = a.trip.status === "approval" ? t.pending : a.members.filter((m) => m.approval === "yes" && Object.keys(m.votes).length === 0).length;
          return (
            <li key={a.trip.id} className={`card ${muted ? "opacity-70" : ""}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <Link href={`/trips/${a.trip.id}`} className="text-lg font-semibold hover:underline">
                    {a.trip.title}
                  </Link>
                  <p className="text-sm text-muted">
                    📍 {a.trip.destination} · {a.trip.nights} nights
                  </p>
                </div>
                <StatusPill status={a.trip.status as TripStatus} />
              </div>
              <p className="mt-3 text-sm">{blockingReason(a.trip.status, pending, a.trip.quorum, t.yes)}</p>
              <p className="mt-1 text-xs text-muted">
                {t.yes} in · {t.no} out · {t.pending} undecided · {t.invited} invited
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
