"use client";

import { useActionState } from "react";
import { EscalationPicker } from "@/components/EscalationPicker";
import type { Trip } from "@/core/types";
import { updateTripSettings, type ActionState } from "../../actions";

export function SettingsForm({ trip }: { trip: Trip }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(updateTripSettings, {});
  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="trip_id" value={trip.id} />
      <div>
        <label className="label" htmlFor="description">Description — shown to everyone</label>
        <textarea id="description" name="description" rows={2} defaultValue={trip.description} className="input" />
      </div>
      <EscalationPicker mode={trip.escalationMode} push={trip.pushLevel} destination={trip.destination} />
      <p className="text-xs text-muted">
        Changes apply to the next nudge. Switching to <strong>none</strong> drops any callout waiting for your tap.
      </p>
      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      {state.ok && <p className="text-sm text-accent">Saved.</p>}
      <div className="flex justify-end">
        <button className="btn-primary" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}
