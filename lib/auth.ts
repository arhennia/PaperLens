/**
 * Server-side auth and authorization helpers.
 *
 * The authorization model is deliberately thin, because RLS is what actually
 * enforces it (A.5, D-015). A folder lookup through `lib/supabase/server.ts`
 * returns nothing when the folder belongs to somebody else — Postgres filters it,
 * not this code. So `requireFolder` needs no `where user_id = ...` clause: adding
 * one would imply the check lives here, and a reader might then assume removing
 * it is safe.
 *
 * What this file adds is the *response* to a failed check: a redirect for pages,
 * a 404 for routes. Both are ordinary control flow; neither is the security
 * boundary.
 */

import { redirect } from "next/navigation";

import { createClient, getUser } from "@/lib/supabase/server";
import type { FoldersRow } from "@/types/database.generated";

/**
 * Returns the signed-in user, or redirects to the login page.
 *
 * For use in Server Components. `next` carries the path the user was trying to
 * reach so they land there after signing in rather than on a generic dashboard.
 */
export async function requireUser(next?: string) {
  const user = await getUser();
  if (!user) {
    redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  }
  return user;
}

/**
 * Loads a folder the signed-in user owns, or redirects.
 *
 * A folder owned by another user and a folder that does not exist are treated
 * identically — both return no rows under RLS, and responding differently would
 * leak whether a given uuid exists in someone else's account.
 */
export async function requireFolder(folderId: string): Promise<FoldersRow> {
  const user = await requireUser(`/folders/${folderId}`);
  const supabase = await createClient();

  const { data } = await supabase
    .from("folders")
    .select("*")
    .eq("id", folderId)
    .maybeSingle();

  if (!data) {
    // Not `notFound()`: a 404 page inside the dashboard shell is more confusing
    // than being returned to the folder list, and the outcome is the same.
    redirect("/");
  }

  // Belt and braces. RLS has already guaranteed this; asserting it means a
  // misconfigured policy fails closed here rather than rendering another user's
  // folder, and the check costs nothing.
  if (data.user_id !== user.id) {
    redirect("/");
  }

  return data;
}

/**
 * The route-handler equivalent: returns the user and client, or an error
 * response to hand straight back to the caller.
 *
 * Route handlers must not redirect — a `fetch` from the browser would follow the
 * redirect and receive HTML where it expected JSON.
 */
export async function authenticateRoute() {
  const supabase = await createClient();
  const user = await getUser();

  if (!user) {
    return {
      user: null,
      supabase: null,
      response: Response.json(
        { error: "Not signed in." },
        { status: 401 },
      ),
    } as const;
  }

  return {
    user,
    supabase,
    response: null,
  } as const;
}

/**
 * Confirms the signed-in user owns a folder, for route handlers.
 *
 * Returns a 404 rather than a 403 when the folder is not theirs, for the reason
 * in `requireFolder`: distinguishing the two would confirm the existence of
 * another user's folder.
 */
export async function authorizeFolderRoute(folderId: string) {
  const auth = await authenticateRoute();
  if (auth.response) return { ...auth, folder: null } as const;

  if (!isUuid(folderId)) {
    return {
      ...auth,
      folder: null,
      response: Response.json({ error: "Folder not found." }, { status: 404 }),
    } as const;
  }

  const { data } = await auth.supabase
    .from("folders")
    .select("*")
    .eq("id", folderId)
    .maybeSingle();

  if (!data) {
    return {
      ...auth,
      folder: null,
      response: Response.json({ error: "Folder not found." }, { status: 404 }),
    } as const;
  }

  return { ...auth, folder: data, response: null } as const;
}

/**
 * True for a well-formed uuid.
 *
 * Worth checking before a query: Postgres rejects a malformed uuid with a type
 * error, which surfaces as a 500 rather than the 404 the caller deserves.
 */
export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}
