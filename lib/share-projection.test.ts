import { describe, expect, it } from "vitest";

import {
  buildSharedFolder,
  type ShareGroupInput,
  type ShareProjectionInput,
} from "@/lib/share-projection";
import {
  SHARED_FOLDER_KEYS,
  SHARED_QUESTION_GROUP_KEYS,
} from "@/types/share";

/**
 * The runtime half of the D-017 guarantee.
 *
 * `types/share.test.ts` checks the *contract* — that no forbidden name appears in
 * the declared allowlist. This file checks the *implementation* honours it: real
 * database rows, deliberately polluted with every private column the tables
 * actually carry, go in; the response is asserted to contain none of them.
 *
 * The strongest assertion here is `leaksNothingPrivate`, which serialises the
 * whole response and searches it for sentinel values at any nesting depth. A
 * field-by-field check only catches leaks somebody thought to look for; a deep
 * scan catches one added three levels down in a payload next year.
 */

/** Sentinel values planted in the input. None may appear in the output. */
const SECRETS = {
  userId: "11111111-1111-1111-1111-111111111111",
  storagePath: "11111111-1111-1111-1111-111111111111/folder/paper.pdf",
  originalFilename: "Swayam_Roll_2101289_MidSem.pdf",
  normalizedHash: "9f2b8c1d4e5a6b7c8d9e0f1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e",
  tokenHash: "deadbeefcafebabe0123456789abcdef0123456789abcdef0123456789abcdef",
  errorMessage: "Tesseract failed on page 4: TesseractNotFoundError",
  email: "swayam@example.com",
  jobId: "job-77777777-7777-7777-7777-777777777777",
  correctionNote: "fixed OCR typo, was 'pagng'",
};

/**
 * Builds a group row carrying every private column `question_groups`,
 * `questions` and `papers` really have.
 *
 * Cast through `unknown` on purpose: it simulates a caller passing a full
 * `select('*')` row rather than the narrow shape, which is exactly the mistake
 * this projection has to survive.
 */
function pollutedGroup(overrides: Partial<ShareGroupInput> = {}): ShareGroupInput {
  return {
    id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    canonical_text: "Explain paging in virtual memory.",
    marks: 10,
    question_type: "descriptive",
    difficulty: "medium",
    priority_level: "critical",
    priority_score: 91.5,
    priority_reason: "Asked in 3 of the last 4 years, high marks.",
    occurrence_count: 3,
    distinct_years: 3,
    first_year: 2021,
    last_year: 2024,
    question_label: "Q5(a)",
    topic_name: "Memory Management",
    page_numbers: [7, 3],
    has_low_confidence_extraction: true,
    similar_variation_count: 2,

    // --- Private columns that must never surface -------------------------
    user_id: SECRETS.userId,
    folder_id: "ffffffff-ffff-ffff-ffff-ffffffffffff",
    normalized_hash: SECRETS.normalizedHash,
    normalizer_version: 1,
    confidence: 42.5,
    status: "accepted",
    reject_reason: null,
    storage_path: SECRETS.storagePath,
    original_filename: SECRETS.originalFilename,
    error_message: SECRETS.errorMessage,
    created_at: "2026-01-02T03:04:05.000Z",
    updated_at: "2026-01-02T03:04:05.000Z",
    computed_at: "2026-01-02T03:04:05.000Z",
    algo_version: 1,
    factors: { f_freq: 30, f_recency: 25 },
    ...overrides,
  } as unknown as ShareGroupInput;
}

