import { PUSH_LEVELS } from "@/core/nudge";
import type { EscalationMode, PushLevel } from "@/core/types";
import { render } from "@/messages/render";

/**
 * Escalation mode + push level, with a sample callout so a first-time admin
 * knows what they're agreeing to (PLAN.md §15 Q2).
 */
export function EscalationPicker({
  mode,
  push,
  destination = "Athens",
}: {
  mode: EscalationMode;
  push: PushLevel;
  destination?: string;
}) {
  const sample = render(
    "nudge.standard.group.3",
    { destination, tripTitle: `${destination} trip`, answered: "Eldad, Noa, Tomer", answeredCount: 6, total: 8, ghosts: "Dani and Yossi" },
    { footer: false },
  ).body;

  return (
    <div className="space-y-4">
      <fieldset>
        <legend className="label">If someone ghosts, where do public callouts go?</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          <Radio name="escalation_mode" value="relay" checked={mode === "relay"} title="Relay (default)" hint="We write the callout; you paste it into your existing group in one tap." />
          <Radio name="escalation_mode" value="none" checked={mode === "none"} title="None" hint="No public naming. Firmer private nudges instead." />
          <Radio name="escalation_mode" value="managed" checked={mode === "managed"} title="Managed" hint="Bot posts in a group it creates. Phase 2 — needs a verified business; falls back to relay." />
        </div>
      </fieldset>

      <fieldset>
        <legend className="label">How hard should we push?</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {PUSH_LEVELS.map((p) => (
            <Radio key={p.id} name="push_level" value={p.id} checked={push === p.id} title={p.label} hint={p.hint} />
          ))}
        </div>
      </fieldset>

      <details className="rounded-lg border border-border bg-stone-50 p-3 text-sm">
        <summary className="cursor-pointer font-medium">See a sample group callout (level 3, standard)</summary>
        <pre className="mt-2 whitespace-pre-wrap font-sans text-sm text-muted">{sample}</pre>
        <p className="mt-2 text-xs text-muted">
          Members can see the mode you picked in the trip details, so nobody is called out by a system they didn&rsquo;t know
          was watching.
        </p>
      </details>
    </div>
  );
}

function Radio({ name, value, checked, title, hint }: { name: string; value: string; checked: boolean; title: string; hint: string }) {
  return (
    <label className="flex cursor-pointer gap-2 rounded-lg border border-border bg-card p-3 has-[:checked]:border-accent has-[:checked]:ring-2 has-[:checked]:ring-green-100">
      <input type="radio" name={name} value={value} defaultChecked={checked} className="mt-1" />
      <span>
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-muted">{hint}</span>
      </span>
    </label>
  );
}
