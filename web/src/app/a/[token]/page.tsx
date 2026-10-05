import { resolveToken, trusted } from "@/db/token-scope/client";
import { loadTrip } from "@/db/queries";
import { rankOptions, explain as explainOption } from "@/core/dates";
import { activeMembers, tally } from "@/core/quorum";
import { ApproveCard } from "./ApproveCard";
import { AvailabilityCard } from "./AvailabilityCard";

/**
 * No-login action page (§7.6). The token identifies ONE user in ONE trip.
 * We try each scope in turn; the first valid one decides what renders.
 */
export default async function ActionPage(props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params;

  for (const scope of ["approve", "availability", "view"] as const) {
    const r = await resolveToken(token, scope);
    if (!r.ok) continue;
    const t = trusted(r.token.principal);
    const agg = await loadTrip(t.db, r.token.principal.tripId, "service");
    if (!agg) break;
    const me = agg.members.find((m) => m.id === r.token.principal.userId);
    if (!me) break;
    const tl = tally(agg.members);

    return (
      <Frame title={agg.trip.title} subtitle={`📍 ${agg.trip.destination} · ${agg.trip.nights} nights · ${tl.yes} of ${agg.trip.quorum} in`} who={me.name}>
        {scope === "approve" && <ApproveCard token={token} description={agg.trip.description} inviter={agg.creatorName} current={me.approval} />}
        {scope === "availability" && (
          <AvailabilityCard
            token={token}
            windowStart={agg.trip.windowStart}
            windowEnd={agg.trip.windowEnd}
            nights={agg.trip.nights}
            options={agg.options}
            myVotes={me.votes}
            myBlackouts={agg.blackouts.filter((b) => b.userId === me.id).map((b) => ({ start: b.start, end: b.end }))}
          />
        )}
        {scope === "view" && (
          <div className="card">
            <p className="text-sm text-muted">Where things stand</p>
            {agg.trip.status === "date_locked" ? (
              <p className="mt-2 text-xl font-bold">🔒 {agg.options.find((o) => o.id === agg.trip.lockedOptionId)?.label}</p>
            ) : (
              <ul className="mt-2 space-y-1 text-sm">
                {rankOptions(agg.options, activeMembers(agg.members), agg.trip.quorum).slice(0, 3).map((s) => (
                  <li key={s.option.id}>
                    <strong>{s.option.label}</strong> — {explainOption(s, activeMembers(agg.members).length)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Frame>
    );
  }

  return (
    <Frame title="This link isn't valid" subtitle="It may have expired, or the trip has moved on.">
      <div className="card text-sm text-muted">Reply to the WhatsApp message instead, or ask the organizer for a fresh link.</div>
    </Frame>
  );
}

function Frame({ title, subtitle, who, children }: { title: string; subtitle: string; who?: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-md px-4 py-8">
      <p className="text-xs font-semibold uppercase tracking-widest text-accent">MakeItHappen</p>
      <h1 className="mt-1 text-2xl font-bold">{title}</h1>
      <p className="text-sm text-muted">{subtitle}</p>
      {who && <p className="mt-1 text-xs text-muted">Answering as {who}. No account needed.</p>}
      <div className="mt-6">{children}</div>
      <p className="mt-8 text-center text-xs text-muted">
        <a className="underline" href="/legal/privacy">Privacy</a> · Reply STOP in WhatsApp to opt out of everything.
      </p>
    </main>
  );
}
