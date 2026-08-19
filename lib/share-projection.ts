/**
 * Building the public share projection (D-017).
 *
 * ===========================================================================
 * THIS FILE IS THE ENTIRE PUBLIC SURFACE OF PAPERLENS.
 *
 * Everything it returns is world-readable by anyone holding a share link. There
 * is no login, no RLS, and no second check downstream — the route handler serves
 * whatever this function produces.
 *
 * Two rules make that safe, and both are load-bearing:
 *
 *   1. **Every field is assigned by name.** Never `...row`, never
 *      `Object.assign`, never a helper that copies unknown keys. A column added
 *      to `question_groups` six months from now must not appear here on its own.
 *      That is the whole reason `types/share.ts` is hand-written rather than
 *      derived from the database types.
 *
 *   2. **This function is pure.** It takes plain rows and returns a plain object,
 *      so the allowlist can be tested exhaustively without a database — see
 *      `lib/share-projection.test.ts`, which feeds it rows deliberately polluted
 *      with `user_id`, `storage_path` and `normalized_hash` and asserts none of
 *      them survive.
 *
 * If you are adding a field: ask whether a classmate holding a link should see
 * it, add it to `types/share.ts` first, and expect the key-set tests to fail
 * until you have updated them deliberately.
 * ===========================================================================
 */

import type {
  SharedAnalytics,
  SharedCoverageGap,
  SharedFolder,
  SharedQuestionGroup,
  SharedTopicWeight,
  SharedYear,
} from "@/types/share";

/**
 * The inputs this projection reads.
 *
 * Typed loosely as the fields actually needed rather than as full table rows.
 * That is deliberate: a narrow input type means a caller cannot accidentally
 * pass a wider row and have an extra column picked up, and it documents exactly
 * which columns the public path touches.
 */
export interface ShareProjectionInput {
  folder: {
    name: string;
    subject: string | null;
    exam_name: string | null;
    reference_year: number | null;
  };
  /** Accepted papers, for the year list. */
  papers: { year: number | null }[];
  /** The cached deterministic analytics payload (D-014). Never recomputed. */
  analyticsPayload: unknown;
  groups: ShareGroupInput[];
}

/** One question group and the derived facts about it the public may see. */
export interface ShareGroupInput {
  id: string;
  canonical_text: string;
  marks: number | null;
  question_type: string | null;
  difficulty: string | null;
  priority_level: string | null;
  priority_score: number | null;
  priority_reason: string | null;
  occurrence_count: number;
  distinct_years: number;
  first_year: number | null;
  last_year: number | null;
  /** Label of one representative occurrence, e.g. `Q5(a)`. */
  question_label: string | null;
  topic_name: string | null;
  /** Pages this question was found on, for checking diagrams against the PDF. */
  page_numbers: number[];
  /** True when any occurrence came from a low-confidence or failed OCR page. */
  has_low_confidence_extraction: boolean;
  /** Advisory near-duplicate count. Never presented as sameness (D-024). */
  similar_variation_count: number;
}

/**
 * Builds the complete public response body.
 *
 * Pure. Every returned field is named explicitly; nothing is spread.
 */
export function buildSharedFolder(input: ShareProjectionInput): SharedFolder {
  return {
    folderName: input.folder.name,
    subject: input.folder.subject,
    examName: input.folder.exam_name,
    years: buildYears(input.papers),
    analytics: buildAnalytics(input.analyticsPayload),
    questionGroups: input.groups.map(buildQuestionGroup),
    coverage: buildCoverage(input.analyticsPayload),
    referenceYear: input.folder.reference_year,
  };
}

/**
 * One entry per distinct exam year, with how many papers came from it.
 *
 * Papers with no detected year are omitted rather than shown as year `null`: a
 * "null" row in a public list is confusing and says more about processing state
 * than about the exams.
 */
