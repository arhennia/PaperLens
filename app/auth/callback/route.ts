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
  const authError = searchParams.get("error");
  const authErrorCode = searchParams.get("error_code");
  const authErrorDescription = searchParams.get("error_description");

  if (!code || authError) {
    const errorUrl = request.nextUrl.clone();
    errorUrl.pathname = "/login";
    errorUrl.search = "";
    errorUrl.searchParams.set("error", authError ?? "auth");
    if (authErrorCode) {
      errorUrl.searchParams.set("error_code", authErrorCode);
    }
    if (authErrorDescription) {
      errorUrl.searchParams.set("error_description", authErrorDescription);
    }
    errorUrl.searchParams.set("next", next);
    return NextResponse.redirect(errorUrl);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    const errorUrl = request.nextUrl.clone();
    errorUrl.pathname = "/login";
    errorUrl.search = "";
    errorUrl.searchParams.set("error", "auth");
    errorUrl.searchParams.set("error_description", error.message);
    errorUrl.searchParams.set("next", next);
    return NextResponse.redirect(errorUrl);
  }

  const redirectUrl = request.nextUrl.clone();
  redirectUrl.pathname = next;
  redirectUrl.searchParams.delete("code");
  redirectUrl.searchParams.delete("next");
  return NextResponse.redirect(redirectUrl);
}
