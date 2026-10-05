"use client";

import { useActionState, useEffect, useRef } from "react";
import { inviteMember, type ActionState } from "../../actions";

export function InviteForm({ tripId }: { tripId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(inviteMember, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="space-y-3">
      <input type="hidden" name="trip_id" value={tripId} />
      <div>
        <label className="label" htmlFor="invite-name">Name (required)</label>
        <input id="invite-name" name="name" required minLength={2} className="input" placeholder="Dani" />
      </div>
      <div>
        <label className="label" htmlFor="invite-phone">Phone</label>
        <div className="flex gap-2">
          <select name="country" className="input w-24" defaultValue="IL" aria-label="Country">
            <option value="IL">+972</option>
            <option value="US">+1</option>
            <option value="GB">+44</option>
            <option value="DE">+49</option>
            <option value="FR">+33</option>
            <option value="ES">+34</option>
            <option value="IT">+39</option>
            <option value="NL">+31</option>
            <option value="GR">+30</option>
          </select>
          <input id="invite-phone" name="phone" type="tel" inputMode="tel" required className="input" placeholder="054 123 4567" />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="essential" /> Essential — trip is pointless without them
      </label>
      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      {state.ok && <p className="text-sm text-accent">Added.</p>}
      <button className="btn-primary w-full" disabled={pending}>
        {pending ? "Adding…" : "Add to trip"}
      </button>
    </form>
  );
}
