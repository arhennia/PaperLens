"use client";

/**
 * Study tools tabs: checklist, flashcards, and mock paper.
 *
 * Each tab is a distinct interaction mode for the same question data:
 *   - Checklist: track which high-yield questions you've studied
 *   - Flashcards: active recall with card-flip interface
 *   - Mock paper: AI-predicted paper with collapsible answer hints
 *
 * LLM calls are gated by `lib/llm.ts` (cache → rate limit → budget → cap).
 * The checklist persists to `generated_artifacts` via server action.
 */

import { useCallback, useEffect, useState, useTransition } from "react";

import { MathText } from "@/components/ui/math-text";
import { Badge } from "@/components/ui/badge";
import { buttonPrimary, buttonSecondary, buttonGhost } from "@/components/ui/button";
import { formatRepeatBadge, labelFor, PRIORITY_LABELS, PRIORITY_CLASSES } from "@/lib/format";
import {
  saveChecklistState,
  loadChecklistState,
  getAnswerHint,
  generateMockPaper,
  type ChecklistState,
  type MockPaper,
} from "@/app/actions/study-tools";
import type { QuestionGroupsRow, PriorityLevel } from "@/types/database.generated";

type Tab = "checklist" | "flashcards" | "mock";

interface StudyGroup {
  id: string;
  canonical_text: string;
  occurrence_count: number;
  priority_level: string | null;
  marks: number | null;
  topic_name: string | null;
}

