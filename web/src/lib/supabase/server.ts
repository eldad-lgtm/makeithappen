import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/db/database.types";
import { env } from "@/lib/env";

/**
 * SESSION-path client (PLAN.md §7.6). Uses the anon key plus the user's
 * cookies, so every query is subject to RLS in Postgres. Create one per
 * request; never share across requests.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component: cookies are read-only there. The
          // proxy refreshes the session, so this is safe to ignore.
        }
      },
    },
  });
}
