// Importing this module from a Client Component is a security bug, so it fails
// at build time rather than shipping the service-role key to a browser. Keep
// this directive as the first line.
import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { supabaseSecretKey, supabaseUrl } from "@/lib/env";
import type { Database } from "@/types/database.generated";

/**
 * Supabase client holding the service-role key. **Bypasses RLS entirely.**
 *
 * Every query made with this client can read and write every user's data, so the
 * caller is responsible for the authorization that RLS would otherwise have
 * provided. There are only two legitimate uses (A.4):
 *
 *   1. Resolving a share token, where there is no signed-in user to act as. The
 *      route must apply the explicit field allowlist in `types/share.ts` and
 *      must scope every query by the folder id the token resolved to (D-017).
 *   2. Enqueuing jobs and other trusted server-side bookkeeping.
 *
 * For anything a signed-in user is doing, use `lib/supabase/server.ts` so RLS
 * stays in force. Reach for this module only when you can name which of the two
 * cases above applies.
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(supabaseUrl(), supabaseSecretKey(), {
    auth: {
      // No user session: this client must never pick up or refresh one.
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
