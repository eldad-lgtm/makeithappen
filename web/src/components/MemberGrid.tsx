import type { Member, Phase } from "@/core/types";
import type { MemberProfile } from "@/db/database.types";

/** Who are we waiting for? Answer in under two seconds (§8). */
export function MemberGrid({
  members,
  profiles,
  phase,
  optionIds,
}: {
  members: Member[];
  profiles: MemberProfile[];
  phase: Phase | null;
  optionIds: string[];
}) {
  const byId = new Map(profiles.map((p) => [p.user_id, p]));
  const visible = members.filter((m) => m.status !== "removed");

  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
      {visible.map((m) => {
        const p = byId.get(m.id);
        const st = stateFor(m, phase, optionIds);
        return (
          <li key={m.id} className={`rounded-lg border p-3 ${st.cls}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{m.name}</p>
                <p className="text-xs text-muted">•••• {p?.phone_last4 ?? "????"}</p>
              </div>
              <span className="text-lg leading-none" title={st.label}>
                {st.icon}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {m.role === "admin" && <span className="pill border-stone-300 bg-white">admin</span>}
              {m.isEssential && <span className="pill border-amber-300 bg-amber-50 text-amber-800">essential</span>}
              {p?.is_provisional && <span className="pill border-stone-200 bg-stone-50 text-muted">WhatsApp only</span>}
              {m.optedOut && <span className="pill border-red-200 bg-red-50 text-danger">opted out</span>}
            </div>
            <p className="mt-2 text-xs text-muted">{st.label}</p>
          </li>
        );
      })}
    </ul>
  );
}

function stateFor(m: Member, phase: Phase | null, optionIds: string[]) {
  if (m.approval === "no") return { icon: "😞", label: "Can't make it", cls: "border-stone-200 bg-stone-50 opacity-70" };
  if (phase === "approval" || phase === null) {
    if (m.approval === "yes") return { icon: "✅", label: "In", cls: "border-green-200 bg-green-50" };
    return { icon: "⏳", label: "Waiting for yes/no", cls: "border-amber-200 bg-amber-50" };
  }
  // dates
  if (m.approval !== "yes") return { icon: "⏳", label: "Hasn't said yes yet", cls: "border-stone-200 bg-stone-50" };
  const voted = optionIds.filter((id) => m.votes[id] !== undefined).length;
  if (optionIds.length > 0 && voted === optionIds.length) return { icon: "✅", label: "Dates in", cls: "border-green-200 bg-green-50" };
  if (voted > 0) return { icon: "🟡", label: `${voted}/${optionIds.length} windows answered`, cls: "border-sky-200 bg-sky-50" };
  return { icon: "⏳", label: "Waiting for dates", cls: "border-amber-200 bg-amber-50" };
}
