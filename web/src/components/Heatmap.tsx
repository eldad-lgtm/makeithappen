import { explain, rankOptions } from "@/core/dates";
import type { DateOption, Member } from "@/core/types";

const CELL: Record<string, string> = {
  yes: "bg-green-500 text-white",
  maybe: "bg-amber-300 text-amber-900",
  no: "bg-red-400 text-white",
  none: "bg-stone-100 text-stone-400",
};

/** Options × members. Never shows a raw score — the sentence is the product (§6.5). */
export function Heatmap({ options, members, quorum }: { options: DateOption[]; members: Member[]; quorum: number }) {
  if (options.length === 0) return <p className="text-sm text-muted">No date options yet.</p>;
  const ranked = rankOptions(options, members, quorum);
  const total = members.length;

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-1 text-xs">
        <thead>
          <tr>
            <th className="text-left font-medium text-muted">Window</th>
            {members.map((m) => (
              <th key={m.id} className="max-w-14 truncate font-medium text-muted" title={m.name}>
                {m.name.split(" ")[0]}
              </th>
            ))}
            <th className="text-left font-medium text-muted">Verdict</th>
          </tr>
        </thead>
        <tbody>
          {ranked.map((s, i) => (
            <tr key={s.option.id}>
              <td className="whitespace-nowrap pr-2 font-medium">
                {i === 0 && s.eligible ? "🥇 " : ""}
                {s.option.label}
              </td>
              {members.map((m) => {
                const v = m.votes[s.option.id] ?? "none";
                return (
                  <td key={m.id} className={`h-7 min-w-7 rounded text-center ${CELL[v]}`} title={`${m.name}: ${v}`}>
                    {v === "yes" ? "✓" : v === "no" ? "✕" : v === "maybe" ? "~" : ""}
                  </td>
                );
              })}
              <td className={`pl-2 ${s.eligible ? "" : "text-muted"}`}>{explain(s, total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
