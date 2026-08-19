/**
 * Share-token utilities.
 *
 * The share system works like a bearer token: the owner receives a plaintext
 * token, and we store only its SHA-256 hash. Lookup compares hashes, so the
 * plaintext is never persisted (D-017).
 *
 * This module is the single source of the hashing algorithm. Both `createShareLink`
 * (which stores) and the public route (which looks up) import from here, so they
 * cannot accidentally use different algorithms.
 */

import { createHash, randomBytes } from "node:crypto";

/**
 * Generates a cryptographically random share token.
 *
 * 32 bytes → 43 URL-safe base64 characters. Long enough that brute-force is
 * infeasible; short enough that a pasted link is not unwieldy.
 */
export function generateShareToken(): string {
  return randomBytes(32).toString("base64url");
}

/** SHA-256 of a plaintext token, hex-encoded. */
export function hashShareToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
