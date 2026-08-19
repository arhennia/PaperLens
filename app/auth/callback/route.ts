import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * OAuth callback handler.
 *
 * After the user authenticates with Google (or any other Supabase OAuth
 * provider), Supabase redirects here with a `code` query parameter. We exchange
 * it for a session, which `createClient` stores in cookies automatically.
 *
 * On success, redirects to the `next` parameter (the page the user was trying
 * to reach) or `/`. On failure, redirects to `/login?error=auth` so the login
 * page can show an error message.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (!code) {
    const errorUrl = request.nextUrl.clone();
    errorUrl.pathname = "/login";
    errorUrl.searchParams.set("error", "auth");
    return NextResponse.redirect(errorUrl);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    const errorUrl = request.nextUrl.clone();
    errorUrl.pathname = "/login";
    errorUrl.searchParams.set("error", "auth");
    return NextResponse.redirect(errorUrl);
  }

  const redirectUrl = request.nextUrl.clone();
  redirectUrl.pathname = next;
  redirectUrl.searchParams.delete("code");
  redirectUrl.searchParams.delete("next");
  return NextResponse.redirect(redirectUrl);
}
