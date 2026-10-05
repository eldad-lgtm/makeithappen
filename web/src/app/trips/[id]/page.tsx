import Link from "next/link";
import { Heatmap } from "@/components/Heatmap";
import { MemberGrid } from "@/components/MemberGrid";
import { RelayCard } from "@/components/RelayCard";
import { Shell } from "@/components/Shell";
import { Timeline } from "@/components/Timeline";
import { activeMembers, invitees, tally } from "@/core/quorum";
import { blockingReason, nudgePhaseFor } from "@/core/state";
import { approveWeb, cancelTrip, extendDeadline, proceedWithout, sendIt } from "../actions";
import { loadTripPage } from "./load";
import { TripNav } from "./TripNav";

export default async function TripDashboard(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const { agg, me, relay, activity, names } = await loadTripPage(id);
  const { trip } = agg;
  const t = tally(agg.members);
  const phase = nudgePhaseFor(trip.status);
  const optionIds = agg.options.map((o) => o.id);
  const pending = phase === "approval" ? t.pending : agg.members.filter((m) => m.approval === "yes" && !optionIds.some((o) => m.votes[o] !== undefined)).length;
  const mine = agg.members.find((m) => m.id === me.id);
  const inviteeCount = invitees(agg.members).length;

  return (
    <Shell userName={me.name}>
      <TripNav trip={trip} isAdmin={me.isAdmin} active="dashboard" />

      {/* The one question: who are we waiting for? */}
      <section className="card flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Right now</p>
          <p className="mt-1 text-lg font-semibold">{blockingReason(trip.status, pending, trip.quorum, t.yes)}</p>
          {trip.responseDeadline && phase && (
            <p className="text-sm text-muted">Deadline {new Date(trip.responseDeadline).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
          )}
          {trip.status === "approval" && (
            <div className="mt-3 h-2 w-64 overflow-hidden rounded-full bg-stone-200">
              <div className="h-full bg-accent" style={{ width: `${Math.min(100, (t.yes / Math.max(1, trip.quorum)) * 100)}%` }} />
            </div>
          )}
        </div>

        {me.isAdmin && (
          <div className="flex flex-wrap gap-2">
            {trip.status === "draft" && (
              <form action={sendIt}>
                <input type="hidden" name="trip_id" value={trip.id} />
                <button className="btn-primary" disabled={inviteeCount < 2 || trip.quorum > inviteeCount} title={inviteeCount < 2 ? "Invite someone first" : undefined}>
                  Send it 🚀
                </button>
              </form>
            )}
            {phase && (
              <>
                <form action={extendDeadline}>
                  <input type="hidden" name="trip_id" value={trip.id} />
                  <button className="btn-secondary">Extend a week</button>
                </form>
                <form action={proceedWithout}>
                  <input type="hidden" name="trip_id" value={trip.id} />
                  <button className="btn-secondary">{phase === "dates" ? "Rank what's in" : "Stop nudging"}</button>
                </form>
              </>
            )}
            {(trip.status === "date_proposed" || trip.status === "date_collection") && agg.options.length > 0 && (
              <Link href={`/trips/${trip.id}/dates`} className="btn-primary">
                Decide dates
              </Link>
            )}
            {trip.status !== "cancelled" && trip.status !== "rejected" && trip.status !== "date_locked" && (
              <form action={cancelTrip}>
                <input type="hidden" name="trip_id" value={trip.id} />
                <button className="btn-danger">Cancel trip</button>
              </form>
            )}
          </div>
        )}
      </section>

      {trip.status === "draft" && me.isAdmin && (
        <p className="mt-3 text-sm text-muted">
          {inviteeCount < 2 ? (
            <>
              Nobody invited yet.{" "}
              <Link href={`/trips/${trip.id}/members`} className="underline">
                Invite friends
              </Link>{" "}
              first.
            </>
          ) : trip.quorum > inviteeCount ? (
            <>Quorum ({trip.quorum}) is higher than the number invited ({inviteeCount}). Lower it on the Members page.</>
          ) : (
            <>Ready. Sending starts the approval round in WhatsApp for {inviteeCount} people and the engine takes over.</>
          )}
        </p>
      )}

      {trip.status === "date_locked" && (
        <section className="card mt-4 border-green-300 bg-green-50">
          <p className="text-xs font-semibold uppercase tracking-wide text-green-800">Locked</p>
          <p className="mt-1 text-2xl font-bold">🗓 {agg.options.find((o) => o.id === trip.lockedOptionId)?.label ?? `${agg.row.locked_start_date} → ${agg.row.locked_end_date}`}</p>
          <p className="text-sm text-green-900">That&rsquo;s a real date. v1 finish line.</p>
        </section>
      )}

      {mine && mine.approval === null && trip.status === "approval" && (
        <section className="card mt-4 border-amber-300 bg-amber-50">
          <p className="font-medium">Are you in?</p>
          <div className="mt-2 flex gap-2">
            <form action={approveWeb}>
              <input type="hidden" name="trip_id" value={trip.id} />
              <input type="hidden" name="decision" value="yes" />
              <button className="btn-primary">I&rsquo;m in 🙌</button>
            </form>
            <form action={approveWeb}>
              <input type="hidden" name="trip_id" value={trip.id} />
              <input type="hidden" name="decision" value="no" />
              <button className="btn-secondary">Can&rsquo;t 😞</button>
            </form>
          </div>
        </section>
      )}

      <div className="mt-6">
        <RelayCard items={relay} tripId={trip.id} />
      </div>

      <section className="mt-6">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
          People · {t.yes} in · {t.no} out · {t.pending} undecided
        </h2>
        <MemberGrid members={agg.members} profiles={agg.profiles} phase={phase} optionIds={optionIds} />
      </section>

      {agg.options.length > 0 && (
        <section className="card mt-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Availability</h2>
            <Link href={`/trips/${trip.id}/dates`} className="text-sm underline">
              Full decision view
            </Link>
          </div>
          <Heatmap options={agg.options} members={activeMembers(agg.members)} quorum={trip.quorum} />
        </section>
      )}

      <section className="card mt-6">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">Timeline</h2>
        <Timeline activity={activity} names={names} />
      </section>

      {trip.description && (
        <section className="mt-6 text-sm text-muted">
          <p className="italic">&ldquo;{trip.description}&rdquo; — {agg.creatorName}</p>
        </section>
      )}
    </Shell>
  );
}
