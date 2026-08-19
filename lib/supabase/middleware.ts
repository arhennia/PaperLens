import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { supabasePublishableKey, supabaseUrl } from "@/lib/env";
import type { Database } from "@/types/database.generated";

/** Prefixes that never require a session. */
const PUBLIC_PATHS = ["/login", "/signup", "/auth", "/share"];

/**
 * Refreshes the auth session on every request and redirects signed-out users
 * away from the dashboard.
 *
 * This is convenience, not enforcement. Two stronger layers sit behind it: the
 * dashboard layout re-checks the user server-side, and RLS filters every query
 * (A.5). Only RLS is authoritative — a middleware bug must not be able to expose
 * another user's data, and because policies are enforced by Postgres, it cannot.
 */
export async function updateSession(request: NextRequest) {
  // Must be built from the incoming request so refreshed auth cookies survive.
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    supabaseUrl(),
    supabasePublishableKey(),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // getUser() rather than getSession(): it validates the token with the Auth
  // server instead of trusting the cookie. Calling it here is also what triggers
  // the refresh, so do not remove it as a redundant round-trip.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublicPath =
    pathname === "/" || PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  if (!user && !isPublicPath) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}
