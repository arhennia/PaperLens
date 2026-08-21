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

import { authorizeFolderRoute } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { STORAGE_BUCKET } from "@/lib/env";
import {
  enqueueExtraction,
  enqueueAnalysis,
} from "@/lib/api/processing";

/** Creates a paper row and returns the ID + storage path for client-side upload. */
export async function createPaperRecord(
  folderId: string,
  originalFilename: string,
  year: number | null,
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
      year,
      year_source: year === null ? null : "manual",
    })
    .select("id")
    .single();

  if (error) {
    console.error("Failed to create paper record:", error.message);
    throw new Error(`Failed to create paper record: ${error.message}`);
  }

  // Storage path follows the spec: {user_id}/{folder_id}/{paper_id}.pdf
  const storagePath = `${auth.user.id}/${folderId}/${data.id}.pdf`;

  // Update the row with the real path.
  const { error: pathError } = await supabase
    .from("papers")
    .update({ storage_path: storagePath })
    .eq("id", data.id);

  if (pathError) {
    console.error("Failed to set paper storage path:", pathError.message);
    throw new Error(`Failed to prepare paper upload: ${pathError.message}`);
  }

  revalidatePath(`/folders/${folderId}`);

  return { paperId: data.id, storagePath };
}

/** Deletes a paper row and its private PDF after verifying folder ownership. */
export async function deletePaper(paperId: string, folderId: string) {
  const auth = await authorizeFolderRoute(folderId);
  if (auth.response) throw new Error("Folder not found.");

  const supabase = await createClient();
  const { data: paper, error: readError } = await supabase
    .from("papers")
    .select("storage_path")
    .eq("id", paperId)
    .eq("folder_id", folderId)
    .single();

  if (readError || !paper) throw new Error("Paper not found.");

  if (paper.storage_path) {
    await supabase.storage.from(STORAGE_BUCKET).remove([paper.storage_path]);
  }

  const { error } = await supabase
    .from("papers")
    .delete()
    .eq("id", paperId)
    .eq("folder_id", folderId);

  if (error) throw new Error("Failed to delete paper.");
  revalidatePath(`/folders/${folderId}`);
}

/** Removes a row created for an upload that failed before Storage completed. */
export async function discardPaperRecord(paperId: string, folderId: string) {
  const auth = await authorizeFolderRoute(folderId);
  if (auth.response) throw new Error("Folder not found.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("papers")
    .delete()
    .eq("id", paperId)
    .eq("folder_id", folderId)
    .eq("user_id", auth.user.id);

  if (error) {
    console.error("Failed to discard paper record:", error.message);
  }
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
