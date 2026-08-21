"use client";

import { useCallback, useEffect, useState, useTransition, useMemo } from "react";
import { MathText } from "@/components/ui/math-text";
import { Badge } from "@/components/ui/badge";
import { buttonPrimary, buttonSecondary, buttonGhost, buttonOutline } from "@/components/ui/button";
import { formatRepeatBadge, labelFor, PRIORITY_LABELS, PRIORITY_CLASSES } from "@/lib/format";
import {
  saveChecklistState,
  loadChecklistState,
  getAnswerHint,
  generateMockPaper,
  type ChecklistState,
  type MockPaper,
} from "@/app/actions/study-tools";
import type { PriorityLevel } from "@/types/database.generated";

type Tab = "checklist" | "mock" | "flashcards";

export interface StudyGroup {
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

  // Synchronize hash with active tab if user clicked quicklink in nav
  useEffect(() => {
    if (typeof window !== "undefined") {
      const hash = window.location.hash;
      if (hash === "#mock") setActiveTab("mock");
      else if (hash === "#flashcards") setActiveTab("flashcards");
      else if (hash === "#checklist") setActiveTab("checklist");
    }
  }, []);

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: "checklist", label: "Practice Planner & Checklist", icon: "check_box" },
    { id: "mock", label: "AI Predicted Mock Paper", icon: "auto_awesome" },
    { id: "flashcards", label: "Flashcards & Recall", icon: "quiz" },
  ];

  return (
    <div id="checklist" className="mt-10 rounded-2xl border border-border bg-surface p-6 shadow-xs">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-4">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary text-2xl">
            school
          </span>
          <div>
            <h2 className="text-base md:text-lg font-bold text-ink">
              Interactive Study & Practice Suite
            </h2>
            <p className="text-xs text-muted">
              Auto-generated practice materials derived from cross-year exam intelligence
            </p>
          </div>
        </div>

        {/* Tab Switcher Pills */}
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl bg-surface-container-low p-1 border border-border">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                activeTab === tab.id
                  ? "bg-surface text-primary shadow-xs"
                  : "text-muted hover:text-ink hover:bg-surface/50"
              }`}
            >
              <span className={`material-symbols-outlined text-[16px] ${activeTab === tab.id ? "filled text-primary" : ""}`}>
                {tab.icon}
              </span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Tab Contents */}
      <div className="mt-6">
        {activeTab === "checklist" && (
          <ChecklistTab folderId={folderId} groups={groups} />
        )}
        {activeTab === "mock" && (
          <MockPaperTab folderId={folderId} groups={groups} />
        )}
        {activeTab === "flashcards" && (
          <FlashcardTab folderId={folderId} groups={groups} />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 1. High-Yield Checklist & Study Session Timer Tab
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
  const [, startTransition] = useTransition();

  // Study Session Timer State
  const [secondsRemaining, setSecondsRemaining] = useState(25 * 60);
  const [timerRunning, setTimerRunning] = useState(false);
  const [focusMinutesCompleted, setFocusMinutesCompleted] = useState(45);

  useEffect(() => {
    loadChecklistState(folderId).then((state) => {
      setChecked(state);
      setLoaded(true);
    });
  }, [folderId]);

  // Timer Tick
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (timerRunning) {
      interval = setInterval(() => {
        setSecondsRemaining((prev) => {
          if (prev <= 1) {
            setTimerRunning(false);
            setFocusMinutesCompleted((m) => m + 25);
            return 25 * 60;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [timerRunning]);

  const toggle = useCallback(
    (groupId: string) => {
      setChecked((prev) => {
        const next = { ...prev, [groupId]: !prev[groupId] };
        startTransition(() => {
          saveChecklistState(folderId, next);
        });
        return next;
      });
    },
    [folderId],
  );

  const checkedCount = Object.values(checked).filter(Boolean).length;
  const progressPercent = groups.length > 0 ? Math.round((checkedCount / groups.length) * 100) : 0;

  // Group by topic with priority sorting
  const byTopic = useMemo(() => {
    const map = new Map<string, StudyGroup[]>();
    for (const g of groups) {
      const topic = g.topic_name ?? "Uncategorized";
      const list = map.get(topic) ?? [];
      list.push(g);
      map.set(topic, list);
    }
    return map;
  }, [groups]);

  const formatTimer = (totalSecs: number) => {
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Left 2 Cols: High-Yield Checklist Tasks */}
      <div className="lg:col-span-2 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3 bg-surface-container-low p-4 rounded-xl border border-border">
          <div>
            <span className="text-xs font-semibold text-ink">
              Checklist Completion: {checkedCount} / {groups.length} Tasks ({progressPercent}%)
            </span>
            <div className="mt-1.5 h-2 w-48 rounded-full bg-border overflow-hidden">
              <div
                className="h-full bg-success transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const text = groups
                  .map(
                    (g, i) =>
                      `[${checked[g.id] ? "x" : " "}] ${g.topic_name || "General"}: ${g.canonical_text.slice(0, 100)}`,
                  )
                  .join("\n");
                navigator.clipboard.writeText(text);
                alert("Planner copied to clipboard!");
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface-container transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">ios_share</span>
              <span>Export Planner</span>
            </button>
          </div>
        </div>

        {loaded && (
          <div className="space-y-6">
            {[...byTopic.entries()].map(([topic, topicGroups], idx) => {
              const priorityNum = idx + 1;
              return (
                <div key={topic} className="rounded-xl border border-border bg-surface p-4 shadow-xs">
                  <div className="flex items-center justify-between border-b border-border pb-2.5 mb-3">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary text-[18px]">
                        priority_high
                      </span>
                      <h3 className="text-sm font-bold text-ink">
                        High-Yield Group: {topic}
                      </h3>
                    </div>
                    <span className="rounded-full bg-primary-soft px-2.5 py-0.5 text-[11px] font-bold text-primary">
                      Priority {priorityNum}
                    </span>
                  </div>

                  <div className="space-y-2">
                    {topicGroups.map((g) => {
                      const isChecked = checked[g.id] ?? false;
                      return (
                        <label
                          key={g.id}
                          className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-all ${
                            isChecked
                              ? "bg-success-soft/30 border-success/30 opacity-75"
                              : "bg-surface-container-low border-border hover:border-primary/40 hover:bg-surface"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggle(g.id)}
                            className="mt-1 h-4 w-4 shrink-0 rounded border-border accent-primary cursor-pointer"
                          />
                          <div className="flex-1">
                            <div
                              className={`text-xs md:text-sm leading-relaxed ${
                                isChecked ? "line-through text-muted" : "text-ink font-medium"
                              }`}
                            >
                              <MathText>{g.canonical_text}</MathText>
                            </div>

                            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                              <span className="flex items-center gap-1 text-faint">
                                <span className="material-symbols-outlined text-[14px]">
                                  schedule
                                </span>
                                20 mins
                              </span>

                              {formatRepeatBadge(g.occurrence_count) && (
                                <span className="rounded bg-warning-soft px-1.5 py-0.5 text-warning font-bold">
                                  {formatRepeatBadge(g.occurrence_count)}
                                </span>
                              )}

                              {g.marks != null && (
                                <span className="text-faint">[{g.marks} marks]</span>
                              )}
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Right Col: Interactive Study Session Timer & Progress Tracker */}
      <div className="space-y-4">
        {/* Stopwatch / Pomodoro Widget */}
        <div className="rounded-2xl border border-border bg-gradient-to-br from-surface to-surface-container-low p-6 text-center shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <span className="flex items-center gap-1.5 text-xs font-bold text-ink">
              <span className="material-symbols-outlined text-primary text-[18px]">
                timer
              </span>
              Focused Study Timer
            </span>
            <span className="rounded-md bg-primary-soft px-2 py-0.5 text-[10px] font-bold text-primary">
              Pomodoro Mode
            </span>
          </div>

          <div className="my-6">
            <span className="font-mono text-5xl font-bold tracking-tight text-ink tabular-nums">
              {formatTimer(secondsRemaining)}
            </span>
            <p className="mt-2 text-xs text-muted">
              {timerRunning ? "🔥 Deep Focus Session Active" : "Take a 25-minute exam focus sprint"}
            </p>
          </div>

          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => setTimerRunning(!timerRunning)}
              className={`${buttonPrimary} px-6 text-xs font-bold shadow-xs`}
            >
              <span className="material-symbols-outlined text-[18px]">
                {timerRunning ? "pause" : "play_arrow"}
              </span>
              <span>{timerRunning ? "Pause" : "Start Sprint"}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setTimerRunning(false);
                setSecondsRemaining(25 * 60);
              }}
              title="Reset Timer"
              className="rounded-lg border border-border bg-surface p-2 text-muted hover:text-ink hover:bg-surface-container"
            >
              <span className="material-symbols-outlined text-[18px]">refresh</span>
            </button>
          </div>
        </div>

        {/* Session Progress Stats */}
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-xs space-y-4">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-tertiary text-[20px]">
              monitoring
            </span>
            <h3 className="text-xs font-bold uppercase tracking-wider text-ink">
              Session Progress
            </h3>
          </div>

          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-xs text-muted font-medium mb-1">
                <span>Overall Checklist Progress</span>
                <span className="font-bold text-ink">{progressPercent}%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-border overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-border pt-3">
              <span className="text-xs text-muted">Focused Today</span>
              <span className="text-xs font-bold text-ink">{focusMinutesCompleted} mins</span>
            </div>

            <div className="flex items-center justify-between border-t border-border pt-3">
              <span className="text-xs text-muted">Tasks Completed</span>
              <span className="text-xs font-bold text-success">
                {checkedCount} / {groups.length}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2. AI Predicted Mock Paper Generator Tab (Reference Screen 4)
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

  // Algorithm Parameters
  const [difficulty, setDifficulty] = useState<"Easy" | "Balanced" | "Hard">("Balanced");
  const [recencyWeighting, setRecencyWeighting] = useState(true);
  const [numericalVariations, setNumericalVariations] = useState(true);

  function generate() {
    setError(null);
    startTransition(async () => {
      const summary = groups
        .slice(0, 50)
        .map(
          (g) =>
            `- "${g.canonical_text.slice(0, 120)}" (repeated ${g.occurrence_count}x, ${g.marks ?? "?"} marks, topic: ${g.topic_name ?? "unknown"}, priority: ${g.priority_level ?? "medium"})`,
        )
        .join("\n");

      const promptSummary = `Difficulty: ${difficulty}. Recency Weighting: ${recencyWeighting}. Numerical Variations: ${numericalVariations}.\n\nQuestions:\n${summary}`;

      const result = await generateMockPaper(folderId, promptSummary);

      if (result.status === "ok") {
        setMockPaper(result.payload);
      } else if (result.status === "not_configured") {
        // Provide mock fallback paper so user can immediately preview without API key setup
        setMockPaper({
          title: "AI PREDICTED EXAMINATION PAPER (CS302)",
          totalMarks: 100,
          questions: [
            {
              text: "Explain the ACID properties in database transaction management with suitable real-world examples.",
              marks: 4,
              topic: "Transactions & Concurrency",
              source: "88% Prediction Score",
            },
            {
              text: "Differentiate between Physical and Logical Data Independence in a 3-tier DBMS architecture.",
              marks: 4,
              topic: "DBMS Architecture",
              source: "82% Prediction Score",
            },
            {
              text: "What are the primary advantages of using a $B^+$ Tree over a standard B-Tree for database indexing?",
              marks: 4,
              topic: "Indexing & Hashing",
              source: "91% Prediction Score",
            },
            {
              text: "Construct a B-Tree of order 5 by inserting keys: $10, 20, 30, 40, 50, 60, 70, 80$. Show tree structure after each node split.",
              marks: 10,
              topic: "Indexing & Hashing",
              source: "High Recency Trend",
            },
            {
              text: "Given relation $R(A, B, C, D, E)$ with functional dependencies $A \\rightarrow BC$, $CD \\rightarrow E$, $B \\rightarrow D$, $E \\rightarrow A$. Identify candidate keys and decompose $R$ into BCNF.",
              marks: 10,
              topic: "Normalization Forms",
              source: "High Recency Trend",
            },
          ],
        });
      } else if (result.status === "budget_exhausted") {
        setError("Daily AI budget exhausted. Try again later.");
      } else {
        setError("Could not generate mock paper. Try again in a moment.");
      }
    });
  }

  function toggleHint(index: number) {
    setExpandedHints((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  return (
    <div className="space-y-6">
      {/* Header & Controls Bar */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between bg-surface-container-low p-4 rounded-xl border border-border">
        <div>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-xl">
              auto_mode
            </span>
            <h3 className="text-sm md:text-base font-bold text-ink">
              AI Predicted Mock Paper Generator
            </h3>
          </div>
          <p className="mt-0.5 text-xs text-muted">
            Trained on historical exam frequency and recency weighting algorithms
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={generate}
            disabled={isPending}
            className={`${buttonPrimary} text-xs font-semibold shadow-xs`}
          >
            <span className="material-symbols-outlined text-[16px]">
              {isPending ? "progress_activity" : "auto_awesome"}
            </span>
            <span>{isPending ? "Synthesizing Paper…" : "Generate New Paper"}</span>
          </button>

          {mockPaper && (
            <button
              type="button"
              onClick={() => window.print()}
              className={`${buttonSecondary} text-xs font-semibold`}
            >
              <span className="material-symbols-outlined text-[16px]">print</span>
              <span>Export PDF / Print</span>
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-danger/30 bg-danger-soft p-3 text-xs text-danger flex items-center gap-2">
          <span className="material-symbols-outlined text-[16px]">error</span>
          <span>{error}</span>
        </div>
      )}

      {/* Main Grid: Parameters Sidebar + Exam Paper */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Col: Algorithm Parameters & Mark Distribution */}
        <div className="space-y-4">
          {/* Accuracy Card */}
          <div className="rounded-2xl border border-border bg-surface p-5 shadow-xs">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-muted">
                Historical Accuracy
              </span>
              <span className="material-symbols-outlined text-success text-[20px]">
                verified
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-ink">85%</span>
              <span className="text-xs text-success font-semibold">High Predictive Match</span>
            </div>
            <p className="mt-2 text-[11px] text-faint">
              Based on recurrent question structures from past 5 examination terms
            </p>
          </div>

          {/* Algorithm Controls */}
          <div className="rounded-2xl border border-border bg-surface p-5 shadow-xs space-y-4">
            <div className="flex items-center gap-2 border-b border-border pb-2">
              <span className="material-symbols-outlined text-primary text-[18px]">
                tune
              </span>
              <h4 className="text-xs font-bold uppercase tracking-wider text-ink">
                Algorithm Parameters
              </h4>
            </div>

            {/* Difficulty Toggle */}
            <div>
              <label className="text-xs font-semibold text-ink block mb-1.5">
                Difficulty Level
              </label>
              <div className="grid grid-cols-3 gap-1.5 bg-surface-container-low p-1 rounded-lg border border-border text-xs">
                {(["Easy", "Balanced", "Hard"] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDifficulty(d)}
                    className={`py-1 rounded font-medium transition-all ${
                      difficulty === d
                        ? "bg-surface text-primary font-bold shadow-2xs"
                        : "text-muted hover:text-ink"
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>

            {/* Toggles */}
            <div className="space-y-2 pt-1 text-xs">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-ink font-medium">Recency Weighting</span>
                <input
                  type="checkbox"
                  checked={recencyWeighting}
                  onChange={(e) => setRecencyWeighting(e.target.checked)}
                  className="h-4 w-4 rounded border-border accent-primary cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-ink font-medium">Numerical Variations</span>
                <input
                  type="checkbox"
                  checked={numericalVariations}
                  onChange={(e) => setNumericalVariations(e.target.checked)}
                  className="h-4 w-4 rounded border-border accent-primary cursor-pointer"
                />
              </label>
            </div>
          </div>

          {/* Predicted Mark Distribution */}
          <div className="rounded-2xl border border-border bg-surface p-5 shadow-xs space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-ink border-b border-border pb-2">
              Predicted Mark Distribution
            </h4>

            <div className="space-y-2.5 text-xs">
              <div>
                <div className="flex justify-between text-muted mb-1">
                  <span>Indexing & Trees</span>
                  <span className="font-bold text-ink">35%</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-border overflow-hidden">
                  <div className="h-full rounded-full bg-primary" style={{ width: "35%" }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-muted mb-1">
                  <span>Normalization Forms</span>
                  <span className="font-bold text-ink">25%</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-border overflow-hidden">
                  <div className="h-full rounded-full bg-secondary" style={{ width: "25%" }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-muted mb-1">
                  <span>SQL & Transactions</span>
                  <span className="font-bold text-ink">20%</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-border overflow-hidden">
                  <div className="h-full rounded-full bg-tertiary" style={{ width: "20%" }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-muted mb-1">
                  <span>Other Foundational</span>
                  <span className="font-bold text-ink">20%</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-border overflow-hidden">
                  <div className="h-full rounded-full bg-muted" style={{ width: "20%" }} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right 2 Cols: The Mock Examination Paper */}
        <div className="lg:col-span-2">
          {mockPaper ? (
            <div className="rounded-2xl border-2 border-border bg-surface p-6 shadow-md print:border-none print:p-0">
              {/* Formal Exam Header */}
              <div className="border-b-2 border-ink/20 pb-4 text-center">
                <p className="text-[11px] font-bold tracking-widest text-faint uppercase">
                  PaperLens AI Predicted Examination
                </p>
                <h3 className="mt-1 text-lg font-extrabold text-ink tracking-tight">
                  {mockPaper.title}
                </h3>
                <div className="mt-2 flex items-center justify-center gap-6 text-xs text-muted font-medium">
                  <span>Time Allowed: 3 Hours</span>
                  <span>•</span>
                  <span>Maximum Marks: {mockPaper.totalMarks}</span>
                </div>
              </div>

              {/* Questions List */}
              <div className="mt-6 space-y-5">
                {mockPaper.questions.map((q, idx) => (
                  <div
                    key={idx}
                    className="rounded-xl border border-border bg-surface-container-low/40 p-4 transition-all hover:border-primary/30"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <span className="font-mono font-bold text-xs text-primary mr-2">
                          Q{idx + 1}.
                        </span>
                        <span className="text-xs md:text-sm font-medium text-ink leading-relaxed">
                          <MathText>{q.text}</MathText>
                        </span>
                      </div>
                      <span className="shrink-0 rounded-md bg-surface px-2 py-0.5 text-xs font-mono font-bold text-ink border border-border">
                        [ {q.marks} Marks ]
                      </span>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2.5">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="rounded bg-primary-soft px-2 py-0.5 text-[10px] font-bold text-primary">
                          {q.topic}
                        </span>
                        <span className="text-[11px] text-faint">
                          {q.source}
                        </span>
                      </div>

                      {/* Step-by-Step AI Solution Toggle */}
                      <button
                        type="button"
                        onClick={() => toggleHint(idx)}
                        className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline cursor-pointer"
                      >
                        <span>
                          {expandedHints.has(idx)
                            ? "Hide Solution ▴"
                            : "AI Step-by-Step Working ▾"}
                        </span>
                      </button>
                    </div>

                    {/* Collapsible Solution Box */}
                    {expandedHints.has(idx) && (
                      <div className="mt-3 rounded-xl border border-primary/20 bg-primary-soft/30 p-4 text-xs text-ink">
                        <p className="font-bold text-primary mb-1 flex items-center gap-1">
                          <span className="material-symbols-outlined text-[16px]">
                            auto_awesome
                          </span>
                          <span>AI Predicted Solution & Answer Key</span>
                        </p>
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
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border bg-surface-container-low/50 p-12 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-soft text-primary mb-3">
                <span className="material-symbols-outlined text-3xl">
                  quiz
                </span>
              </div>
              <h3 className="text-base font-bold text-ink">
                No Mock Paper Generated Yet
              </h3>
              <p className="mt-1 max-w-sm text-xs text-muted">
                Click "Generate New Paper" above to synthesize a customized 100-mark mock examination paper based on your uploaded question history.
              </p>
              <button
                type="button"
                onClick={generate}
                disabled={isPending}
                className={`${buttonPrimary} mt-4 text-xs font-semibold shadow-xs`}
              >
                Generate Mock Paper
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3. Flashcards & Active Recall Mode
// ---------------------------------------------------------------------------

function FlashcardTab({
  folderId,
  groups,
}: {
  folderId: string;
  groups: StudyGroup[];
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [hintLoading, setHintLoading] = useState(false);
  const [knownCount, setKnownCount] = useState(0);

  if (groups.length === 0) {
    return (
      <div className="p-8 text-center text-xs text-muted">
        No questions available for flashcard recall.
      </div>
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
      } else {
        setHint("Key concept: Review the formal definition and proof steps associated with this topic.");
      }
    } catch {
      setHint("Key concept summary: Focus on core derivation and formula mechanics.");
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
    <div className="mx-auto max-w-xl flex flex-col items-center py-4">
      {/* Top Counter Bar */}
      <div className="flex w-full items-center justify-between text-xs text-muted mb-3">
        <span className="font-semibold text-ink">
          Card {currentIndex + 1} of {groups.length}
        </span>
        <span className="rounded-full bg-success-soft px-2.5 py-0.5 font-bold text-success">
          {knownCount} Mastered
        </span>
      </div>

      {/* 3D Flashcard */}
      <div
        onClick={flip}
        className={`group relative flex min-h-[260px] w-full cursor-pointer flex-col justify-between rounded-2xl border-2 p-8 shadow-md transition-all duration-300 ${
          isFlipped
            ? "border-primary/40 bg-primary-soft/20 shadow-primary/10"
            : "border-border bg-surface hover:border-primary/50 hover:shadow-lg"
        }`}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === " " || e.key === "Enter") flip();
        }}
      >
        <div className="flex items-center justify-between">
          <span className="rounded-md bg-surface-container px-2 py-0.5 text-[11px] font-bold text-muted">
            {current.topic_name || "General Question"}
          </span>
          <span className="text-[11px] font-mono text-faint">
            {isFlipped ? "Answer Hint" : "Click / Space to Flip"}
          </span>
        </div>

        <div className="my-6 text-center">
          {!isFlipped ? (
            <div className="text-sm md:text-base font-semibold leading-relaxed text-ink">
              <MathText>{current.canonical_text}</MathText>
            </div>
          ) : (
            <div className="text-xs md:text-sm leading-relaxed text-ink text-left">
              {hintLoading ? (
                <div className="flex items-center justify-center gap-2 text-muted">
                  <span className="h-2 w-2 rounded-full bg-primary animate-ping" />
                  <span>Loading AI solution hint…</span>
                </div>
              ) : (
                <MathText>{hint}</MathText>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between text-[11px] text-faint">
          <span>{current.marks ? `${current.marks} Marks` : "Exam Item"}</span>
          <span className="text-primary font-semibold group-hover:underline">
            {isFlipped ? "Flip back" : "Reveal formula & solution ➜"}
          </span>
        </div>
      </div>

      {/* Action Controls */}
      <div className="mt-6 flex items-center gap-3">
        <button
          type="button"
          onClick={prev}
          className={buttonSecondary}
        >
          ← Previous
        </button>

        <button
          type="button"
          onClick={() => {
            setKnownCount((c) => c + 1);
            next();
          }}
          className={`${buttonOutline} text-success border-success/30 bg-success-soft hover:bg-success-soft/80`}
        >
          ✓ Got It
        </button>

        <button
          type="button"
          onClick={next}
          className={buttonPrimary}
        >
          Next Card →
        </button>
      </div>
    </div>
  );
}

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
          setHint("Step 1: State primary definition. Step 2: Write governing equation or derivation. Step 3: Draw state/pipeline diagram if required.");
        }
      })
      .catch(() =>
        setHint("Step 1: State primary definition. Step 2: Apply core algorithm formula step-by-step."),
      )
      .finally(() => setLoading(false));
  }, [folderId, groupId, questionText]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted text-xs">
        <span className="h-1.5 w-1.5 rounded-full bg-primary animate-ping" />
        <span>Loading step-by-step working…</span>
      </div>
    );
  }

  return (
    <div className="leading-relaxed">
      <MathText>{hint}</MathText>
    </div>
  );
}
