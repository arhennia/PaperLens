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
import { buttonPrimary, buttonSecondary } from "@/components/ui/button";
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
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [difficultyFilter, setDifficultyFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [openTopics, setOpenTopics] = useState<Set<string>>(
    () => new Set(topicGroups.length <= 3 ? topicGroups.map((tg) => tg.topic?.id ?? "uncategorized") : []),
  );

  const normalizedQuery = query.trim().toLowerCase();
  const filteredTopicGroups = topicGroups
    .map((topicGroup) => ({
      ...topicGroup,
      groups: topicGroup.groups.filter((group) => {
        const matchesQuery =
          !normalizedQuery ||
          `${group.question_label ?? ""} ${group.canonical_text}`
            .toLowerCase()
            .includes(normalizedQuery);
        const matchesType =
          typeFilter === "all" || group.question_type === typeFilter;
        const matchesDifficulty =
          difficultyFilter === "all" || group.difficulty === difficultyFilter;
        const matchesPriority =
          priorityFilter === "all" || group.priority_level === priorityFilter;
        return matchesQuery && matchesType && matchesDifficulty && matchesPriority;
      }),
    }))
    .filter((topicGroup) => topicGroup.groups.length > 0);

  const filteredGroups = filteredTopicGroups.flatMap((topicGroup) =>
    topicGroup.groups.map((group) => ({
      ...group,
      topicName: topicGroup.topic?.name ?? "Uncategorized",
    })),
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
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-ink">Topics & Questions</h2>
          <p className="mt-1 text-xs text-faint">
            Showing {filteredGroups.length} of {topicGroups.reduce((count, topic) => count + topic.groups.length, 0)} questions
          </p>
        </div>
        <ExportControls groups={filteredGroups} />
      </div>

      <div className="grid gap-2 rounded-lg border border-border bg-canvas p-3 sm:grid-cols-2 lg:grid-cols-4">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search questions"
          aria-label="Search questions"
          className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
        />
        <FilterSelect label="Type" value={typeFilter} onChange={setTypeFilter} options={Object.keys(QUESTION_TYPE_LABELS)} labels={QUESTION_TYPE_LABELS} />
        <FilterSelect label="Difficulty" value={difficultyFilter} onChange={setDifficultyFilter} options={Object.keys(DIFFICULTY_LABELS)} labels={DIFFICULTY_LABELS} />
        <FilterSelect label="Priority" value={priorityFilter} onChange={setPriorityFilter} options={Object.keys(PRIORITY_LABELS)} labels={PRIORITY_LABELS} />
      </div>

      {filteredTopicGroups.map((tg) => {
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

function FilterSelect({
  label,
  value,
  onChange,
  options,
  labels,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  labels: Record<string, string>;
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-muted">
      <span>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-w-0 flex-1 rounded-md border border-border bg-surface px-2 py-2 text-sm text-ink outline-none focus:border-accent"
      >
        <option value="all">All</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {labels[option] ?? option}
          </option>
        ))}
      </select>
    </label>
  );
}

type ExportGroup = TopicGroup["groups"][number] & { topicName: string };

function ExportControls({ groups }: { groups: ExportGroup[] }) {
  function download(filename: string, content: string, type: string) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function markdown() {
    const content = groups
      .map((group) => {
        const metadata = [
          group.topicName,
          group.marks != null ? `${formatMarks(group.marks)} marks` : null,
          group.occurrence_count > 1 ? formatRepeatBadge(group.occurrence_count) : null,
        ].filter(Boolean).join(" | ");
        return `### ${group.question_label ?? "Question"}\n\n${group.canonical_text}\n\n_${metadata}_`;
      })
      .join("\n\n");
    download("paperlens-study-guide.md", content, "text/markdown;charset=utf-8");
  }

  function latex() {
    const escapeLatex = (value: string) => value.replace(/([\\{}%$&#_])/g, "\\$1");
    const content = groups
      .map((group) => `\\subsection*{${escapeLatex(group.question_label ?? "Question")}}\n${escapeLatex(group.canonical_text)}\\\\\n\\textit{${escapeLatex(group.topicName)}}`)
      .join("\n\n");
    download("paperlens-study-guide.tex", `\\documentclass{article}\n\\begin{document}\n${content}\n\\end{document}\n`, "application/x-latex;charset=utf-8");
  }

  function anki() {
    const content = groups
      .map((group) => `${csv(group.canonical_text)}\t${csv(`Topic: ${group.topicName}. Marks: ${formatMarks(group.marks)}. Repeated: ${group.occurrence_count}x`)}`)
      .join("\n");
    download("paperlens-anki.tsv", content, "text/tab-separated-values;charset=utf-8");
  }

  function printGuide() {
    const popup = window.open("", "_blank");
    if (!popup) return;
    popup.document.write(`<html><head><title>PaperLens Study Guide</title><style>body{font-family:Georgia,serif;max-width:760px;margin:40px auto;line-height:1.6}article{break-inside:avoid;margin-bottom:24px}small{color:#666}</style></head><body><h1>PaperLens Study Guide</h1>${groups.map((group) => `<article><h2>${escapeHtml(group.question_label ?? "Question")}</h2><p>${escapeHtml(group.canonical_text)}</p><small>${escapeHtml(group.topicName)} | ${escapeHtml(formatMarks(group.marks))} marks | ${group.occurrence_count} occurrences</small></article>`).join("")}</body></html>`);
    popup.document.close();
    popup.focus();
    popup.print();
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={markdown} disabled={groups.length === 0} className={buttonSecondary}>Markdown</button>
      <button type="button" onClick={latex} disabled={groups.length === 0} className={buttonSecondary}>LaTeX</button>
      <button type="button" onClick={anki} disabled={groups.length === 0} className={buttonSecondary}>Anki TSV</button>
      <button type="button" onClick={printGuide} disabled={groups.length === 0} className={buttonPrimary}>Print PDF</button>
    </div>
  );
}

function csv(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
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
