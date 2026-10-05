import { relayDismiss, relayMarkSent } from "@/app/trips/actions";
import { waShareLink } from "@/channels/deeplink";
import type { RelayQueueRow } from "@/db/database.types";
import { CopyButton } from "./CopyButton";

/**
 * The admin's whole job in one tap (§7.3, §8): the finished callout, a copy
 * button, a share link that opens WhatsApp's share sheet, and dismiss.
 */
export function RelayCard({ items, tripId }: { items: RelayQueueRow[]; tripId: string }) {
  if (items.length === 0) return null;
  return (
    <section id="relay" className="card border-amber-300 bg-amber-50">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-amber-800">📣 Callout ready for your group</h2>
      <p className="mt-1 text-sm text-amber-900">
        We wrote it. You send it — into the group that actually has the inside jokes. Expires if left too long; stale
        peer pressure is worse than none.
      </p>
      <ul className="mt-4 space-y-4">
        {items.map((r) => (
          <li key={r.id} className="rounded-lg border border-amber-200 bg-white p-4">
            <pre className="whitespace-pre-wrap font-sans text-sm">{r.rendered_body}</pre>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <a className="btn-primary" href={waShareLink(r.rendered_body)} target="_blank" rel="noreferrer">
                Open in WhatsApp
              </a>
              <CopyButton text={r.rendered_body} />
              <form action={relayMarkSent}>
                <input type="hidden" name="relay_id" value={r.id} />
                <input type="hidden" name="trip_id" value={tripId} />
                <button className="btn-secondary">I sent it</button>
              </form>
              <form action={relayDismiss}>
                <input type="hidden" name="relay_id" value={r.id} />
                <input type="hidden" name="trip_id" value={tripId} />
                <button className="btn-secondary text-muted">Skip this one</button>
              </form>
              <span className="ml-auto text-xs text-muted">
                Level {r.level} · expires {new Date(r.expires_at).toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
