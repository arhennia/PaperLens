"use client";

/**
 * Topic accordions — the core question display.
 *
 * Groups questions by topic. Each topic is a collapsible section. Per question:
 * KaTeX-rendered canonical text, type/difficulty/priority badges, repeat count,
 * year range, page references, and low-confidence OCR warnings.
 *
 * Uses every display primitive: Badge, MathText, and all format helpers.
 */

import { useState } from "react";

import { MathText } from "@/components/ui/math-text";
import { Badge } from "@/components/ui/badge";
import {
  formatRepeatBadge,
  formatYearRange,
  formatPageReferences,
  formatMarks,
  labelFor,
  QUESTION_TYPE_LABELS,
  DIFFICULTY_LABELS,
  DIFFICULTY_CLASSES,
  PRIORITY_LABELS,
  PRIORITY_CLASSES,
} from "@/lib/format";
import type {
  QuestionGroupsRow,
  QuestionsRow,
  TopicsRow,
  QuestionType,
  Difficulty,
  PriorityLevel,
} from "@/types/database.generated";

interface TopicGroup {
  topic: TopicsRow | null;
  groups: (QuestionGroupsRow & {
    question_label?: string | null;
    page_numbers?: number[];
    has_low_confidence?: boolean;
    question_type?: string | null;
    difficulty?: string | null;
    marks?: number | null;
  })[];
}

export function TopicAccordions({
  topicGroups,
}: {
  topicGroups: TopicGroup[];
}) {
  const [openTopics, setOpenTopics] = useState<Set<string>>(
    () => new Set(topicGroups.length <= 3 ? topicGroups.map((tg) => tg.topic?.id ?? "uncategorized") : []),
  );

  function toggleTopic(topicId: string) {
    setOpenTopics((prev) => {
      const next = new Set(prev);
      if (next.has(topicId)) {
        next.delete(topicId);
      } else {
        next.add(topicId);
      }
      return next;
    });
  }

  if (topicGroups.length === 0) {
    return (
      <div className="mt-8 text-center">
        <p className="text-sm text-muted">
          No questions extracted yet. Upload papers and run analysis to see
          topics here.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-8 space-y-3">
      <h2 className="text-lg font-semibold text-ink">Topics & Questions</h2>

      {topicGroups.map((tg) => {
        const topicId = tg.topic?.id ?? "uncategorized";
        const isOpen = openTopics.has(topicId);
        const topicName = tg.topic?.name ?? "Uncategorized";

        return (
          <div
            key={topicId}
            className="overflow-hidden rounded-lg border border-border bg-surface"
          >
            {/* Accordion header */}
            <button
              type="button"
              onClick={() => toggleTopic(topicId)}
              className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-canvas"
              aria-expanded={isOpen}
            >
              <div className="flex items-center gap-2">
                <svg
                  className={`h-4 w-4 text-faint transition-transform ${isOpen ? "rotate-90" : ""}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="m8.25 4.5 7.5 7.5-7.5 7.5"
                  />
                </svg>
                <span className="font-medium text-ink">{topicName}</span>
                <span className="rounded-full bg-canvas px-2 py-0.5 text-xs text-faint">
                  {tg.groups.length} question{tg.groups.length !== 1 ? "s" : ""}
                </span>
              </div>
            </button>

            {/* Accordion body */}
            {isOpen && (
              <div className="divide-y divide-border border-t border-border">
                {tg.groups.map((group) => (
                  <QuestionGroupCard key={group.id} group={group} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function QuestionGroupCard({
  group,
}: {
  group: QuestionGroupsRow & {
    question_label?: string | null;
    page_numbers?: number[];
    has_low_confidence?: boolean;
    question_type?: string | null;
    difficulty?: string | null;
    marks?: number | null;
  };
}) {
  const repeatBadge = formatRepeatBadge(group.occurrence_count);
  const yearRange = formatYearRange(group.first_year, group.last_year);
  const pageRef = formatPageReferences(group.page_numbers ?? []);
  const typeLabel = labelFor(group.question_type as QuestionType | null, QUESTION_TYPE_LABELS);
  const diffLabel = labelFor(group.difficulty as Difficulty | null, DIFFICULTY_LABELS);
  const priorityLabel = labelFor(group.priority_level as PriorityLevel | null, PRIORITY_LABELS);

  return (
    <div className="px-4 py-3 print-avoid-break">
      {/* Question label and meta line */}
      <div className="flex flex-wrap items-center gap-2">
        {group.question_label && (
          <span className="text-xs font-semibold text-muted">
            {group.question_label}
          </span>
        )}

        {repeatBadge && (
          <Badge className="bg-warning-soft text-warning border-warning/30">
            {repeatBadge}
          </Badge>
        )}

        {priorityLabel && group.priority_level && (
          <Badge
            className={
              PRIORITY_CLASSES[group.priority_level as PriorityLevel] ??
              undefined
            }
          >
            {priorityLabel}
          </Badge>
        )}

        {typeLabel && (
          <Badge className="bg-accent-soft text-accent border-accent/30">
            {typeLabel}
          </Badge>
        )}

        {diffLabel && group.difficulty && (
          <Badge
            className={
              DIFFICULTY_CLASSES[group.difficulty as Difficulty] ?? undefined
            }
          >
            {diffLabel}
          </Badge>
        )}

        {group.marks != null && (
          <span className="text-xs text-faint">
            {formatMarks(group.avg_marks ?? group.marks)} marks
          </span>
        )}
      </div>

      {/* Question text with KaTeX */}
      <div className="mt-2 text-sm leading-relaxed text-ink">
        <MathText>{group.canonical_text}</MathText>
      </div>

      {/* Footer meta */}
      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-faint">
        <span>{yearRange}</span>
        {group.distinct_years > 1 && (
          <span>{group.distinct_years} years</span>
        )}
        {pageRef && <span>{pageRef}</span>}
        {group.has_low_confidence && (
          <span
            className="text-warning"
            title="Some text was extracted with low OCR confidence. Check the original PDF."
          >
            ⚠ Low-confidence OCR
          </span>
        )}
      </div>
    </div>
  );
}