function pollutedInput(
  overrides: Partial<ShareProjectionInput> = {},
): ShareProjectionInput {
  return {
    folder: {
      name: "Operating Systems",
      subject: "CS",
      exam_name: "Mid Semester",
      reference_year: 2024,

      user_id: SECRETS.userId,
      syllabus_storage_path: SECRETS.storagePath,
      created_at: "2026-01-01T00:00:00.000Z",
    } as unknown as ShareProjectionInput["folder"],
    papers: [
      { year: 2024, storage_path: SECRETS.storagePath, user_id: SECRETS.userId },
      { year: 2024, original_filename: SECRETS.originalFilename },
      { year: 2023, error_message: SECRETS.errorMessage },
      { year: null, original_filename: SECRETS.originalFilename },
    ] as unknown as ShareProjectionInput["papers"],
    analyticsPayload: {
      total_papers: 4,
      total_questions: 40,
      unique_questions: 30,
      repeat_rate_percentage: 25,
      priority_distribution: {
        critical: 3,
        very_high: 4,
        high: 5,
        medium: 8,
        low: 10,
        // A key the worker might add later. Must not reach the public shape.
        internal_debug_bucket: 99,
      },
      topic_weights: [
        {
          topic_name: "Memory Management",
          question_count: 12,
          marks_percentage: 34.5,
          frequency_percentage: 30,
          internal_note: SECRETS.correctionNote,
        },
      ],
      year_trends: [{ year: 2024, question_count: 12 }],
      coverage: [
        {
          topic_name: "Deadlocks",
          is_gap: true,
          question_count: 0,
          // Provenance is the owner's business, not a public fact.
          source: "syllabus",
        },
      ],
      // Owner-only metadata the worker could plausibly stash in the payload.
      llm_usage: { tokens_in: 900 },
      owner_email: SECRETS.email,
      last_job_id: SECRETS.jobId,
    },
    groups: [pollutedGroup()],
    ...overrides,
  };
}

/** Asserts no sentinel value appears anywhere in the serialised response. */
function leaksNothingPrivate(result: unknown) {
  const serialised = JSON.stringify(result);
  for (const [name, secret] of Object.entries(SECRETS)) {
    expect(serialised, `leaked ${name}`).not.toContain(secret);
  }
}

describe("buildSharedFolder — allowlist enforcement", () => {
  it("returns exactly the approved top-level keys", () => {
    const result = buildSharedFolder(pollutedInput());
    // Sorted comparison so key order is not part of the contract, but membership
    // is exact: an extra key fails, and so does a missing one.
    expect(Object.keys(result).sort()).toEqual([...SHARED_FOLDER_KEYS].sort());
  });

  it("returns exactly the approved question-group keys", () => {
    const result = buildSharedFolder(pollutedInput());
    expect(result.questionGroups).toHaveLength(1);
    expect(Object.keys(result.questionGroups[0]).sort()).toEqual(
      [...SHARED_QUESTION_GROUP_KEYS].sort(),
    );
  });

  it("leaks no private value anywhere in the response", () => {
    leaksNothingPrivate(buildSharedFolder(pollutedInput()));
  });

  it("drops private keys from nested analytics objects", () => {
    const result = buildSharedFolder(pollutedInput());
    // The worker's payload is jsonb and read key by key rather than cast, so a
    // new key it starts writing does not become public on its own.
    expect(Object.keys(result.analytics.priorityDistribution).sort()).toEqual(
      ["critical", "high", "low", "medium", "very_high"].sort(),
    );
    expect(Object.keys(result.analytics.topicWeights[0]).sort()).toEqual(
      ["frequencyPercentage", "marksPercentage", "questionCount", "topicName"].sort(),
    );
    expect(Object.keys(result.coverage[0]).sort()).toEqual(
      ["isGap", "questionCount", "topicName"].sort(),
    );
  });

  it("excludes normalized_hash, which is an inference channel", () => {
    // A hash would let a viewer test whether specific text exists in the owner's
    // private folder (D-017).
    const result = buildSharedFolder(pollutedInput());
    expect(JSON.stringify(result)).not.toContain(SECRETS.normalizedHash);
  });

  it("reduces OCR confidence to a boolean rather than exposing the score", () => {
    const result = buildSharedFolder(pollutedInput());
    expect(result.questionGroups[0].hasLowConfidenceExtraction).toBe(true);
    // 42.5 was the raw confidence on the input row.
    expect(JSON.stringify(result)).not.toContain("42.5");
  });
});

