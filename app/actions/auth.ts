"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

/**
 * Log out the current user by clearing the session.
 */
export async function logOut() {
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
    revalidatePath("/", "layout");
  } catch (error) {
    console.error("Log out error:", error);
    throw error;
  }
}

/**
 * Delete the current user's account and all associated data.
 * 
 * This action:
 * 1. Retrieves the current user
 * 2. Calls the Supabase Admin API to delete the user (which cascades RLS-protected data)
 * 3. Clears the session
 * 4. Revalidates the entire layout
 */
export async function deleteAccount() {
  try {
    const supabase = await createClient();

    // Get current user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      throw new Error("Unable to retrieve user");
    }

    // Use the admin client to delete the user (this cascades to all RLS-protected data)
    const admin = createAdminClient();

    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteError) {
      throw deleteError;
    }

    // Clear session
    await supabase.auth.signOut();
    revalidatePath("/", "layout");
  } catch (error) {
    console.error("Delete account error:", error);
    throw error;
  }
}
