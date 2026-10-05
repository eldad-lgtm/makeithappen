import { NextResponse, type NextRequest } from "next/server";
import { refreshSession } from "@/lib/auth/cookies";

/**
 * Optimistic auth checks only (Next 16 `proxy`). Real authorisation happens
 * at the data source: RLS for the session path, the token chokepoint for the
 * rest (PLAN.md §7.6).
 */
const PROTECTED = ["/trips", "/settings", "/onboarding", "/admin"];
const AUTH_PAGES = ["/login"];

export async function proxy(request: NextRequest) {
  const { response, userId } = await refreshSession(request);
  const path = request.nextUrl.pathname;

  if (!userId && PROTECTED.some((p) => path === p || path.startsWith(p + "/"))) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }
  if (userId && AUTH_PAGES.some((p) => path === p || path.startsWith(p + "/"))) {
    const url = request.nextUrl.clone();
    url.pathname = "/trips";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  // Everything except static assets, the no-login action pages, webhooks and cron.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|a/|api/|legal/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