describe("buildSharedFolder — content correctness", () => {
  it("passes through the approved public fields", () => {
    const group = buildSharedFolder(pollutedInput()).questionGroups[0];
    expect(group.canonicalText).toBe("Explain paging in virtual memory.");
    expect(group.repeatCount).toBe(3);
    expect(group.marks).toBe(10);
    expect(group.priorityLevel).toBe("critical");
    expect(group.topicName).toBe("Memory Management");
    expect(group.questionLabel).toBe("Q5(a)");
    expect(group.similarVariationCount).toBe(2);
  });

  it("sorts page references ascending", () => {
    // Input was [7, 3]. A student following a page reference should not have to
    // reorder them.
    expect(buildSharedFolder(pollutedInput()).questionGroups[0].pageNumbers).toEqual(
      [3, 7],
    );
  });

  it("counts papers per year, newest first, omitting undated papers", () => {
    // A `null` year row says more about processing state than about the exams, so
    // it is omitted rather than published as a null entry.
    expect(buildSharedFolder(pollutedInput()).years).toEqual([
      { year: 2024, paperCount: 2 },
      { year: 2023, paperCount: 1 },
    ]);
  });

  it("serves the cached analytics payload without recomputing", () => {
    const analytics = buildSharedFolder(pollutedInput()).analytics;
    expect(analytics.totalPapers).toBe(4);
    expect(analytics.uniqueQuestions).toBe(30);
    expect(analytics.repeatRatePercentage).toBe(25);
    expect(analytics.yearTrends).toEqual([{ year: 2024, questionCount: 12 }]);
  });

  it("reports coverage gaps, which is differentiator #3", () => {
    const coverage = buildSharedFolder(pollutedInput()).coverage;
    expect(coverage).toEqual([
      { topicName: "Deadlocks", isGap: true, questionCount: 0 },
    ]);
  });
});

describe("buildSharedFolder — degraded and hostile payloads", () => {
  it("renders zeros rather than undefined when the payload is empty", () => {
    // A folder analysed under an older payload shape must still render, and must
    // never emit `undefined` into a public JSON response.
    const result = buildSharedFolder(
      pollutedInput({ analyticsPayload: {}, groups: [] }),
    );
    expect(result.analytics.totalPapers).toBe(0);
    expect(result.analytics.topicWeights).toEqual([]);
    expect(result.coverage).toEqual([]);
    expect(JSON.stringify(result)).not.toContain("undefined");
  });

  it("survives a null or non-object payload", () => {
    for (const payload of [null, undefined, "unexpected", 42, []]) {
      const result = buildSharedFolder(pollutedInput({ analyticsPayload: payload }));
      expect(Object.keys(result).sort()).toEqual([...SHARED_FOLDER_KEYS].sort());
      expect(result.analytics.totalQuestions).toBe(0);
    }
  });

  it("clamps counts that arrive negative or fractional", () => {
    const result = buildSharedFolder(
      pollutedInput({
        analyticsPayload: { total_papers: -5, total_questions: 12.7 },
      }),
    );
    expect(result.analytics.totalPapers).toBe(0);
    expect(result.analytics.totalQuestions).toBe(12);
  });

  it("still exposes only approved keys when every optional field is null", () => {
    const sparse = pollutedGroup({
      marks: null,
      question_type: null,
      difficulty: null,
      priority_level: null,
      priority_score: null,
      priority_reason: null,
      question_label: null,
      topic_name: null,
      page_numbers: [],
      has_low_confidence_extraction: false,
      similar_variation_count: 0,
    });
    const result = buildSharedFolder(pollutedInput({ groups: [sparse] }));
    expect(Object.keys(result.questionGroups[0]).sort()).toEqual(
      [...SHARED_QUESTION_GROUP_KEYS].sort(),
    );
    leaksNothingPrivate(result);
  });

  it("keeps the key set stable across many groups", () => {
    const groups = Array.from({ length: 25 }, (_, i) =>
      pollutedGroup({ id: `group-${i}`, occurrence_count: i }),
    );
    const result = buildSharedFolder(pollutedInput({ groups }));
    for (const group of result.questionGroups) {
      expect(Object.keys(group).sort()).toEqual(
        [...SHARED_QUESTION_GROUP_KEYS].sort(),
      );
    }
    leaksNothingPrivate(result);
  });
});
