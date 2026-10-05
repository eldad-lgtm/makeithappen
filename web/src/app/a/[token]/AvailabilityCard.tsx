"use client";

import { useActionState, useMemo, useState } from "react";
import { addDays, parseISO } from "@/core/dates";
import type { DateOption, Pref } from "@/core/types";
import { tokenSubmitAvailability, type TokenActionState } from "./actions";

/**
 * Paint a calendar: tap days you CAN'T do. Also answer the proposed windows
 * directly. Blackouts auto-derive a "no" on overlapping windows (§5.2).
 */
export function AvailabilityCard(props: {
  token: string;
  windowStart: string;
  windowEnd: string;
  nights: number;
  options: DateOption[];
  myVotes: Record<string, Pref>;
  myBlackouts: { start: string; end: string }[];
}) {
  const [state, action, pending] = useActionState<TokenActionState, FormData>(tokenSubmitAvailability, {});
  const [blocked, setBlocked] = useState<Set<string>>(() => expand(props.myBlackouts));
  const [votes, setVotes] = useState<Record<string, Pref>>(props.myVotes);

  const days = useMemo(() => allDays(props.windowStart, props.windowEnd), [props.windowStart, props.windowEnd]);
  const months = useMemo(() => groupByMonth(days), [days]);

  if (state.done) {
    return (
      <div className="card text-center">
        <p className="text-3xl">🙏</p>
        <p className="mt-2 text-lg font-semibold">Dates saved.</p>
        <p className="text-sm text-muted">You&rsquo;ll hear from us when they&rsquo;re locked.</p>
      </div>
    );
  }

  const toggle = (iso: string) => {
    const next = new Set(blocked);
    if (next.has(iso)) next.delete(iso);
    else next.add(iso);
    setBlocked(next);
  };

  const ranges = collapse([...blocked].sort());

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={props.token} />
      <input type="hidden" name="blackouts" value={JSON.stringify(ranges)} />
      <input type="hidden" name="votes" value={JSON.stringify(Object.entries(votes).map(([optionId, pref]) => ({ optionId, pref })))} />

      {props.options.length > 0 && (
        <div className="card">
          <p className="font-semibold">Proposed {props.nights}-night windows</p>
          <ul className="mt-2 space-y-2">
            {props.options.map((o) => {
              const derivedNo = overlapsBlocked(o, blocked);
              const v = votes[o.id] ?? (derivedNo ? "no" : undefined);
              return (
                <li key={o.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className={derivedNo ? "text-muted line-through" : ""}>{o.label}</span>
                  <span className="flex gap-1">
                    {(["yes", "maybe", "no"] as const).map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setVotes({ ...votes, [o.id]: p })}
                        className={`rounded-md border px-2 py-1 text-xs ${v === p ? (p === "yes" ? "border-green-500 bg-green-500 text-white" : p === "no" ? "border-red-400 bg-red-400 text-white" : "border-amber-300 bg-amber-300") : "border-border bg-card"}`}
                      >
                        {p}
                      </button>
                    ))}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="card">
        <p className="font-semibold">Tap the days you can&rsquo;t travel</p>
        <p className="text-xs text-muted">Weddings, exams, work trips. Everything else counts as available.</p>
        {months.map((m) => (
          <div key={m.key} className="mt-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">{m.label}</p>
            <div className="mt-1 grid grid-cols-7 gap-1 text-center text-xs">
              {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
                <span key={i} className="text-muted">{d}</span>
              ))}
              {Array.from({ length: m.leading }).map((_, i) => (
                <span key={`pad-${i}`} />
              ))}
              {m.days.map((iso) => {
                const isBlocked = blocked.has(iso);
                const dow = parseISO(iso).getUTCDay();
                return (
                  <button
                    key={iso}
                    type="button"
                    onClick={() => toggle(iso)}
                    className={`aspect-square rounded-md border text-sm ${isBlocked ? "border-red-400 bg-red-400 text-white" : dow === 0 || dow === 6 ? "border-border bg-stone-50" : "border-border bg-card"}`}
                    aria-pressed={isBlocked}
                  >
                    {Number(iso.slice(8, 10))}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      <button className="btn-primary w-full py-3 text-base" disabled={pending}>
        {pending ? "Saving…" : `Save my dates${blocked.size ? ` (${blocked.size} blocked)` : ""}`}
      </button>
    </form>
  );
}

function allDays(start: string, end: string): string[] {
  const out: string[] = [];
  let c = start;
  while (c <= end) {
    out.push(c);
    c = addDays(c, 1);
  }
  return out;
}

function groupByMonth(days: string[]) {
  const map = new Map<string, string[]>();
  for (const d of days) {
    const k = d.slice(0, 7);
    map.set(k, [...(map.get(k) ?? []), d]);
  }
  return [...map.entries()].map(([key, ds]) => {
    const first = parseISO(ds[0]);
    const leading = (first.getUTCDay() + 6) % 7; // Monday-first
    return { key, label: first.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }), days: ds, leading };
  });
}

function expand(ranges: { start: string; end: string }[]): Set<string> {
  const s = new Set<string>();
  for (const r of ranges) for (const d of allDays(r.start, r.end)) s.add(d);
  return s;
}

function collapse(sorted: string[]): { start: string; end: string }[] {
  const out: { start: string; end: string }[] = [];
  for (const d of sorted) {
    const last = out[out.length - 1];
    if (last && addDays(last.end, 1) === d) last.end = d;
    else out.push({ start: d, end: d });
  }
  return out;
}

function overlapsBlocked(o: DateOption, blocked: Set<string>): boolean {
  for (const d of allDays(o.start, o.end)) if (blocked.has(d)) return true;
  return false;
}
