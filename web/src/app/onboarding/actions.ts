"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { TIMEZONES } from "@/lib/timezones";

export interface OnboardingState {
  error?: string;
}

export async function completeOnboarding(_prev: OnboardingState, formData: FormData): Promise<OnboardingState> {
  const name = String(formData.get("name") ?? "").trim();
  const timezone = String(formData.get("timezone") ?? "UTC");
  if (name.length < 2) return { error: "Please enter a name." };
  if (!TIMEZONES.includes(timezone)) return { error: "Pick a timezone from the list." };

  const supabase = await createSupabaseServerClient();
  const { data: user, error } = await supabase.rpc("claim_current_user", { p_display_name: name });
  if (error || !user) return { error: error?.message ?? "Could not save." };
  await supabase.from("users").update({ timezone }).eq("id", user.id);

  redirect("/trips");
}
