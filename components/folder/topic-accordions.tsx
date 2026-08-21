"use client";

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
  TopicsRow,
  QuestionType,
  Difficulty,
  PriorityLevel,
} from "@/types/database.generated";

interface TopicGroup {
  topic: (TopicsRow & { weightage_percent?: number | null }) | null;
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
    () => new Set(topicGroups.map((tg) => tg.topic?.id ?? "uncategorized")),
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

  function expandAll() {
    setOpenTopics(new Set(topicGroups.map((tg) => tg.topic?.id ?? "uncategorized")));
  }

  function collapseAll() {
    setOpenTopics(new Set());
  }

  if (topicGroups.length === 0) {
    return (
      <div className="mt-8 rounded-2xl border border-border bg-surface p-8 text-center">
        <span className="material-symbols-outlined text-3xl text-faint">
          psychology_alt
        </span>
        <p className="mt-2 text-sm font-semibold text-ink">
          No questions categorized yet
        </p>
        <p className="mt-1 text-xs text-muted">
          Upload question paper PDFs above and PaperLens will automatically parse and group questions by topic.
        </p>
      </div>
    );
  }

  const totalQuestions = topicGroups.reduce(
    (acc, tg) => acc + tg.groups.length,
    0,
  );

  return (
    <div className="mt-8 space-y-4">
      {/* Section Header & Expand/Collapse Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary text-xl">
            menu_book
          </span>
          <h2 className="text-base font-bold text-ink">
            Topic & Question Intelligence
          </h2>
          <span className="rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-semibold text-primary">
            {totalQuestions} questions across {topicGroups.length} topic{topicGroups.length === 1 ? "" : "s"}
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <button
            type="button"
            onClick={expandAll}
            className="text-muted hover:text-primary transition-colors font-medium cursor-pointer"
          >
            Expand All
          </button>
          <span className="text-faint">•</span>
          <button
            type="button"
            onClick={collapseAll}
            className="text-muted hover:text-primary transition-colors font-medium cursor-pointer"
          >
            Collapse All
          </button>
        </div>
      </div>

      {/* Accordions */}
      <div className="space-y-3">
        {topicGroups.map((tg) => {
          const topicId = tg.topic?.id ?? "uncategorized";
          const isOpen = openTopics.has(topicId);
          const topicName = tg.topic?.name ?? "Uncategorized Concepts";

          return (
            <div
              key={topicId}
              className="overflow-hidden rounded-xl border border-border bg-surface shadow-xs transition-all"
            >
              {/* Accordion header */}
              <button
                type="button"
                onClick={() => toggleTopic(topicId)}
                className="flex w-full items-center justify-between px-5 py-3.5 text-left transition-colors hover:bg-surface-container-low cursor-pointer"
                aria-expanded={isOpen}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`material-symbols-outlined text-faint transition-transform duration-200 text-[20px] ${
                      isOpen ? "rotate-90 text-primary" : ""
                    }`}
                  >
                    chevron_right
                  </span>
                  <span className="font-bold text-sm text-ink">{topicName}</span>
                  <span className="rounded-md bg-surface-container px-2 py-0.5 text-[11px] font-semibold text-muted">
                    {tg.groups.length} {tg.groups.length === 1 ? "question" : "questions"}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {tg.topic?.weightage_percent != null && (
                    <span className="text-xs font-bold text-primary">
                      {tg.topic.weightage_percent.toFixed(0)}% Weightage
                    </span>
                  )}
                </div>
              </button>

              {/* Accordion body */}
              {isOpen && (
                <div className="divide-y divide-border border-t border-border bg-surface">
                  {tg.groups.map((group) => (
                    <QuestionGroupCard key={group.id} group={group} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
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
    <div className="p-4 hover:bg-surface-container-low/30 transition-colors print-avoid-break">
      {/* Top Meta Line: Badges & Marks */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {group.question_label && (
            <span className="rounded bg-surface-container px-1.5 py-0.5 text-xs font-mono font-bold text-ink">
              {group.question_label}
            </span>
          )}

          {repeatBadge && (
            <Badge className="bg-warning-soft text-warning border-warning/30 font-bold">
              🔥 {repeatBadge}
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
            <Badge className="bg-secondary-soft text-secondary border-secondary/30">
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
        </div>

        {group.marks != null && (
          <span className="rounded-md bg-surface-container-low px-2 py-0.5 text-xs font-semibold text-ink border border-border">
            {formatMarks(group.avg_marks ?? group.marks)} Marks
          </span>
        )}
      </div>

      {/* Canonical Question text with KaTeX Math rendering */}
      <div className="mt-2.5 text-xs md:text-sm leading-relaxed text-ink font-normal">
        <MathText>{group.canonical_text}</MathText>
      </div>

      {/* Footer Provenance Meta */}
      <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-faint">
        <span className="flex items-center gap-1 text-muted font-medium">
          <span className="material-symbols-outlined text-[14px]">calendar_today</span>
          {yearRange}
        </span>

        {group.distinct_years > 1 && (
          <span>• Seen across {group.distinct_years} exam years</span>
        )}

        {pageRef && <span>• {pageRef}</span>}

        {group.has_low_confidence && (
          <span
            className="flex items-center gap-1 text-warning font-medium"
            title="Some text was extracted with low OCR confidence. Check original PDF."
          >
            <span className="material-symbols-outlined text-[14px]">warning</span>
            Low-confidence OCR
          </span>
        )}
      </div>
    </div>
  );
}
