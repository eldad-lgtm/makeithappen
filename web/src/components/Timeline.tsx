import type { TripActivityRow } from "@/db/database.types";

const LABEL: Record<string, (p: Record<string, unknown>, who: string) => string> = {
  transition: (p) => `Moved from ${p.from} to ${p.to}`,
  member_invited: (p, who) => `${who} invited ${p.name}`,
  approval: (p, who) => `${who} said ${p.decision === "yes" ? "I'm in" : "can't"}${p.late ? " (late arrival)" : ""}${p.changed ? " (changed)" : ""}`,
  vote: (p, who) => `${who} voted ${p.pref} on ${p.label}`,
  calendar: (_p, who) => `${who} marked their calendar`,
  nudge: (p) => `Nudge level ${p.level} sent (${p.target})`,
  callout_queued: (p) => `Group callout level ${p.level} queued for admin`,
  callout_sent: (p, who) => `${who} sent the level ${p.level} callout`,
  callout_expired: (p) => `${p.count} stale callout(s) dropped`,
  callout: (p) => `Group callout level ${p.level} posted`,
  admin_escalation: (p) => `Admin asked: proceed or extend? (waiting on ${p.ghosts})`,
  locked: (p, who) => `${p.auto ? "Auto-locked" : `${who} locked`} ${p.label}`,
  deadline_extended: (p, who) => `${who} extended the deadline by ${p.days} days`,
  proceed_without: (_p, who) => `${who} chose to proceed without stragglers`,
  nudges_stopped: (_p, who) => `${who} stopped the nudges`,
  undelivered: () => `A WhatsApp message was undelivered`,
  relay_switch_offered: () => `Offered to switch callouts off`,
  quorum_everyone: () => `Quorum set to “everyone invited”`,
};

export function Timeline({ activity, names }: { activity: TripActivityRow[]; names: Map<string, string> }) {
  if (activity.length === 0) return <p className="text-sm text-muted">Nothing yet.</p>;
  return (
    <ol className="space-y-2">
      {activity.map((a) => {
        const who = a.actor_user_id ? (names.get(a.actor_user_id) ?? "Someone") : "Engine";
        const p = (a.payload ?? {}) as Record<string, unknown>;
        const text = LABEL[a.kind]?.(p, who) ?? `${a.kind}`;
        return (
          <li key={a.id} className="flex gap-3 text-sm">
            <time className="w-28 shrink-0 text-xs text-muted" dateTime={a.created_at}>
              {new Date(a.created_at).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
            </time>
            <span>{text}</span>
          </li>
        );
      })}
    </ol>
  );
}
