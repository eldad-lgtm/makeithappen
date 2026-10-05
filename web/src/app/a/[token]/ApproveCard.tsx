"use client";

import { useActionState } from "react";
import { tokenApprove, type TokenActionState } from "./actions";

export function ApproveCard({ token, description, inviter, current }: { token: string; description: string; inviter: string; current: "yes" | "no" | null }) {
  const [state, action, pending] = useActionState<TokenActionState, FormData>(tokenApprove, {});

  if (state.done) {
    return (
      <div className="card text-center">
        <p className="text-3xl">{state.done === "yes" ? "🙌" : "😞"}</p>
        <p className="mt-2 text-lg font-semibold">{state.done === "yes" ? "You're in." : "No worries, you're out."}</p>
        <p className="text-sm text-muted">{state.done === "yes" ? "We'll ping you about dates once it's real." : "We won't message you about this trip again."}</p>
      </div>
    );
  }

  return (
    <div className="card">
      {description && <p className="italic">&ldquo;{description}&rdquo; — {inviter}</p>}
      {current && <p className="mt-2 text-xs text-muted">You said {current === "yes" ? "you're in" : "you can't"}. You can change that until dates are locked.</p>}
      <p className="mt-4 text-lg font-semibold">Are you in?</p>
      <form action={action} className="mt-3 grid grid-cols-2 gap-2">
        <input type="hidden" name="token" value={token} />
        <button name="decision" value="yes" className="btn-primary py-3 text-base" disabled={pending}>I&rsquo;m in 🙌</button>
        <button name="decision" value="no" className="btn-secondary py-3 text-base" disabled={pending}>Can&rsquo;t 😞</button>
      </form>
      {state.error && <p className="mt-3 text-sm text-danger">{state.error}</p>}
    </div>
  );
}
