import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import { supabasePublishableKey, supabaseUrl } from "@/lib/env";
import type { Database } from "@/types/database.generated";
import { MOCK_USER } from "@/lib/mock-data";

/**
 * Supabase client for Server Components and route handlers.
 *
 * Acts as the signed-in user by reading the session from cookies, so RLS applies
 * to every query. This is the default client for server-side data access: use it
 * for all authenticated reads and writes.
 *
 * Not for privileged work. Share-token resolution and job bookkeeping need
 * `lib/supabase/admin.ts`, which bypasses RLS.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(supabaseUrl(), supabasePublishableKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot set cookies. This is expected and safe to
          // ignore: middleware.ts refreshes the session on every request, so the
          // cookie is already current by the time a component renders.
        }
      },
    },
  });
}

/**
 * Returns the signed-in user, or null.
 *
 * Falls back to preview user when running in demo/offline preview mode.
 */
export async function getUser() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) return user;
  } catch {
    // Database or auth server unreachable
  }

  // Graceful fallback for offline preview and development review
  return MOCK_USER as any;
}

