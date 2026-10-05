import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/db/database.types";

/**
 * Session refresh for proxy.ts. Supabase rotates tokens; the proxy is the one
 * place that can write refreshed cookies back on every request.
 */
export async function refreshSession(request: NextRequest): Promise<{ response: NextResponse; userId: string | null }> {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    // Unconfigured deployment: treat every request as anonymous instead of
    // 500ing on every route. Pages surface the missing config themselves.
    return { response, userId: null };
  }

  const supabase = createServerClient<Database>(url, anonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          Object.entries(headers ?? {}).forEach(([k, v]) => response.headers.set(k, v));
        },
      },
  });

  const { data } = await supabase.auth.getClaims();
  return { response, userId: (data?.claims?.sub as string | undefined) ?? null };
}