export function StudyTools({
  folderId,
  groups,
}: {
  folderId: string;
  groups: StudyGroup[];
}) {
  const [activeTab, setActiveTab] = useState<Tab>("checklist");

  const tabs: { id: Tab; label: string }[] = [
    { id: "checklist", label: "High-Yield Checklist" },
    { id: "flashcards", label: "Flashcards" },
    { id: "mock", label: "Mock Paper" },
  ];

  return (
    <div className="mt-8">
      <h2 className="text-lg font-semibold text-ink">Study Tools</h2>

      {/* Tab bar */}
      <div className="mt-3 flex gap-1 rounded-lg bg-canvas p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? "bg-surface text-ink shadow-sm"
                : "text-muted hover:text-ink"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="mt-4">
        {activeTab === "checklist" && (
          <ChecklistTab folderId={folderId} groups={groups} />
        )}
        {activeTab === "flashcards" && <FlashcardTab groups={groups} folderId={folderId} />}
        {activeTab === "mock" && (
          <MockPaperTab folderId={folderId} groups={groups} />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Checklist tab
// ---------------------------------------------------------------------------

function ChecklistTab({
  folderId,
  groups,
}: {
  folderId: string;
  groups: StudyGroup[];
}) {
  const [checked, setChecked] = useState<ChecklistState>({});
  const [loaded, setLoaded] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Load saved state.
  useEffect(() => {
    loadChecklistState(folderId).then((state) => {
      setChecked(state);
      setLoaded(true);
    });
  }, [folderId]);

  const toggle = useCallback(
    (groupId: string) => {
      setChecked((prev) => {
        const next = { ...prev, [groupId]: !prev[groupId] };
        // Save in the background.
        startTransition(() => {
          saveChecklistState(folderId, next);
        });
        return next;
      });
    },
    [folderId, startTransition],
  );

  const checkedCount = Object.values(checked).filter(Boolean).length;

  // Group by topic.
  const byTopic = new Map<string, StudyGroup[]>();
  for (const g of groups) {
    const topic = g.topic_name ?? "Uncategorized";
    const list = byTopic.get(topic) ?? [];
    list.push(g);
    byTopic.set(topic, list);
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted">
          {checkedCount}/{groups.length} completed
        </p>
        <div className="h-2 w-32 overflow-hidden rounded-full bg-border">
          <div
            className="h-full rounded-full bg-success transition-all"
            style={{
              width: `${groups.length > 0 ? (checkedCount / groups.length) * 100 : 0}%`,
            }}
          />
        </div>
      </div>

      {loaded && (
        <div className="space-y-4">
          {[...byTopic.entries()].map(([topic, topicGroups]) => (
            <div key={topic}>
              <h3 className="mb-2 text-sm font-medium text-muted">{topic}</h3>
              <div className="space-y-1">
                {topicGroups.map((g) => (
                  <label
                    key={g.id}
                    className={`flex cursor-pointer items-start gap-3 rounded-lg border border-border px-3 py-2.5 transition-colors hover:bg-canvas ${
                      checked[g.id] ? "bg-success-soft/50 border-success/20" : "bg-surface"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked[g.id] ?? false}
                      onChange={() => toggle(g.id)}
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-border accent-accent"
                    />
                    <div
                      className={`flex-1 text-sm ${checked[g.id] ? "line-through text-faint" : "text-ink"}`}
                    >
                      <MathText>{g.canonical_text}</MathText>
                      <div className="mt-1 flex items-center gap-2">
                        {formatRepeatBadge(g.occurrence_count) && (
                          <span className="text-xs text-warning">
                            {formatRepeatBadge(g.occurrence_count)}
                          </span>
                        )}
                        {g.priority_level && (
                          <span className="text-xs text-faint">
                            {labelFor(g.priority_level as PriorityLevel, PRIORITY_LABELS)}
                          </span>
                        )}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Flashcard tab
// ---------------------------------------------------------------------------

function FlashcardTab({
  groups,
  folderId,
}: {
  groups: StudyGroup[];
  folderId: string;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [hintLoading, setHintLoading] = useState(false);

  if (groups.length === 0) {
    return (
      <p className="text-sm text-muted">
        No questions available for flashcards.
      </p>
    );
  }

  const current = groups[currentIndex];

  async function loadHint() {
    setHintLoading(true);
    try {
      const result = await getAnswerHint(
        folderId,
        current.id,
        current.canonical_text,
      );
      if (result.status === "ok") {
        setHint(result.payload.text);
      } else if (result.status === "not_configured") {
        setHint("AI hints are not configured. Set LLM_API_KEY to enable.");
      } else if (result.status === "budget_exhausted") {
        setHint("Daily AI budget exhausted. Try again tomorrow.");
      } else if (result.status === "rate_limited") {
        setHint("Too many requests. Wait a moment and try again.");
      } else {
        setHint("Could not generate hint.");
      }
    } catch {
      setHint("Failed to load hint.");
    }
    setHintLoading(false);
  }

  function flip() {
    if (!isFlipped && !hint) {
      loadHint();
    }
    setIsFlipped(!isFlipped);
  }

  function next() {
    setCurrentIndex((i) => (i + 1) % groups.length);
    setIsFlipped(false);
    setHint(null);
  }

  function prev() {
    setCurrentIndex((i) => (i - 1 + groups.length) % groups.length);
    setIsFlipped(false);
    setHint(null);
  }

  return (
    <div className="flex flex-col items-center">
      <p className="mb-3 text-xs text-faint">
        Card {currentIndex + 1} of {groups.length}
      </p>

      {/* Card */}
      <div
        onClick={flip}
        className="flex min-h-[200px] w-full max-w-lg cursor-pointer items-center justify-center rounded-xl border border-border bg-surface p-6 shadow-sm transition-all hover:shadow-md"
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === " " || e.key === "Enter") flip();
        }}
      >
        {!isFlipped ? (
          <div className="text-center">
            <p className="text-xs text-faint mb-2">Question</p>
            <div className="text-sm leading-relaxed text-ink">
              <MathText>{current.canonical_text}</MathText>
            </div>
            <p className="mt-4 text-xs text-faint">Click to reveal answer</p>
          </div>
        ) : (
          <div className="text-center">
            <p className="text-xs text-faint mb-2">Answer Hint</p>
            <div className="text-sm leading-relaxed text-ink">
              {hintLoading ? (
                <span className="text-muted">Loading hint…</span>
              ) : (
                <MathText>{hint}</MathText>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="mt-4 flex items-center gap-3">
        <button type="button" onClick={prev} className={buttonSecondary}>
          ← Previous
        </button>
        <button type="button" onClick={next} className={buttonPrimary}>
          Next →
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mock paper tab
// ---------------------------------------------------------------------------

function MockPaperTab({
  folderId,
  groups,
}: {
  folderId: string;
  groups: StudyGroup[];
}) {
  const [mockPaper, setMockPaper] = useState<MockPaper | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [expandedHints, setExpandedHints] = useState<Set<number>>(new Set());

  function generate() {
    setError(null);
    startTransition(async () => {
      // Build a summary of question patterns.
      const summary = groups
        .slice(0, 50)
        .map(
          (g) =>
            `- "${g.canonical_text.slice(0, 120)}" (repeated ${g.occurrence_count}x, ${g.marks ?? "?"} marks, topic: ${g.topic_name ?? "unknown"})`,
        )
        .join("\n");

      const result = await generateMockPaper(folderId, summary);

      if (result.status === "ok") {
        setMockPaper(result.payload);
      } else if (result.status === "not_configured") {
        setError("AI not configured. Set LLM_API_KEY to enable mock papers.");
      } else if (result.status === "budget_exhausted") {
        setError("Daily AI budget exhausted.");
      } else if (result.status === "rate_limited") {
        setError("Rate limited. Try again in a moment.");
      } else {
        setError("Failed to generate mock paper.");
      }
    });
  }

  function toggleHint(index: number) {
    setExpandedHints((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }

  if (!mockPaper) {
    return (
      <div className="flex flex-col items-center gap-4 py-8">
        <p className="text-sm text-muted">
          Generate an AI-predicted mock paper based on question frequency,
          recency, and mark distribution.
        </p>
        {error && (
          <p className="text-sm text-danger">{error}</p>
        )}
        <button
          type="button"
          onClick={generate}
          className={buttonPrimary}
          disabled={isPending || groups.length === 0}
        >
          {isPending ? "Generating…" : "Generate Mock Paper"}
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-base font-semibold text-ink">
          {mockPaper.title}
        </h3>
        <span className="text-sm text-muted">
          Total: {mockPaper.totalMarks} marks
        </span>
      </div>

      <div className="space-y-3">
        {mockPaper.questions.map((q, idx) => (
          <div
            key={idx}
            className="rounded-lg border border-border bg-surface p-4"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <span className="text-xs font-semibold text-muted">
                  Q{idx + 1}.
                </span>
                <span className="ml-2 text-sm text-ink">
                  <MathText>{q.text}</MathText>
                </span>
              </div>
              <span className="shrink-0 text-xs text-faint">
                [{q.marks} marks]
              </span>
            </div>

            <div className="mt-2 flex items-center gap-2">
              <Badge className="bg-accent-soft text-accent border-accent/30">
                {q.topic}
              </Badge>
              <span className="text-xs text-faint">{q.source}</span>
            </div>

            {/* Collapsible answer hint */}
            <button
              type="button"
              onClick={() => toggleHint(idx)}
              className={`${buttonGhost} mt-2 text-xs`}
            >
              {expandedHints.has(idx) ? "Hide hint" : "Show answer hint"}
            </button>
            {expandedHints.has(idx) && (
              <div className="mt-2 rounded-md border border-border bg-canvas px-3 py-2 text-sm text-muted">
                <AnswerHintInline
                  folderId={folderId}
                  groupId={`mock-${idx}`}
                  questionText={q.text}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => {
          setMockPaper(null);
          setExpandedHints(new Set());
        }}
        className={`${buttonSecondary} mt-4`}
      >
        Generate another
      </button>
    </div>
  );
}

/** Inline answer hint that loads on mount. */
function AnswerHintInline({
  folderId,
  groupId,
  questionText,
}: {
  folderId: string;
  groupId: string;
  questionText: string;
}) {
  const [hint, setHint] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAnswerHint(folderId, groupId, questionText)
      .then((result) => {
        if (result.status === "ok") {
          setHint(result.payload.text);
        } else {
          setHint("Hint unavailable.");
        }
      })
      .catch(() => setHint("Failed to load hint."))
      .finally(() => setLoading(false));
  }, [folderId, groupId, questionText]);

  if (loading) return <span className="text-faint">Loading…</span>;
  return <MathText>{hint}</MathText>;
}
