"use server";

import { resolveToken, trusted } from "@/db/token-scope/client";
import { recordApproval, recordBlackouts } from "@/engine/trip";
import { captureException } from "@/observability/log";

/**
 * Token-path actions. Validate first, act second — every call re-resolves the
 * raw token and acts only within the (trip, user, scope) it names (§7.6).
 */

export interface TokenActionState {
  error?: string;
  done?: "yes" | "no" | "availability";
}

export async function tokenApprove(_prev: TokenActionState, formData: FormData): Promise<TokenActionState> {
  const raw = String(formData.get("token") ?? "");
  const decision = String(formData.get("decision")) === "yes" ? "yes" : "no";
  const r = await resolveToken(raw, "approve");
  if (!r.ok) return { error: explain(r.reason) };
  try {
    const t = trusted(r.token.principal);
    const res = await recordApproval(t, r.token.principal.tripId, r.token.principal.userId, decision);
    if (!res.accepted) return { error: res.reason ?? "Couldn't record that." };
    return { done: decision };
  } catch (e) {
    captureException(e, { tripId: r.token.principal.tripId });
    return { error: "Something went wrong. Try the buttons in WhatsApp." };
  }
}

export async function tokenSubmitAvailability(_prev: TokenActionState, formData: FormData): Promise<TokenActionState> {
  const raw = String(formData.get("token") ?? "");
  const r = await resolveToken(raw, "availability");
  if (!r.ok) return { error: explain(r.reason) };

  let blackouts: { start: string; end: string }[] = [];
  let explicit: { optionId: string; pref: "yes" | "maybe" | "no" }[] = [];
  try {
    blackouts = JSON.parse(String(formData.get("blackouts") ?? "[]"));
    explicit = JSON.parse(String(formData.get("votes") ?? "[]"));
  } catch {
    return { error: "Bad form data." };
  }
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  if (!Array.isArray(blackouts) || blackouts.some((b) => !iso.test(b.start) || !iso.test(b.end) || b.end < b.start)) return { error: "Invalid dates." };
  if (!Array.isArray(explicit) || explicit.some((e) => !["yes", "maybe", "no"].includes(e.pref))) return { error: "Invalid votes." };

  try {
    const t = trusted(r.token.principal);
    await recordBlackouts(t, r.token.principal.tripId, r.token.principal.userId, blackouts.slice(0, 60), explicit.slice(0, 20));
    return { done: "availability" };
  } catch (e) {
    captureException(e, { tripId: r.token.principal.tripId });
    return { error: "Something went wrong saving your dates." };
  }
}

function explain(reason: string): string {
  switch (reason) {
    case "expired":
      return "This link has expired. Ask the organizer for a fresh one, or reply in WhatsApp.";
    case "wrong_phase":
      return "This trip has moved on — that question is closed.";
    case "used":
      return "This link was already used.";
    default:
      return "This link isn't valid.";
  }
}
