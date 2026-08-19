"use server";

/**
 * Server actions for folder management.
 *
 * Every action authenticates the session and relies on RLS for authorization.
 * The admin client is never used here — all queries run as the signed-in user.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { authenticateRoute } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/** Creates a new subject folder for the signed-in user. */
export async function createFolder(formData: FormData) {
  const auth = await authenticateRoute();
  if (auth.response) throw new Error("Not signed in.");

  const name = (formData.get("name") as string)?.trim();
  if (!name) throw new Error("Folder name is required.");

  const subject = (formData.get("subject") as string)?.trim() || null;
  const examName = (formData.get("exam_name") as string)?.trim() || null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("folders")
    .insert({
      user_id: auth.user.id,
      name,
      subject,
      exam_name: examName,
    })
    .select("id")
    .single();

  if (error) throw new Error("Failed to create folder.");

  revalidatePath("/");
  redirect(`/folders/${data.id}`);
}

/** Deletes a folder the signed-in user owns. RLS enforces ownership. */
export async function deleteFolder(folderId: string) {
  const auth = await authenticateRoute();
  if (auth.response) throw new Error("Not signed in.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("folders")
    .delete()
    .eq("id", folderId);

  if (error) throw new Error("Failed to delete folder.");

  revalidatePath("/");
  redirect("/");
}

/** Renames a folder. */
export async function renameFolder(folderId: string, name: string) {
  const auth = await authenticateRoute();
  if (auth.response) throw new Error("Not signed in.");

  const trimmed = name.trim();
  if (!trimmed) throw new Error("Folder name is required.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("folders")
    .update({ name: trimmed })
    .eq("id", folderId);

  if (error) throw new Error("Failed to rename folder.");

  revalidatePath("/");
  revalidatePath(`/folders/${folderId}`);
}
