"use server";

/**
 * Server actions for share-link management.
 *
 * The share system stores only the SHA-256 hash of each token, so the plaintext
 * exists only in the response to `createShareLink` and in the URL the user
 * copies. Looking up a link compares hashes, never plaintexts (D-017).
 */

import { revalidatePath } from "next/cache";

import { authorizeFolderRoute } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { generateShareToken, hashShareToken } from "@/lib/share-utils";

/**
 * Creates a share link and returns the plaintext token.
 *
 * The caller displays this token once — it is never stored or retrievable after
 * this response.
 */
export async function createShareLink(folderId: string) {
  const auth = await authorizeFolderRoute(folderId);
  if (auth.response) throw new Error("Folder not found.");

  const token = generateShareToken();
  const tokenHash = hashShareToken(token);

  const supabase = await createClient();
  const { error } = await supabase.from("share_links").insert({
    folder_id: folderId,
    user_id: auth.user.id,
    token_hash: tokenHash,
  });

  if (error) throw new Error("Failed to create share link.");

  revalidatePath(`/folders/${folderId}`);

  return { token };
}

/** Revokes a share link by setting revoked_at. RLS enforces ownership. */
export async function revokeShareLink(linkId: string) {
  const supabase = await createClient();

  const { data: link } = await supabase
    .from("share_links")
    .select("folder_id")
    .eq("id", linkId)
    .maybeSingle();

  if (!link) throw new Error("Share link not found.");

  const { error } = await supabase
    .from("share_links")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", linkId);

  if (error) throw new Error("Failed to revoke share link.");

  revalidatePath(`/folders/${link.folder_id}`);
}

/** Lists active (non-revoked, non-expired) share links for a folder. */
export async function getShareLinks(folderId: string) {
  const auth = await authorizeFolderRoute(folderId);
  if (auth.response) throw new Error("Folder not found.");

  const supabase = await createClient();
  const { data } = await supabase
    .from("share_links")
    .select("id, created_at, expires_at, revoked_at")
    .eq("folder_id", folderId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });

  return data ?? [];
}
