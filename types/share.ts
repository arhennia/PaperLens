/**
 * The public read-only share projection (D-017).
 *
 * ---------------------------------------------------------------------------
 * THIS IS THE ENTIRE PUBLIC SURFACE OF PAPERLENS. Anything reachable from these
 * types is world-readable by anyone holding a share link.
 *
 * These types are DELIBERATELY hand-written and deliberately NOT derived from
 * `Database["public"]["Tables"][...]["Row"]`. Deriving them would mean that a
 * column added to a table six months from now joins the public shape
 * automatically, exposed until somebody notices. Hand-writing inverts that
 * failure mode: a new field is invisible until someone deliberately adds it here.
 *
 * Adding a field is therefore a visible code change that shows up in review.
 * Before adding one, ask whether a classmate holding a link should see it.
 * ---------------------------------------------------------------------------
 *
 * Excluded on purpose, and why:
 *
 *   user_id, profiles, email      — the owner's identity is not public
 *   storage_path, signed URLs     — private bucket paths must never leak
 *   original_filename             — often contains a name or roll number
 *   processing_jobs, error_message — internal traces
 *   question_corrections history  — who fixed what, and when
 *   llm_usage, llm_cache          — the owner's spend
 *   token_hash                    — the share credential itself
 *   normalized_hash               — lets a viewer test whether specific text
 *                                   exists in the folder, which is an inference
 *                                   channel into private content
 *   rejected / non-accepted rows  — draft and unprocessed uploads
 *   created_at / updated_at       — activity metadata
 */

/** A single exam year covered by the folder. */
export interface SharedYear {
  year: number;
  paperCount: number;
}

/**
 * One question group, as a public viewer sees it.
 *
 * Includes page numbers, year, and OCR confidence warnings: Swayam approved
 * these so a classmate can check a diagram against the original paper and can
 * tell when the extraction is uncertain rather than trusting it blindly.
 */
export interface SharedQuestionGroup {
  /** Group id. Safe to expose: it is a random uuid, not derived from content. */
  id: string;
  canonicalText: string;
  questionLabel: string | null;
  marks: number | null;
  questionType: string | null;
  difficulty: string | null;
  topicName: string | null;
  /** How many times this exact question appears. Exact-hash based, so factual. */
  repeatCount: number;
  distinctYears: number;
  firstYear: number | null;
  lastYear: number | null;
  priorityLevel: string | null;
  priorityScore: number | null;
  priorityReason: string | null;
  /** Original page references, for checking diagrams and code (D-013). */
  pageNumbers: number[];
  /**
   * True when any occurrence came from a page whose OCR was low-confidence or
   * failed. Drives the "check the original" badge (D-013). A boolean rather than
   * the raw score: the warning is the useful part, and a numeric extraction
   * confidence would expose more about processing quality than a viewer needs.
   */
  hasLowConfidenceExtraction: boolean;
  /**
   * Advisory only, never presented as "same question" (D-024). Counts
   * near-duplicates found by fuzzy matching at an unvalidated threshold.
   */
  similarVariationCount: number;
}

export interface SharedTopicWeight {
  topicName: string;
  questionCount: number;
  /** Percentage of total marks across the folder. */
  marksPercentage: number;
  frequencyPercentage: number;
}

export interface SharedCoverageGap {
  topicName: string;
  /** True when the syllabus lists this topic but no exam question covers it. */
  isGap: boolean;
  questionCount: number;
}

/** Deterministic, cached analytics (D-014). Never recomputed per viewer. */
export interface SharedAnalytics {
  totalPapers: number;
  totalQuestions: number;
  uniqueQuestions: number;
  repeatRatePercentage: number;
  priorityDistribution: Record<string, number>;
  topicWeights: SharedTopicWeight[];
  yearTrends: { year: number; questionCount: number }[];
}

/** The complete response body of `GET /api/share/[token]`. */
export interface SharedFolder {
  folderName: string;
  subject: string | null;
  examName: string | null;
  years: SharedYear[];
  analytics: SharedAnalytics;
  questionGroups: SharedQuestionGroup[];
  coverage: SharedCoverageGap[];
  /**
   * The reference year analytics were computed against, so a viewer can tell
   * how current the analysis is (D-014).
   */
  referenceYear: number | null;
}

/**
 * The exact top-level key set of a share response.
 *
 * Exists so a test can assert the response's keys equal this list, which fails
 * the moment a field leaks into the projection. AGENTS.md requires verifying
 * that a share link exposes only its intended read-only projection, and a key-set
 * assertion is how that becomes an executable check rather than a claim.
 */
export const SHARED_FOLDER_KEYS = [
  "folderName",
  "subject",
  "examName",
  "years",
  "analytics",
  "questionGroups",
  "coverage",
  "referenceYear",
] as const satisfies readonly (keyof SharedFolder)[];

/** As above, for a single question group — the largest leak risk. */
export const SHARED_QUESTION_GROUP_KEYS = [
  "id",
  "canonicalText",
  "questionLabel",
  "marks",
  "questionType",
  "difficulty",
  "topicName",
  "repeatCount",
  "distinctYears",
  "firstYear",
  "lastYear",
  "priorityLevel",
  "priorityScore",
  "priorityReason",
  "pageNumbers",
  "hasLowConfidenceExtraction",
  "similarVariationCount",
] as const satisfies readonly (keyof SharedQuestionGroup)[];
