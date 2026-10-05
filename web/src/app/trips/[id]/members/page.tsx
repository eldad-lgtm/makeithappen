import { Shell } from "@/components/Shell";
import { invitees } from "@/core/quorum";
import { updateMember, updateQuorum } from "../../actions";
import { loadTripPage } from "../load";
import { TripNav } from "../TripNav";
import { InviteForm } from "./InviteForm";

export default async function MembersPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const { agg, me } = await loadTripPage(id);
  const { trip } = agg;
  const byId = new Map(agg.profiles.map((p) => [p.user_id, p]));
  const list = agg.members.filter((m) => m.status !== "removed");
  const inviteeCount = invitees(agg.members).length;

  return (
    <Shell userName={me.name}>
      <TripNav trip={trip} isAdmin={me.isAdmin} active="members" />

      <div className="grid gap-6 md:grid-cols-[1fr_320px]">
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
            {list.length} people · needs {trip.quorum} yes
          </h2>
          <ul className="divide-y divide-border rounded-xl border border-border bg-card">
            {list.map((m) => {
              const p = byId.get(m.id);
              return (
                <li key={m.id} className="flex flex-wrap items-center gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {m.name} {m.id === me.id && <span className="text-xs text-muted">(you)</span>}
                    </p>
                    <p className="text-xs text-muted">
                      •••• {p?.phone_last4} · {p?.is_provisional ? "WhatsApp only" : "has an account"} · {p?.timezone}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {m.role === "admin" && <span className="pill border-stone-300 bg-stone-50">admin</span>}
                    {m.isEssential && <span className="pill border-amber-300 bg-amber-50 text-amber-800">essential</span>}
                    {m.approval === "yes" && <span className="pill border-green-300 bg-green-50 text-green-800">in</span>}
                    {m.approval === "no" && <span className="pill border-red-200 bg-red-50 text-danger">out</span>}
                    {m.optedOut && <span className="pill border-red-200 bg-red-50 text-danger">opted out</span>}
                  </div>
                  {me.isAdmin && (
                    <div className="flex gap-1">
                      <Op tripId={trip.id} userId={m.id} op={m.isEssential ? "unessential" : "essential"} label={m.isEssential ? "Not essential" : "Essential"} />
                      {m.id !== me.id && <Op tripId={trip.id} userId={m.id} op={m.role === "admin" ? "demote" : "promote"} label={m.role === "admin" ? "Demote" : "Make admin"} />}
                      {m.id !== me.id && <Op tripId={trip.id} userId={m.id} op="remove" label="Remove" danger />}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-xs text-muted">
            <strong>Essential</strong> members are people without whom the trip is pointless — their &ldquo;no&rdquo; on a date rules it out
            entirely (§6.3). Phone numbers are only ever shown as the last four digits.
          </p>
        </section>

        <aside className="space-y-4">
          {me.isAdmin && trip.status === "draft" && (
            <>
              <div className="card">
                <h3 className="font-semibold">Invite by phone</h3>
                <p className="mb-3 text-xs text-muted">They&rsquo;ll get a WhatsApp message when you hit Send. A name is required.</p>
                <InviteForm tripId={trip.id} />
              </div>
              <div className="card">
                <h3 className="font-semibold">Quorum</h3>
                <form action={updateQuorum} className="mt-2 flex gap-2">
                  <input type="hidden" name="trip_id" value={trip.id} />
                  <input name="quorum" type="number" min={1} max={Math.max(1, inviteeCount)} defaultValue={trip.quorum} className="input" />
                  <button className="btn-secondary">Save</button>
                </form>
                <p className="mt-1 text-xs text-muted">{inviteeCount} invited so far.</p>
              </div>
            </>
          )}
          {me.isAdmin && trip.status !== "draft" && (
            <div className="card">
              <h3 className="font-semibold">Late invites</h3>
              <p className="mb-3 text-xs text-muted">
                You can still add people. {trip.status === "approval" ? "They'll get the approval ask on the next engine tick." : "They'll be asked for dates once they say yes."}
              </p>
              <InviteForm tripId={trip.id} />
            </div>
          )}
        </aside>
      </div>
    </Shell>
  );
}

function Op({ tripId, userId, op, label, danger }: { tripId: string; userId: string; op: string; label: string; danger?: boolean }) {
  return (
    <form action={updateMember}>
      <input type="hidden" name="trip_id" value={tripId} />
      <input type="hidden" name="user_id" value={userId} />
      <input type="hidden" name="op" value={op} />
      <button className={`${danger ? "btn-danger" : "btn-secondary"} px-2 py-1 text-xs`}>{label}</button>
    </form>
  );
}
