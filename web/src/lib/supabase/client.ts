"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/db/database.types";

/** Browser client: anon key only. Used for nothing sensitive — the server does the work. */
export function createSupabaseBrowserClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
