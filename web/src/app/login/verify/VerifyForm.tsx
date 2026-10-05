"use client";

import Link from "next/link";
import { useActionState } from "react";
import { verifyOtp, type AuthFormState } from "../actions";

export function VerifyForm({ phone }: { phone: string }) {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(verifyOtp, {});
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="phone" value={phone} />
      <div>
        <label className="label" htmlFor="token">
          6-digit code
        </label>
        <input
          id="token"
          name="token"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]*"
          maxLength={7}
          required
          autoFocus
          className="input text-center text-2xl tracking-[0.5em]"
        />
      </div>
      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      <button className="btn-primary w-full" disabled={pending}>
        {pending ? "Checking…" : "Continue"}
      </button>
      <p className="text-center text-xs text-muted">
        Wrong number? <Link className="underline" href="/login">Start over</Link>
      </p>
    </form>
  );
}
