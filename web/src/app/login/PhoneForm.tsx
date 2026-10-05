"use client";

import { useActionState } from "react";
import { requestOtp, type AuthFormState } from "./actions";

const COUNTRIES = [
  ["IL", "🇮🇱 +972"],
  ["US", "🇺🇸 +1"],
  ["GB", "🇬🇧 +44"],
  ["DE", "🇩🇪 +49"],
  ["FR", "🇫🇷 +33"],
  ["ES", "🇪🇸 +34"],
  ["IT", "🇮🇹 +39"],
  ["NL", "🇳🇱 +31"],
  ["GR", "🇬🇷 +30"],
] as const;

export function PhoneForm() {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(requestOtp, {});
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label" htmlFor="phone">
          Phone number
        </label>
        <div className="flex gap-2">
          <select name="country" className="input w-32" defaultValue="IL" aria-label="Country">
            {COUNTRIES.map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
          <input
            id="phone"
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            required
            placeholder="054 123 4567"
            className="input"
          />
        </div>
      </div>
      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      <button className="btn-primary w-full" disabled={pending}>
        {pending ? "Sending…" : "Text me a code"}
      </button>
      <p className="text-xs text-muted">
        By continuing you agree to the <a className="underline" href="/legal/terms">Terms</a> and{" "}
        <a className="underline" href="/legal/privacy">Privacy Policy</a>.
      </p>
    </form>
  );
}
