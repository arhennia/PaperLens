import { describe, expect, it } from "vitest";

import {
  SHARED_FOLDER_KEYS,
  SHARED_QUESTION_GROUP_KEYS,
} from "@/types/share";

/**
 * Guards the public share projection's allowlist (D-017).
 *
 * The share route itself is Phase 4 work, but the allowlist is the security
 * boundary and can be checked now. These tests are written against a **denylist
 * of names that must never appear**, which is what makes them more than a
 * restatement of the type: adding `userId` or `storagePath` to the projection
 * fails here rather than shipping a public leak.
 *
 * Phase 4 must add the complementary runtime test — that an actual
 * `GET /api/share/[token]` response's key set equals SHARED_FOLDER_KEYS exactly.
 * These tests check the contract; that one checks the implementation honours it.
 */

/**
 * Substrings that must not appear in any public field name.
 *
 * Matched case-insensitively against every key, so `user_id`, `userId` and
 * `ownerUserId` are all caught by the same entry.
 */
const FORBIDDEN_SUBSTRINGS = [
  "userid",
  "user_id",
  "owner",
  "email",
  "profile",
  "storage",
  "path",
  "filename",
  "token",
  "hash",
  "secret",
  "key",
  "credential",
  "signedurl",
  "job",
  "error",
  "correction",
  "llm",
  "usage",
  "cost",
  "budget",
  "createdat",
  "updatedat",
];

function findForbidden(keys: readonly string[]): string[] {
  return keys.filter((key) =>
    FORBIDDEN_SUBSTRINGS.some((forbidden) =>
      key.toLowerCase().includes(forbidden),
    ),
  );
}

describe("public share projection allowlist", () => {
  it("exposes no private field names at the top level", () => {
    expect(findForbidden(SHARED_FOLDER_KEYS)).toEqual([]);
  });

  it("exposes no private field names on a question group", () => {
    // The largest leak risk: a question group is built from rows that carry
    // user_id, normalized_hash and confidence, none of which may surface.
    expect(findForbidden(SHARED_QUESTION_GROUP_KEYS)).toEqual([]);
  });

  it("excludes normalized_hash, which would leak private content", () => {
    // Deliberately excluded even though it looks harmless: a hash lets a viewer
    // test whether specific text exists in the owner's folder (D-017).
    const groupKeys = SHARED_QUESTION_GROUP_KEYS.map((k) => k.toLowerCase());
    expect(groupKeys).not.toContain("normalizedhash");
    expect(groupKeys).not.toContain("normalized_hash");
  });

  it("includes what Swayam approved for public viewers", () => {
    // Page numbers and the low-confidence flag are approved so a classmate can
    // check a diagram against the original and can tell when extraction was
    // uncertain rather than trusting it blindly (D-017).
    expect(SHARED_QUESTION_GROUP_KEYS).toContain("pageNumbers");
    expect(SHARED_QUESTION_GROUP_KEYS).toContain("hasLowConfidenceExtraction");
    expect(SHARED_QUESTION_GROUP_KEYS).toContain("repeatCount");
    expect(SHARED_QUESTION_GROUP_KEYS).toContain("marks");
    expect(SHARED_QUESTION_GROUP_KEYS).toContain("difficulty");

    expect(SHARED_FOLDER_KEYS).toContain("analytics");
    expect(SHARED_FOLDER_KEYS).toContain("coverage");
    expect(SHARED_FOLDER_KEYS).toContain("years");
  });

  it("reports similarity as variations rather than as sameness", () => {
    // Advisory fuzzy output must never be presented to a public viewer as
    // identity (D-024).
    expect(SHARED_QUESTION_GROUP_KEYS).toContain("similarVariationCount");
  });

  it("has no duplicate keys", () => {
    expect(new Set(SHARED_FOLDER_KEYS).size).toBe(SHARED_FOLDER_KEYS.length);
    expect(new Set(SHARED_QUESTION_GROUP_KEYS).size).toBe(
      SHARED_QUESTION_GROUP_KEYS.length,
    );
  });
});
