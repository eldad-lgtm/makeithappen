"use client";

import { useActionState } from "react";
import { addDateOption, type ActionState } from "../../actions";

export function AddOptionForm({ tripId, min, max }: { tripId: string; min: string; max: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(addDateOption, {});
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="trip_id" value={tripId} />
      <div>
        <label className="label" htmlFor="start">Starts</label>
        <input id="start" name="start" type="date" min={min} max={max} required className="input" />
      </div>
      <button className="btn-secondary" disabled={pending}>
        {pending ? "Adding…" : "Add option"}
      </button>
      {state.error && <p className="w-full text-sm text-danger">{state.error}</p>}
    </form>
  );
}
