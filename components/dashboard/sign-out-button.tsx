"use client";

import { createClient } from "@/lib/supabase/client";

export function SignOutButton() {
  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <button
      type="button"
      className="mt-1 text-xs text-faint transition-colors hover:text-danger"
      onClick={handleSignOut}
    >
      Sign out
    </button>
  );
}
