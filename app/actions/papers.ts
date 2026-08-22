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
import { randomUUID } from "node:crypto";

import { authorizeFolderRoute } from "@/lib/auth";
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
  const paperId = randomUUID();
  const storagePath = `${auth.user.id}/${folderId}/${paperId}.pdf`;
  const { data, error } = await supabase
    .from("papers")
    .insert({
      id: paperId,
      folder_id: folderId,
      user_id: auth.user.id,
      original_filename: originalFilename,
      storage_path: storagePath,
    })
    .select("id, storage_path")
    .single();

  if (error) throw new Error("Failed to create paper record.");

  revalidatePath(`/folders/${folderId}`);

  return { paperId: data.id, storagePath: data.storage_path };
}

export async function deletePaperRecord(folderId: string, paperId: string) {
  const auth = await authorizeFolderRoute(folderId);
  if (auth.response) throw new Error("Folder not found.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("papers")
    .delete()
    .eq("id", paperId)
    .eq("folder_id", folderId);

  if (error) throw new Error("Failed to clean up paper record.");
}

export async function getProcessingJobs(folderId: string) {
  const auth = await authorizeFolderRoute(folderId);
  if (auth.response) throw new Error("Folder not found.");

  const { data, error } = await auth.supabase
    .from("processing_jobs")
    .select("*")
    .eq("folder_id", folderId)
    .in("status", ["queued", "running"])
    .order("created_at", { ascending: false });

  if (error) throw new Error("Unable to load processing status.");
  return data ?? [];
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
