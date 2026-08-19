import { createBrowserClient } from "@supabase/ssr";

import { supabasePublishableKey, supabaseUrl } from "@/lib/env";
import type { Database } from "@/types/database.generated";

/**
 * Supabase client for browser code.
 *
 * Acts as the signed-in user, so every query is filtered by RLS. Use it for
 * Realtime subscriptions (watching job progress) and for reads inside Client
 * Components. Server Components should use `lib/supabase/server.ts` instead, so
 * the initial paint does not wait on a browser round-trip.
 *
 * Only the publishable key is used here. It is safe in the browser precisely
 * because RLS is what restricts access, not the key.
 */
export function createClient() {
  return createBrowserClient<Database>(supabaseUrl(), supabasePublishableKey());
}
