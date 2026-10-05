import { Heatmap } from "@/components/Heatmap";
import { Shell } from "@/components/Shell";
import { explain, rankOptions } from "@/core/dates";
import { activeMembers } from "@/core/quorum";
import { lockDates, voteWeb } from "../../actions";
import { loadTripPage } from "../load";
import { TripNav } from "../TripNav";
import { AddOptionForm } from "./AddOptionForm";

export default async function DatesPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const { agg, me } = await loadTripPage(id);
  const { trip } = agg;
  const active = activeMembers(agg.members);
  const ranked = rankOptions(agg.options, active, trip.quorum);
  const canLock = me.isAdmin && (trip.status === "date_proposed" || trip.status === "date_collection");
  const mine = agg.members.find((m) => m.id === me.id);
  const canVote = mine?.approval === "yes" && (trip.status === "date_collection" || trip.status === "date_proposed");

  return (
    <Shell userName={me.name}>
      <TripNav trip={trip} isAdmin={me.isAdmin} active="dates" />

      {agg.options.length === 0 ? (
        <div className="card">
          <p className="font-medium">No date options yet.</p>
          <p className="text-sm text-muted">Options are generated automatically when the trip is approved. Admins can add windows below once that happens.</p>
        </div>
      ) : (
        <>
          <section className="space-y-3">
            {ranked.map((s, i) => {
              const medal = ["🥇", "🥈", "🥉"][i] ?? "•";
              return (
                <div key={s.option.id} className={`card flex flex-wrap items-center gap-4 ${s.eligible ? "" : "opacity-60"} ${trip.lockedOptionId === s.option.id ? "border-green-400 bg-green-50" : ""}`}>
                  <div className="text-2xl">{medal}</div>
                  <div className="min-w-0 flex-1">
                    <p className="text-lg font-semibold">{s.option.label}</p>
                    <p className="text-sm text-muted">{explain(s, active.length)}</p>
                    <p className="text-xs text-muted">
                      {s.yes} yes · {s.maybe} maybe · {s.no} no · {active.length - s.responded} not answered
                      {s.option.generatedBy !== "system" && " · added manually"}
                    </p>
                  </div>
                  {canVote && (
                    <div className="flex gap-1">
                      {(["yes", "maybe", "no"] as const).map((pref) => (
                        <form key={pref} action={voteWeb}>
                          <input type="hidden" name="trip_id" value={trip.id} />
                          <input type="hidden" name="option_id" value={s.option.id} />
                          <input type="hidden" name="pref" value={pref} />
                          <button className={`btn-secondary px-2 py-1 text-xs ${mine?.votes[s.option.id] === pref ? "border-accent ring-2 ring-green-100" : ""}`}>
                            {pref}
                          </button>
                        </form>
                      ))}
                    </div>
                  )}
                  {canLock && s.eligible && (
                    <form action={lockDates}>
                      <input type="hidden" name="trip_id" value={trip.id} />
                      <input type="hidden" name="option_id" value={s.option.id} />
                      <button className="btn-primary">Lock {s.option.label}</button>
                    </form>
                  )}
                  {trip.lockedOptionId === s.option.id && <span className="pill border-green-400 bg-green-100 text-green-900">locked</span>}
                </div>
              );
            })}
          </section>

          <section className="card mt-6">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">Everyone&rsquo;s answers</h2>
            <Heatmap options={agg.options} members={active} quorum={trip.quorum} />
          </section>
        </>
      )}

      {me.isAdmin && (trip.status === "date_collection" || trip.status === "date_proposed") && (
        <section className="card mt-6">
          <h2 className="font-semibold">Add a window</h2>
          <p className="mb-3 text-xs text-muted">A {trip.nights}-night window inside {trip.windowStart} → {trip.windowEnd}.</p>
          <AddOptionForm tripId={trip.id} min={trip.windowStart} max={trip.windowEnd} />
        </section>
      )}
    </Shell>
  );
}
