/**
 * Display formatting and the labels shown for database enum values.
 *
 * This is the single source of user-facing strings for repeated concepts:
 * priority levels, question types, difficulties, and the repeat badge. Keeping
 * them here means the folder page, the share page, and an exported study guide
 * cannot disagree about what `very_high` is called.
 *
 * Pure functions only — no React, no database. Everything here is unit-testable
 * and safe to call from both server and client components.
 */

import type {
  Difficulty,
  PriorityLevel,
  QuestionType,
} from "@/types/database.generated";

/** Priority levels, most important first. Matches the database check constraint. */
export const PRIORITY_ORDER: readonly PriorityLevel[] = [
  "critical",
  "very_high",
  "high",
  "medium",
  "low",
] as const;

export const PRIORITY_LABELS: Record<PriorityLevel, string> = {
  critical: "Critical",
  very_high: "Very high",
  high: "High",
  medium: "Medium",
  low: "Low",
};

/**
 * Tailwind classes per priority level.
 *
 * Colour is never the only signal: every badge also carries its text label, so
 * the information survives greyscale printing and colour-blindness.
 */
export const PRIORITY_CLASSES: Record<PriorityLevel, string> = {
  critical: "bg-critical-soft text-critical border-critical/30",
  very_high: "bg-very-high-soft text-very-high border-very-high/30",
  high: "bg-high-soft text-high border-high/30",
  medium: "bg-medium-soft text-medium border-medium/30",
  low: "bg-low-soft text-low border-low/30",
};

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  numerical: "Numerical",
  derivation: "Derivation",
  diagram: "Diagram",
  short_note: "Short note",
  descriptive: "Descriptive",
};

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
};

export const DIFFICULTY_CLASSES: Record<Difficulty, string> = {
  easy: "bg-success-soft text-success border-success/30",
  medium: "bg-medium-soft text-medium border-medium/30",
  hard: "bg-danger-soft text-danger border-danger/30",
};

/**
 * Looks up a label for a value that may be null or unrecognised.
 *
 * Extraction legitimately produces `null` when there is no signal (D-037), and
 * an untagged question must read as untagged rather than as a wrong guess.
 */
export function labelFor<T extends string>(
  value: T | null | undefined,
  labels: Record<T, string>,
): string | null {
  if (!value) return null;
  return labels[value] ?? null;
}

/** Formats a percentage for display. Input is already 0–100, not a fraction. */
export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  // One decimal place, but no trailing ".0" — "23%" reads better than "23.0%".
  const rounded = Math.round(value * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}%`;
}

/** Formats a marks value, dropping a meaningless trailing zero. */
export function formatMarks(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/**
 * The repeat badge, e.g. `Repeated 3x`.
 *
 * Returns null for a single occurrence: "Repeated 1x" is not a repeat, and
 * showing it would dilute the badge that matters. This is exact-hash based and
 * therefore factual (D-024) — advisory fuzzy matches use
 * {@link formatSimilarVariations} instead, which deliberately says "similar".
 */
export function formatRepeatBadge(count: number): string | null {
  if (!Number.isFinite(count) || count < 2) return null;
  return `Repeated ${Math.trunc(count)}x`;
}

/**
 * Advisory near-duplicate count.
 *
 * Worded as "variation" rather than "same" on purpose: the 0.84 similarity
 * threshold is unvalidated, so this must never read as identity (D-024).
 */
export function formatSimilarVariations(count: number): string | null {
  if (!Number.isFinite(count) || count < 1) return null;
  const n = Math.trunc(count);
  return `${n} similar variation${n === 1 ? "" : "s"}`;
}

/** Formats a list of years as a compact range, e.g. `2021–2024`. */
export function formatYearRange(
  first: number | null,
  last: number | null,
): string {
  if (first === null && last === null) return "Year unknown";
  if (first === null) return String(last);
  if (last === null) return String(first);
  return first === last ? String(first) : `${first}–${last}`;
}

/** Formats page references, e.g. `p. 3` or `pp. 3, 7`. */
export function formatPageReferences(pages: readonly number[]): string | null {
  const unique = [...new Set(pages.filter((p) => Number.isFinite(p) && p >= 1))];
  if (unique.length === 0) return null;
  unique.sort((a, b) => a - b);
  return unique.length === 1 ? `p. ${unique[0]}` : `pp. ${unique.join(", ")}`;
}

/** Formats a timestamp as a short absolute date. Absolute, not relative, so a
 * cached analytics date does not silently read as "just now" on a stale page. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Human-readable file size for the upload list. */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
