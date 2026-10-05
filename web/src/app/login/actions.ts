"use server";

import { redirect } from "next/navigation";
import { normalizePhone } from "@/core/phone";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface AuthFormState {
  error?: string;
}

export async function requestOtp(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const raw = String(formData.get("phone") ?? "");
  const country = String(formData.get("country") ?? "IL");
  const parsed = normalizePhone(raw, country);
  if (!parsed) return { error: "That doesn't look like a valid phone number." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({ phone: parsed.e164 });
  if (error) return { error: error.message };

  redirect(`/login/verify?phone=${encodeURIComponent(parsed.e164)}`);
}

export async function verifyOtp(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const phone = String(formData.get("phone") ?? "");
  const token = String(formData.get("token") ?? "").replace(/\s+/g, "");
  if (!/^\d{6}$/.test(token)) return { error: "Enter the 6-digit code." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({ phone, token, type: "sms" });
  if (error) return { error: "That code didn't work. Try again." };

  // Claim (or create) the app user for this phone (§5.1).
  const { data: user, error: claimErr } = await supabase.rpc("claim_current_user", { p_display_name: null });
  if (claimErr) return { error: claimErr.message };

  const needsName = !user || user.name_source === "inviter" || user.display_name === "New member";
  redirect(needsName ? "/onboarding" : "/trips");
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/");
}
