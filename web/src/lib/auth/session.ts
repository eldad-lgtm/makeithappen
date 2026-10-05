import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";
import type { UserRow } from "@/db/database.types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Data Access Layer for the session path. `getSessionUser` is memoised per
 * render pass; every page, action and route handler that needs a user calls
 * it rather than trusting a layout.
 */

export interface SessionUser {
  authUserId: string;
  phone: string | null;
  /** The app user row (`users`), or null if not yet claimed. */
  appUser: UserRow | null;
}

export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  let supabase;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    return null; // env not configured (e.g. build time)
  }
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const { data: appUser } = await supabase.from("users").select("*").eq("auth_user_id", data.user.id).maybeSingle();
  return { authUserId: data.user.id, phone: data.user.phone ?? null, appUser: appUser ?? null };
});

/** Logged in, with an app user row. Redirects otherwise. */
export async function requireUser(): Promise<SessionUser & { appUser: UserRow }> {
  const s = await getSessionUser();
  if (!s) redirect("/login");
  if (!s.appUser) redirect("/onboarding");
  return s as SessionUser & { appUser: UserRow };
}

export function isPlatformAdmin(user: UserRow, adminPhones: string[]): boolean {
  return adminPhones.includes(user.phone_e164);
}
