"use server";

/**
 * Server actions for paper upload and processing dispatch.
 *
 * Upload flow:
 *   1. Client creates a paper row via `createPaperRecord` → gets paper ID.
 *   2. Client uploads the file to Supabase Storage at the returned path.
 *   3. Client calls `triggerExtraction` → Next.js server calls FastAPI.
 *
 * The browser never talks to FastAPI directly — this action layer is the proxy.
 */

import { revalidatePath } from "next/cache";

import { authenticateRoute, authorizeFolderRoute } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  enqueueExtraction,
  enqueueAnalysis,
} from "@/lib/api/processing";

/** Creates a paper row and returns the ID + storage path for client-side upload. */
export async function createPaperRecord(
  folderId: string,
  originalFilename: string,
) {
  const auth = await authorizeFolderRoute(folderId);
  if (auth.response) throw new Error("Folder not found.");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("papers")
    .insert({
      folder_id: folderId,
      user_id: auth.user.id,
      original_filename: originalFilename,
      storage_path: "", // Placeholder — set after we know the paper ID.
    })
    .select("id")
    .single();

  if (error) throw new Error("Failed to create paper record.");

  // Storage path follows the spec: {user_id}/{folder_id}/{paper_id}.pdf
  const storagePath = `${auth.user.id}/${folderId}/${data.id}.pdf`;

  // Update the row with the real path.
  await supabase
    .from("papers")
    .update({ storage_path: storagePath })
    .eq("id", data.id);

  revalidatePath(`/folders/${folderId}`);

  return { paperId: data.id, storagePath };
}

/**
 * Triggers extraction for all unextracted papers in a folder.
 * Idempotent — double-clicks coalesce into one job.
 */
export async function triggerExtraction(folderId: string) {
  const auth = await authorizeFolderRoute(folderId);
  if (auth.response) throw new Error("Folder not found.");

  const result = await enqueueExtraction(folderId, auth.user.id);

  revalidatePath(`/folders/${folderId}`);
  return result;
}

/**
 * Triggers analysis for a folder.
 * Idempotent on analytics fingerprint.
 */
export async function triggerAnalysis(folderId: string) {
  const auth = await authorizeFolderRoute(folderId);
  if (auth.response) throw new Error("Folder not found.");

  const result = await enqueueAnalysis(folderId, auth.user.id);

  revalidatePath(`/folders/${folderId}`);
  return result;
}
