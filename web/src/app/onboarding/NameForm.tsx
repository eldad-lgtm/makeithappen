"use client";

import { useActionState } from "react";
import { completeOnboarding, type OnboardingState } from "./actions";
import { TIMEZONES } from "@/lib/timezones";

export function NameForm({ suggested, timezone }: { suggested: string; timezone: string }) {
  const [state, action, pending] = useActionState<OnboardingState, FormData>(completeOnboarding, {});
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label" htmlFor="name">
          Display name
        </label>
        <input id="name" name="name" required minLength={2} maxLength={40} defaultValue={suggested} className="input" autoFocus />
      </div>
      <div>
        <label className="label" htmlFor="timezone">
          Timezone
        </label>
        <select id="timezone" name="timezone" className="input" defaultValue={timezone}>
          {TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-muted">So we never message you at 4am. Quiet hours are 22:00–08:00 your time.</p>
      </div>
      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      <button className="btn-primary w-full" disabled={pending}>
        {pending ? "Saving…" : "Let's go"}
      </button>
    </form>
  );
}