function buildYears(papers: { year: number | null }[]): SharedYear[] {
  const counts = new Map<number, number>();
  for (const paper of papers) {
    if (paper.year === null || !Number.isFinite(paper.year)) continue;
    counts.set(paper.year, (counts.get(paper.year) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([year, paperCount]) => ({ year, paperCount }))
    .sort((a, b) => b.year - a.year);
}

/** One question group, field by field. */
function buildQuestionGroup(group: ShareGroupInput): SharedQuestionGroup {
  return {
    // Safe to expose: a random uuid, not derived from content. A viewer cannot
    // learn anything from it, and the checklist and flashcard views need a key.
    id: group.id,
    canonicalText: group.canonical_text,
    questionLabel: group.question_label,
    marks: group.marks,
    questionType: group.question_type,
    difficulty: group.difficulty,
    topicName: group.topic_name,
    repeatCount: group.occurrence_count,
    distinctYears: group.distinct_years,
    firstYear: group.first_year,
    lastYear: group.last_year,
    priorityLevel: group.priority_level,
    priorityScore: group.priority_score,
    priorityReason: group.priority_reason,
    pageNumbers: [...group.page_numbers].sort((a, b) => a - b),
    // A boolean, not the raw score: the warning is the useful part, and a numeric
    // confidence would say more about extraction quality than a viewer needs
    // (D-017).
    hasLowConfidenceExtraction: group.has_low_confidence_extraction,
    similarVariationCount: group.similar_variation_count,
  };
}

/**
 * Maps the cached analytics payload to its public shape.
 *
 * The payload is `jsonb` written by the Python worker
 * (`backend/analysis/analytics.py`), so it arrives snake_case and — from
 * TypeScript's point of view — untyped. It is read key by key with defaults
 * rather than cast, for two reasons: a `payload as SharedAnalytics` cast would
 * silently publish any extra key the worker starts writing, and a folder whose
 * analytics predate a payload change would otherwise produce `undefined` in a
 * public response.
 */
function buildAnalytics(payload: unknown): SharedAnalytics {
  const source = asRecord(payload);

  return {
    totalPapers: asCount(source.total_papers),
    totalQuestions: asCount(source.total_questions),
    uniqueQuestions: asCount(source.unique_questions),
    repeatRatePercentage: asNumber(source.repeat_rate_percentage) ?? 0,
    priorityDistribution: buildPriorityDistribution(
      source.priority_distribution,
    ),
    topicWeights: buildTopicWeights(source.topic_weights),
    yearTrends: buildYearTrends(source.year_trends),
  };
}

/**
 * Priority counts, restricted to the five known levels.
 *
 * Filtering rather than copying the object matters: this is a
 * `Record<string, number>` in the public type, so copying it wholesale would
 * publish any key the worker put there.
 */
function buildPriorityDistribution(value: unknown): Record<string, number> {
  const source = asRecord(value);
  const levels = ["critical", "very_high", "high", "medium", "low"] as const;
  const result: Record<string, number> = {};
  for (const level of levels) {
    result[level] = asCount(source[level]);
  }
  return result;
}

function buildTopicWeights(value: unknown): SharedTopicWeight[] {
  return asArray(value).map((entry) => {
    const weight = asRecord(entry);
    return {
      topicName: asString(weight.topic_name) ?? "Uncategorized",
      questionCount: asCount(weight.question_count),
      marksPercentage: asNumber(weight.marks_percentage) ?? 0,
      frequencyPercentage: asNumber(weight.frequency_percentage) ?? 0,
    };
  });
}

function buildYearTrends(value: unknown): { year: number; questionCount: number }[] {
  return asArray(value)
    .map((entry) => {
      const trend = asRecord(entry);
      return {
        year: asCount(trend.year),
        questionCount: asCount(trend.question_count),
      };
    })
    .filter((trend) => trend.year > 0);
}

/**
 * Syllabus coverage gaps — differentiator #3.
 *
 * Read from the cached payload's `coverage` key, which the worker writes. Note
 * `source` is deliberately dropped: whether a topic came from a syllabus, the
 * user, or a generic default is useful to the owner and is not a public fact.
 */
function buildCoverage(payload: unknown): SharedCoverageGap[] {
  const source = asRecord(payload);
  return asArray(source.coverage).map((entry) => {
    const gap = asRecord(entry);
    return {
      topicName: asString(gap.topic_name) ?? "Uncategorized",
      isGap: gap.is_gap === true,
      questionCount: asCount(gap.question_count),
    };
  });
}

// ---------------------------------------------------------------------------
// Narrowing helpers for the untyped jsonb payload.
//
// Each returns a safe default rather than throwing: a folder analysed under an
// older payload shape should render with a zero, not fail the whole public page.
// ---------------------------------------------------------------------------

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** A non-negative integer count. Clamps rather than trusting the payload. */
function asCount(value: unknown): number {
  const n = asNumber(value);
  return n === null ? 0 : Math.max(0, Math.trunc(n));
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}
