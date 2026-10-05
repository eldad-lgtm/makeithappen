"use client";

import { useActionState, useState } from "react";
import { createTrip, type ActionState } from "../actions";
import { EscalationPicker } from "@/components/EscalationPicker";

export function NewTripForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(createTrip, {});
  const [destination, setDestination] = useState("Athens");
  const today = new Date();
  const defaultStart = iso(new Date(today.getFullYear(), today.getMonth() + 2, 1));
  const defaultEnd = iso(new Date(today.getFullYear(), today.getMonth() + 3, 0));

  return (
    <form action={action} className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="title">Title</label>
          <input id="title" name="title" required className="input" placeholder="Athens Boys Trip" />
        </div>
        <div>
          <label className="label" htmlFor="destination">Destination</label>
          <input id="destination" name="destination" required className="input" placeholder="Athens, Greece" value={destination} onChange={(e) => setDestination(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="nights">Nights</label>
          <input id="nights" name="nights" type="number" min={1} max={30} defaultValue={3} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="deadline_days">Response deadline (days)</label>
          <input id="deadline_days" name="deadline_days" type="number" min={1} max={60} defaultValue={7} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="window_start">Window starts</label>
          <input id="window_start" name="window_start" type="date" required defaultValue={defaultStart} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="window_end">Window ends</label>
          <input id="window_end" name="window_end" type="date" required defaultValue={defaultEnd} className="input" />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="description">Description — shown to everyone</label>
          <textarea id="description" name="description" rows={2} className="input" placeholder="Gyros, ruins, and one questionable decision. Same as always." />
        </div>
        <div>
          <label className="label" htmlFor="quorum">Approval quorum</label>
          <input id="quorum" name="quorum" type="number" min={1} className="input" placeholder="Everyone invited" />
          <p className="mt-1 text-xs text-muted">How many yes-votes make this real. Leave blank for everyone.</p>
        </div>
      </section>

      <EscalationPicker mode="relay" push="standard" destination={destination || "Athens"} />

      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      <div className="flex justify-end">
        <button className="btn-primary" disabled={pending}>
          {pending ? "Creating…" : "Next: invite friends"}
        </button>
      </div>
    </form>
  );
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}
