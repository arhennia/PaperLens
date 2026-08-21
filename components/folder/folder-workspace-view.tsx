"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { MathText } from "@/components/ui/math-text";

interface FolderWorkspaceViewProps {
  folder: {
    id: string;
    name: string;
    subject: string | null;
    exam_name: string | null;
  };
}

export function FolderWorkspaceView({ folder }: FolderWorkspaceViewProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const activeTab = searchParams.get("tab") || "materials";

  function setTab(tab: string) {
    router.push(`/folders/${folder.id}?tab=${tab}`);
  }

  // 1. Materials State (Image 2)
  const [materials, setMaterials] = useState([
    { id: "1", name: "SQL-4.pdf", size: "2.4 MB" },
    { id: "2", name: "Normalization-Guide.pdf", size: "1.8 MB" },
    { id: "3", name: "Indexing-Strategies.pdf", size: "3.1 MB" },
    { id: "4", name: "Query-Optimization.pdf", size: "2.0 MB" },
  ]);

  function removeMaterial(id: string) {
    setMaterials((prev) => prev.filter((m) => m.id !== id));
  }

  function addMaterial() {
    const name = prompt("Enter PDF paper name:", "Semester-2024-PastPaper.pdf");
    if (name) {
      setMaterials((prev) => [
        ...prev,
        { id: String(Date.now()), name, size: "1.5 MB" },
      ]);
    }
  }

  // 2. Analysis State (Image 3)
  const [analysisFilter, setAnalysisFilter] = useState<"all" | "unmastered" | "numericals">("all");
  const [expandedHints, setExpandedHints] = useState<Record<string, boolean>>({
    "q1-c": true, // pre-opened like in Image 3
  });
  const [masteredMap, setMasteredMap] = useState<Record<string, boolean>>({
    "q1-c": true, // mastered in image 3
  });

  function toggleHint(id: string) {
    setExpandedHints((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function toggleMastered(id: string) {
    setMasteredMap((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  // 3. Mock Paper State (Image 4)
  const [difficulty, setDifficulty] = useState<"Easy" | "Balanced" | "Hard">("Balanced");
  const [recencyWeighting, setRecencyWeighting] = useState(true);
  const [numericalVariations, setNumericalVariations] = useState(true);
  const [mockSolutions, setMockSolutions] = useState<Record<string, boolean>>({});

  function toggleMockSolution(id: string) {
    setMockSolutions((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  // 4. Checklist & Focus Timer State (Image 5)
  const [timerMode, setTimerMode] = useState<"timer" | "stopwatch">("timer");
  const [timerSeconds, setTimerSeconds] = useState(25 * 60);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [checklistTasks, setChecklistTasks] = useState([
    { id: "t1", group: "g1", text: "Review B-Tree insertion", tag: "Q2(b) - 2024", time: "20 mins", done: false },
    { id: "t2", group: "g1", text: "Solve B+ Tree search", tag: "Q3(b) - 2024", time: "20 mins", done: false },
    { id: "t3", group: "g1", text: "Explain leaf node structure", tag: "Q1(b) - 2024", time: "20 mins", done: false },
    { id: "t4", group: "g2", text: "3NF vs BCNF comparison", tag: "", time: "20 mins", done: true },
    { id: "t5", group: "g2", text: "Decompose to 4NF", tag: "", time: "20 mins", done: false },
    { id: "t6", group: "g2", text: "Identify functional dependencies", tag: "", time: "20 mins", done: false },
  ]);
  const [customTaskInput, setCustomTaskInput] = useState("");

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isTimerRunning && timerSeconds > 0) {
      interval = setInterval(() => setTimerSeconds((prev) => prev - 1), 1000);
    }
    return () => clearInterval(interval);
  }, [isTimerRunning, timerSeconds]);

  function formatTime(secs: number) {
    const mins = Math.floor(secs / 60);
    const remainder = secs % 60;
    return `${String(mins).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
  }

  function handleAddCustomTask(group: "g1" | "g2") {
    if (!customTaskInput.trim()) return;
    setChecklistTasks((prev) => [
      ...prev,
      {
        id: String(Date.now()),
        group,
        text: customTaskInput.trim(),
        tag: "Custom",
        time: "20 mins",
        done: false,
      },
    ]);
    setCustomTaskInput("");
  }

  return (
    <div className="space-y-6">
      {/* ========================================================================= */}
      {/* SCREEN 2: SUBJECT MATERIALS PAGE (Image 2)                                */}
      {/* ========================================================================= */}
      {activeTab === "materials" && (
        <div className="space-y-6">
          {/* Header Row: Subject title, dropdown, Start studying button */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">
                {folder.name || "Mid-Sem 2023"}
              </h1>
              <button
                type="button"
                className="text-gray-400 hover:text-gray-700"
                title="Edit name"
              >
                <span className="material-symbols-outlined text-[20px]">
                  edit
                </span>
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              {/* Subject Dropdown Pill */}
              <div className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-800 shadow-xs">
                <span className="material-symbols-outlined text-gray-500 text-[16px]">
                  folder
                </span>
                <span>{folder.subject || "DBMS"}</span>
                <span className="material-symbols-outlined text-gray-400 text-[14px]">
                  expand_more
                </span>
              </div>

              {/* Start Studying Pill Button (Deep navy Ref button) */}
              <button
                type="button"
                onClick={() => setTab("analysis")}
                className="flex items-center gap-2 rounded-full bg-[#0B2545] px-6 py-2 text-xs font-bold text-white shadow-xs transition-colors hover:bg-[#071A33]"
              >
                <span className="material-symbols-outlined text-[16px]">
                  play_circle
                </span>
                <span>Start studying</span>
              </button>
            </div>
          </div>

          {/* Tab Selection Row: 1 Material (i) | 0 Images BETA */}
          <div className="flex items-center gap-6 border-b border-gray-200 text-xs font-semibold">
            <button
              type="button"
              className="flex items-center gap-1.5 border-b-2 border-[#0099FF] pb-2.5 text-[#0099FF]"
            >
              <span>{materials.length} Material</span>
              <span className="material-symbols-outlined text-[14px]">info</span>
            </button>

            <button
              type="button"
              className="flex items-center gap-1.5 pb-2.5 text-gray-500 hover:text-gray-800"
            >
              <span>0 Images</span>
              <span className="rounded bg-[#FD6B2A] px-1.5 py-0.2 text-[10px] font-bold text-white uppercase tracking-wider">
                BETA
              </span>
            </button>
          </div>

          {/* Add Button */}
          <div>
            <button
              type="button"
              onClick={addMaterial}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-4 py-2 text-xs font-semibold text-gray-700 shadow-xs hover:bg-gray-50"
            >
              <span className="material-symbols-outlined text-[16px]">add</span>
              <span>Add</span>
            </button>
          </div>

          {/* List of PDF Materials Cards */}
          <div className="space-y-3 max-w-4xl">
            {materials.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3.5 shadow-xs transition-all hover:border-gray-300"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-gray-100 text-gray-700">
                    <span className="material-symbols-outlined text-[20px]">
                      picture_as_pdf
                    </span>
                  </div>
                  <span className="text-xs font-semibold text-gray-800">
                    {item.name}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => removeMaterial(item.id)}
                  className="text-gray-400 hover:text-red-500 transition-colors"
                  title="Remove file"
                >
                  <span className="material-symbols-outlined text-[18px]">
                    cancel
                  </span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SCREEN 3: ANALYSIS HUB PAGE (Image 3)                                     */}
      {/* ========================================================================= */}
      {activeTab === "analysis" && (
        <div className="space-y-6">
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">
            {folder.name || "Mid-Sem 2023"}
          </h1>

          {/* 4 Summary Stat Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* 1. Topic Distribution */}
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-xs">
              <h3 className="text-xs font-bold text-gray-800 mb-2">
                Topic Distribution
              </h3>
              <div className="flex items-center gap-3">
                <div className="relative flex h-14 w-14 items-center justify-center rounded-full border-4 border-[#0099FF] border-t-[#FD6B2A] border-r-[#10B981]">
                  <span className="text-[10px] font-bold text-gray-700">4 Topics</span>
                </div>
                <div className="text-[11px] space-y-0.5 text-gray-600">
                  <p className="flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#0099FF]" />
                    <span>Indexing</span>
                  </p>
                  <p className="flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#FD6B2A]" />
                    <span>Normalization</span>
                  </p>
                  <p className="flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#10B981]" />
                    <span>SQL Queries</span>
                  </p>
                </div>
              </div>
            </div>

            {/* 2. Mastery Tracker */}
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-xs">
              <h3 className="text-xs font-bold text-gray-800 mb-2">
                Mastery Tracker
              </h3>
              <div className="flex items-center gap-3">
                <div className="flex h-14 w-14 items-center justify-center rounded-full border-4 border-orange-400 bg-orange-50 text-xs font-bold text-orange-600">
                  42%
                </div>
                <div className="text-xs">
                  <p className="font-bold text-gray-800">18 / 43</p>
                  <p className="text-[11px] text-gray-500">Mastered</p>
                </div>
              </div>
            </div>

            {/* 3. Focus Areas */}
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-xs">
              <h3 className="text-xs font-bold text-gray-800 mb-2">Focus Areas</h3>
              <div className="h-3 w-full rounded-full bg-gray-100 overflow-hidden flex mt-3">
                <div className="h-full bg-[#0099FF]" style={{ width: "60%" }} />
                <div className="h-full bg-orange-300" style={{ width: "40%" }} />
              </div>
              <div className="flex justify-between text-[11px] font-semibold text-gray-600 mt-2">
                <span>60% Num.</span>
                <span>40% Theo.</span>
              </div>
            </div>

            {/* 4. Exam Weightage */}
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-xs">
              <h3 className="text-xs font-bold text-gray-800 mb-2">
                Exam Weightage
              </h3>
              <div className="h-3 w-full rounded-full bg-gray-100 overflow-hidden mt-3">
                <div className="h-full bg-[#FD6B2A]" style={{ width: "65%" }} />
              </div>
              <p className="text-[11px] font-semibold text-gray-600 mt-2">
                Top 2 Groups = 65%
              </p>
            </div>
          </div>

          {/* Search and Filters Bar */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full max-w-md">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-[18px]">
                search
              </span>
              <input
                type="text"
                placeholder="Search questions or formulas..."
                className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-xs text-gray-800 placeholder:text-gray-400 shadow-xs focus:border-[#0099FF] focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1 shadow-xs">
              <button
                type="button"
                onClick={() => setAnalysisFilter("all")}
                className={`rounded px-3 py-1 text-xs font-medium ${
                  analysisFilter === "all"
                    ? "bg-gray-100 font-semibold text-gray-900"
                    : "text-gray-500 hover:text-gray-900"
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setAnalysisFilter("unmastered")}
                className={`rounded px-3 py-1 text-xs font-medium ${
                  analysisFilter === "unmastered"
                    ? "bg-gray-100 font-semibold text-gray-900"
                    : "text-gray-500 hover:text-gray-900"
                }`}
              >
                Unmastered
              </button>
              <button
                type="button"
                onClick={() => setAnalysisFilter("numericals")}
                className={`rounded px-3 py-1 text-xs font-medium ${
                  analysisFilter === "numericals"
                    ? "bg-gray-100 font-semibold text-gray-900"
                    : "text-gray-500 hover:text-gray-900"
                }`}
              >
                Numericals
              </button>
              <button
                type="button"
                className="px-2 py-1 text-gray-400 hover:text-gray-700"
              >
                <span className="material-symbols-outlined text-[16px]">tune</span>
              </button>
            </div>
          </div>

          {/* Group 1: B-Tree & Indexing Calculations */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold text-gray-900">
                B-Tree & Indexing Calculations
              </h2>
              <span className="rounded-full bg-[#EBF5FF] px-2.5 py-0.5 text-xs font-bold text-[#2563EB]">
                35% Mark Weightage
              </span>
            </div>

            {/* Q2(b) Card */}
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-xs space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded bg-gray-100 px-2 py-0.5 font-mono font-bold text-gray-800">
                    Q2(b)
                  </span>
                  <span className="text-gray-500">
                    [ 2022 Mid-Sem, 2023 End-Sem, 2024 End-Sem ]
                  </span>
                  <span className="font-semibold text-orange-600">- 10 Marks</span>
                  <span className="rounded bg-[#EBF5FF] px-2 py-0.5 font-bold text-[#2563EB]">
                    Repeated 2x
                  </span>
                </div>

                <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 cursor-pointer">
                  <span>Mastered</span>
                  <input
                    type="checkbox"
                    checked={!!masteredMap["q2-b"]}
                    onChange={() => toggleMastered("q2-b")}
                    className="rounded text-[#0099FF]"
                  />
                </label>
              </div>

              <p className="text-xs md:text-sm text-gray-800 leading-relaxed">
                Calculate the maximum number of keys and pointers in a B-Tree node of order 5. Assume block size is 1024 bytes, key size is 8 bytes, and pointer size is 4 bytes.
              </p>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => toggleHint("q2-b")}
                  className="text-xs font-semibold text-blue-600 hover:underline flex items-center gap-1"
                >
                  <span>AI Hint</span>
                  <span className="material-symbols-outlined text-[14px]">
                    {expandedHints["q2-b"] ? "expand_less" : "expand_more"}
                  </span>
                </button>
              </div>

              {expandedHints["q2-b"] && (
                <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-3.5 text-xs font-mono text-gray-800 space-y-1">
                  <p><strong>Step 1:</strong> Node order p = 5. Maximum pointers = 5, Maximum keys = 4.</p>
                  <p><strong>Step 2:</strong> Invariant: (p - 1) * key_size + p * pointer_size &le; block_size.</p>
                  <p><strong>Step 3:</strong> 4 * 8 + 5 * 4 = 32 + 20 = 52 &le; 1024 bytes.</p>
                </div>
              )}

            </div>

            {/* Q3(a) Card */}
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-xs space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded bg-gray-100 px-2 py-0.5 font-mono font-bold text-gray-800">
                    Q3(a)
                  </span>
                  <span className="text-gray-500">
                    [ 2021 End-Sem, 2024 Mid-Sem ]
                  </span>
                  <span className="font-semibold text-orange-600">- 8 Marks</span>
                </div>

                <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 cursor-pointer">
                  <span>Mastered</span>
                  <input
                    type="checkbox"
                    checked={!!masteredMap["q3-a"]}
                    onChange={() => toggleMastered("q3-a")}
                    className="rounded text-[#0099FF]"
                  />
                </label>
              </div>

              <p className="text-xs md:text-sm text-gray-800 leading-relaxed">
                Consider a B+ tree of order d. What is the minimum number of keys each internal node must contain? Explain the difference between B-tree and B+ tree node structures.
              </p>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => toggleHint("q3-a")}
                  className="text-xs font-semibold text-blue-600 hover:underline flex items-center gap-1"
                >
                  <span>AI Hint</span>
                  <span className="material-symbols-outlined text-[14px]">
                    {expandedHints["q3-a"] ? "expand_less" : "expand_more"}
                  </span>
                </button>
              </div>
            </div>

            {/* Q1(c) Card with open AI hint (Image 3) */}
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-xs space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded bg-gray-100 px-2 py-0.5 font-mono font-bold text-gray-800">
                    Q1(c)
                  </span>
                  <span className="text-gray-500">[ 2023 Mid-Sem ]</span>
                  <span className="font-semibold text-orange-600">- 5 Marks</span>
                </div>

                <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 cursor-pointer">
                  <span>Mastered</span>
                  <input
                    type="checkbox"
                    checked={!!masteredMap["q1-c"]}
                    onChange={() => toggleMastered("q1-c")}
                    className="rounded text-[#0099FF]"
                  />
                </label>
              </div>

              <p className="text-xs md:text-sm text-gray-800 leading-relaxed">
                Given a file with 1,000,000 records, block size of 4096 bytes, and record size of 200 bytes. Calculate the number of blocks needed for a dense index if key size is 12 bytes and block pointer is 4 bytes.
              </p>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => toggleHint("q1-c")}
                  className="text-xs font-semibold text-blue-600 hover:underline flex items-center gap-1"
                >
                  <span>AI Hint</span>
                  <span className="material-symbols-outlined text-[14px]">
                    {expandedHints["q1-c"] ? "expand_less" : "expand_more"}
                  </span>
                </button>
              </div>

              {/* Exact expanded working container from Image 3 */}
              {expandedHints["q1-c"] && (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-xs font-mono text-gray-800 space-y-1">
                  <p><strong>Step 1:</strong> Index entry size = 12 + 4 = 16 bytes.</p>
                  <p><strong>Step 2:</strong> Entries per block = floor(4096 / 16) = 256.</p>
                  <p><strong>Step 3:</strong> Dense index needs 1 entry per record = 1,000,000 entries.</p>
                  <p><strong>Step 4:</strong> Index blocks = ceil(1,000,000 / 256) = 3907 blocks.</p>
                </div>
              )}
            </div>
          </div>

          {/* Group 2: Normalization Forms */}
          <div className="space-y-4 pt-4">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold text-gray-900">
                Normalization Forms
              </h2>
              <span className="rounded-full bg-[#EBF5FF] px-2.5 py-0.5 text-xs font-bold text-[#2563EB]">
                20% Mark Weightage
              </span>
            </div>

            {/* Q4(a) Card */}
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-xs space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded bg-gray-100 px-2 py-0.5 font-mono font-bold text-gray-800">
                    Q4(a)
                  </span>
                  <span className="text-gray-500">
                    [ 2020 End-Sem, 2022 Mid-Sem, 2023 Mid-Sem, 2024 Mid-Sem ]
                  </span>
                  <span className="font-semibold text-orange-600">- 5 Marks</span>
                </div>

                <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 cursor-pointer">
                  <span>Mastered</span>
                  <input
                    type="checkbox"
                    checked={!!masteredMap["q4-a"]}
                    onChange={() => toggleMastered("q4-a")}
                    className="rounded text-[#0099FF]"
                  />
                </label>
              </div>

              <p className="text-xs md:text-sm text-gray-800 leading-relaxed">
                Determine the highest normal form of the relation R(A, B, C, D) with functional dependencies: AB -&gt; C, C -&gt; D, D -&gt; A.
              </p>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => toggleHint("q4-a")}
                  className="text-xs font-semibold text-blue-600 hover:underline flex items-center gap-1"
                >
                  <span>AI Hint</span>
                  <span className="material-symbols-outlined text-[14px]">
                    {expandedHints["q4-a"] ? "expand_less" : "expand_more"}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SCREEN 4: AI PREDICTED MOCK PAPER GENERATOR (Image 4)                     */}
      {/* ========================================================================= */}
      {activeTab === "mock-paper" && (
        <div className="space-y-6">
          {/* Header Row & Action Buttons */}
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">
                AI Predicted Mock Paper Generator
              </h1>
              <p className="text-xs text-gray-500 mt-1">
                Based on 5 historical DBMS past papers (2019-2024) using frequency &amp; recency algorithms
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => alert("Generated new mock paper iteration!")}
                className="flex items-center gap-1.5 rounded-lg bg-[#FD6B2A] px-4 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-[#E05B22] transition-colors"
              >
                <span className="material-symbols-outlined text-[16px]">
                  autorenew
                </span>
                <span>Generate New Paper</span>
              </button>

              <button
                type="button"
                onClick={() => window.print()}
                className="flex items-center gap-1.5 rounded-lg border border-[#0099FF] bg-white px-4 py-2.5 text-xs font-bold text-[#0099FF] shadow-xs hover:bg-blue-50 transition-colors"
              >
                <span className="material-symbols-outlined text-[16px]">
                  picture_as_pdf
                </span>
                <span>Export Printable PDF</span>
              </button>
            </div>
          </div>

          {/* 2-Column Layout */}
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Left 2 Cols: The Exam Paper Sheet */}
            <div className="lg:col-span-2 rounded-xl border border-gray-200 bg-white p-6 sm:p-8 shadow-xs space-y-6">
              {/* University Exam Header */}
              <div className="border-b border-gray-200 pb-5 text-center space-y-1">
                <h2 className="text-base font-extrabold tracking-wide text-gray-900 uppercase">
                  DATABASE MANAGEMENT SYSTEMS (CS302)
                </h2>
                <p className="text-xs font-mono font-semibold text-gray-500">
                  TIME ALLOWED: 3 HOURS &nbsp;&nbsp;&nbsp;&nbsp; TOTAL MARKS: 100
                </p>
              </div>

              {/* SECTION A: SHORT QUESTIONS */}
              <div className="space-y-4">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-gray-900">
                  SECTION A: SHORT QUESTIONS
                </h3>

                {/* Q1 */}
                <div className="space-y-1.5 text-xs text-gray-800">
                  <div className="flex justify-between items-start">
                    <p>1. Explain the concept of ACID properties in transaction management with suitable examples.</p>
                    <div className="text-right shrink-0 ml-4">
                      <span className="font-semibold text-gray-600">[ 4 Marks ]</span>
                      <span className="block text-[10px] text-orange-600 font-semibold">[ 88% Prediction Score ]</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleMockSolution("m-1")}
                    className="text-[11px] font-semibold text-blue-600 hover:underline"
                  >
                    [ AI Predicted Solution &amp; Answer Key {mockSolutions["m-1"] ? "▴" : "▾"} ]
                  </button>
                  {mockSolutions["m-1"] && (
                    <div className="rounded border border-blue-100 bg-blue-50/50 p-2.5 text-[11px] font-mono text-gray-700">
                      Atomicity (All-or-Nothing), Consistency (State Invariants), Isolation (Concurrent Independence), Durability (Committed Persistence).
                    </div>
                  )}
                </div>

                {/* Q2 */}
                <div className="space-y-1.5 text-xs text-gray-800">
                  <div className="flex justify-between items-start">
                    <p>2. Differentiate between Physical and Logical Data Independence.</p>
                    <div className="text-right shrink-0 ml-4">
                      <span className="font-semibold text-gray-600">[ 4 Marks ]</span>
                      <span className="block text-[10px] text-orange-600 font-semibold">[ 82% Prediction Score ]</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleMockSolution("m-2")}
                    className="text-[11px] font-semibold text-blue-600 hover:underline"
                  >
                    [ AI Predicted Solution &amp; Answer Key {mockSolutions["m-2"] ? "▴" : "▾"} ]
                  </button>
                </div>

                {/* Q3 */}
                <div className="space-y-1.5 text-xs text-gray-800">
                  <div className="flex justify-between items-start">
                    <p>3. What are the primary advantages of using a B+ Tree over a standard B-Tree for indexing?</p>
                    <div className="text-right shrink-0 ml-4">
                      <span className="font-semibold text-gray-600">[ 4 Marks ]</span>
                      <span className="block text-[10px] text-orange-600 font-semibold">[ 91% Prediction Score ]</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleMockSolution("m-3")}
                    className="text-[11px] font-semibold text-blue-600 hover:underline"
                  >
                    [ AI Predicted Solution &amp; Answer Key {mockSolutions["m-3"] ? "▴" : "▾"} ]
                  </button>
                </div>
              </div>

              {/* SECTION B: LONG ANALYTICAL */}
              <div className="space-y-4 pt-4 border-t border-gray-200">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-gray-900">
                  SECTION B: LONG ANALYTICAL
                </h3>

                {/* Q4 */}
                <div className="space-y-1.5 text-xs text-gray-800">
                  <div className="flex justify-between items-start">
                    <p className="font-bold text-gray-900">4. B-Tree Indexing Analysis</p>
                    <div className="text-right shrink-0 ml-4">
                      <span className="font-semibold text-gray-600">[ 10 Marks ]</span>
                      <span className="block text-[10px] text-blue-600 font-semibold">[ High Recency Trend ]</span>
                    </div>
                  </div>
                  <p>
                    Construct a B-Tree of order 5 by inserting the following keys: 10, 20, 30, 40, 50, 60, 70, 80. Show the tree structure after each split.
                  </p>
                  <button
                    type="button"
                    onClick={() => toggleMockSolution("m-4")}
                    className="text-[11px] font-semibold text-blue-600 hover:underline"
                  >
                    [ AI Step-by-Step Working {mockSolutions["m-4"] ? "▴" : "▾"} ]
                  </button>
                  {mockSolutions["m-4"] && (
                    <div className="rounded border border-blue-100 bg-blue-50/50 p-2.5 text-[11px] font-mono text-gray-700 space-y-1">
                      <p>1. Insert 10, 20, 30, 40: [10, 20, 30, 40]</p>
                      <p>2. Insert 50: Node overflows. Median key 30 moves up. Left: [10, 20], Right: [40, 50].</p>
                    </div>
                  )}
                </div>

                {/* Q5 */}
                <div className="space-y-1.5 text-xs text-gray-800">
                  <div className="flex justify-between items-start">
                    <p className="font-bold text-gray-900">5. Normalization &amp; Decomposition</p>
                    <div className="text-right shrink-0 ml-4">
                      <span className="font-semibold text-gray-600">[ 10 Marks ]</span>
                      <span className="block text-[10px] text-blue-600 font-semibold">[ High Recency Trend ]</span>
                    </div>
                  </div>
                  <p>
                    Given the relation R(A, B, C, D, E) and FDs: A-&gt;BC, CD-&gt;E, B-&gt;D, E-&gt;A. Identify the candidate keys and decompose the relation into BCNF.
                  </p>
                  <button
                    type="button"
                    onClick={() => toggleMockSolution("m-5")}
                    className="text-[11px] font-semibold text-blue-600 hover:underline"
                  >
                    [ AI Step-by-Step Working {mockSolutions["m-5"] ? "▴" : "▾"} ]
                  </button>
                </div>
              </div>
            </div>

            {/* Right 1 Col: Algorithm Parameters & Distribution */}
            <div className="space-y-5">
              {/* 1. Accuracy Widget */}
              <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-xs text-center space-y-3">
                <h3 className="text-xs font-bold text-gray-800">
                  85% Historical Accuracy
                </h3>
                <div className="relative mx-auto flex h-24 w-24 items-center justify-center rounded-full border-4 border-[#0099FF] bg-blue-50/30 text-xl font-extrabold text-[#0099FF]">
                  85%
                </div>
              </div>

              {/* 2. Algorithm Parameters */}
              <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-xs space-y-4 text-xs">
                <h3 className="font-bold text-gray-800">Algorithm Parameters</h3>

                {/* Difficulty Pills */}
                <div className="flex items-center rounded-lg bg-gray-100 p-1">
                  {(["Easy", "Balanced", "Hard"] as const).map((level) => (
                    <button
                      key={level}
                      type="button"
                      onClick={() => setDifficulty(level)}
                      className={`flex-1 rounded py-1 text-center font-semibold transition-colors ${
                        difficulty === level
                          ? "bg-white text-[#0099FF] shadow-xs"
                          : "text-gray-600 hover:text-gray-900"
                      }`}
                    >
                      {level}
                    </button>
                  ))}
                </div>

                {/* Toggles */}
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-700">Recency Weighting</span>
                    <button
                      type="button"
                      onClick={() => setRecencyWeighting(!recencyWeighting)}
                      className={`h-5 w-9 rounded-full transition-colors relative ${
                        recencyWeighting ? "bg-[#0099FF]" : "bg-gray-300"
                      }`}
                    >
                      <div
                        className={`h-4 w-4 rounded-full bg-white transition-transform absolute top-0.5 ${
                          recencyWeighting ? "left-4.5" : "left-0.5"
                        }`}
                      />
                    </button>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-gray-700">Numerical Variations</span>
                    <button
                      type="button"
                      onClick={() => setNumericalVariations(!numericalVariations)}
                      className={`h-5 w-9 rounded-full transition-colors relative ${
                        numericalVariations ? "bg-[#0099FF]" : "bg-gray-300"
                      }`}
                    >
                      <div
                        className={`h-4 w-4 rounded-full bg-white transition-transform absolute top-0.5 ${
                          numericalVariations ? "left-4.5" : "left-0.5"
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>

              {/* 3. Predicted Mark Distribution */}
              <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-xs space-y-3 text-xs">
                <h3 className="font-bold text-gray-800">
                  Predicted Mark Distribution
                </h3>

                <div className="space-y-2.5">
                  <div>
                    <div className="flex justify-between text-gray-600 mb-1">
                      <span>B-Tree &amp; Indexing</span>
                      <span className="font-bold">35%</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
                      <div className="h-full bg-orange-500" style={{ width: "35%" }} />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-gray-600 mb-1">
                      <span>Normalization</span>
                      <span className="font-bold">25%</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
                      <div className="h-full bg-[#0099FF]" style={{ width: "25%" }} />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-gray-600 mb-1">
                      <span>SQL Queries</span>
                      <span className="font-bold">20%</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
                      <div className="h-full bg-blue-300" style={{ width: "20%" }} />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-gray-600 mb-1">
                      <span>Others</span>
                      <span className="font-bold">20%</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
                      <div className="h-full bg-gray-300" style={{ width: "20%" }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SCREEN 5: PRACTICE PLANNER & STUDY CHECKLIST (Image 5)                    */}
      {/* ========================================================================= */}
      {activeTab === "checklist" && (
        <div className="space-y-6">
          {/* Header Row */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">
                Practice Planner &amp; Study Checklist
              </h1>
              <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                <span>✦</span>
                <span>Auto-generated from DBMS past paper analysis</span>
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => alert("Exported checklist to Markdown/LaTeX!")}
                className="rounded-lg border border-gray-200 bg-white px-3.5 py-2 text-xs font-semibold text-gray-700 shadow-xs hover:bg-gray-50 flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[16px]">
                  download
                </span>
                <span>Export Planner</span>
              </button>

              <button
                type="button"
                onClick={() => handleAddCustomTask("g1")}
                className="rounded-lg bg-[#0099FF] px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#0088ee] flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[16px]">add</span>
                <span>Add Custom Task Group</span>
              </button>
            </div>
          </div>

          {/* 2-Column Grid */}
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Left 2 Cols: Checklist Groups */}
            <div className="lg:col-span-2 space-y-5">
              {/* Group 1: Priority 1 (Orange Tag & Left Border) */}
              <div className="rounded-xl border border-gray-200 border-l-4 border-l-[#FD6B2A] bg-white p-5 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-gray-900">
                    High-Yield Group: B-Tree &amp; Indexing (35% Marks)
                  </h3>
                  <span className="rounded bg-[#FFF3EB] px-2 py-0.5 text-[10px] font-bold text-[#FD6B2A] uppercase tracking-wider">
                    ! PRIORITY 1
                  </span>
                </div>

                <div className="space-y-3">
                  {checklistTasks
                    .filter((t) => t.group === "g1")
                    .map((task) => (
                      <div
                        key={task.id}
                        className="flex items-center justify-between text-xs py-1 border-b border-gray-50"
                      >
                        <label className="flex items-center gap-2.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={task.done}
                            onChange={() =>
                              setChecklistTasks((prev) =>
                                prev.map((t) =>
                                  t.id === task.id ? { ...t, done: !t.done } : t
                                )
                              )
                            }
                            className="rounded text-[#0099FF]"
                          />
                          <span
                            className={
                              task.done
                                ? "text-gray-400 line-through"
                                : "text-gray-800 font-medium"
                            }
                          >
                            {task.text}
                          </span>
                        </label>

                        <div className="flex items-center gap-3 text-[11px] text-gray-400 font-mono">
                          {task.tag && (
                            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-600">
                              {task.tag}
                            </span>
                          )}
                          <span>⏱ {task.time}</span>
                        </div>
                      </div>
                    ))}

                  {/* Add Task Input */}
                  <div className="pt-2">
                    <input
                      type="text"
                      value={customTaskInput}
                      onChange={(e) => setCustomTaskInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleAddCustomTask("g1");
                      }}
                      placeholder="+ Type custom task and press Enter..."
                      className="w-full text-xs text-gray-700 placeholder:text-gray-400 focus:outline-none py-1"
                    />
                  </div>
                </div>
              </div>

              {/* Group 2: Priority 2 (Blue Tag & Left Border) */}
              <div className="rounded-xl border border-gray-200 border-l-4 border-l-[#0099FF] bg-white p-5 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-gray-900">
                    High-Yield Group: Normalization Forms (20% Marks)
                  </h3>
                  <span className="rounded bg-[#EBF5FF] px-2 py-0.5 text-[10px] font-bold text-[#0099FF] uppercase tracking-wider">
                    🗎 PRIORITY 2
                  </span>
                </div>

                <div className="space-y-3">
                  {checklistTasks
                    .filter((t) => t.group === "g2")
                    .map((task) => (
                      <div
                        key={task.id}
                        className="flex items-center justify-between text-xs py-1 border-b border-gray-50"
                      >
                        <label className="flex items-center gap-2.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={task.done}
                            onChange={() =>
                              setChecklistTasks((prev) =>
                                prev.map((t) =>
                                  t.id === task.id ? { ...t, done: !t.done } : t
                                )
                              )
                            }
                            className="rounded text-[#0099FF]"
                          />
                          <span
                            className={
                              task.done
                                ? "text-gray-400 line-through"
                                : "text-gray-800 font-medium"
                            }
                          >
                            {task.text}
                          </span>
                        </label>

                        <div className="flex items-center gap-3 text-[11px] text-gray-400 font-mono">
                          {task.tag && (
                            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-600">
                              {task.tag}
                            </span>
                          )}
                          <span>⏱ {task.time}</span>
                        </div>
                      </div>
                    ))}

                  {/* Add Task Input */}
                  <div className="pt-2">
                    <input
                      type="text"
                      placeholder="+ Type custom task and press Enter..."
                      className="w-full text-xs text-gray-700 placeholder:text-gray-400 focus:outline-none py-1"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Right 1 Col: Focus Timer & Session Progress */}
            <div className="space-y-5">
              {/* Focus Timer Widget */}
              <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-xs text-center space-y-4">
                {/* Stopwatch / Timer Tabs */}
                <div className="inline-flex rounded-lg bg-gray-100 p-1 text-xs">
                  <button
                    type="button"
                    onClick={() => setTimerMode("stopwatch")}
                    className={`rounded px-3 py-1 font-medium transition-colors ${
                      timerMode === "stopwatch"
                        ? "bg-white text-gray-900 shadow-xs font-semibold"
                        : "text-gray-500"
                    }`}
                  >
                    Stopwatch
                  </button>
                  <button
                    type="button"
                    onClick={() => setTimerMode("timer")}
                    className={`rounded px-3 py-1 font-medium transition-colors ${
                      timerMode === "timer"
                        ? "bg-white text-gray-900 shadow-xs font-semibold"
                        : "text-gray-500"
                    }`}
                  >
                    Timer
                  </button>
                </div>

                {/* Digital Display */}
                <div className="text-4xl font-extrabold text-gray-900 font-mono tracking-tight py-2">
                  {formatTime(timerSeconds)}
                </div>

                {/* Controls */}
                <div className="flex items-center justify-center gap-4 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setIsTimerRunning(false);
                      setTimerSeconds(25 * 60);
                    }}
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 text-gray-500 hover:bg-gray-50"
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      replay
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsTimerRunning(!isTimerRunning)}
                    className="flex h-12 w-12 items-center justify-center rounded-full bg-[#0099FF] text-white shadow-md hover:bg-[#0088ee] transition-transform hover:scale-105"
                  >
                    <span className="material-symbols-outlined text-[24px]">
                      {isTimerRunning ? "pause" : "play_arrow"}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const mins = prompt("Set timer minutes:", "25");
                      if (mins) setTimerSeconds(Number(mins) * 60);
                    }}
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 text-gray-500 hover:bg-gray-50"
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      settings
                    </span>
                  </button>
                </div>
              </div>

              {/* Session Progress Widget */}
              <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-xs space-y-3">
                <div className="flex items-center gap-1.5 text-xs font-bold text-gray-800">
                  <span className="material-symbols-outlined text-blue-600 text-[18px]">
                    trending_up
                  </span>
                  <span>Session Progress</span>
                </div>

                <div className="space-y-1 text-xs">
                  <div className="flex justify-between text-gray-500 font-semibold text-[10px] uppercase tracking-wider">
                    <span>Overall Checklist Progress</span>
                    <span className="text-gray-900 font-bold">42%</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
                    <div className="h-full bg-[#0099FF]" style={{ width: "42%" }} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-3 border-t border-gray-100">
                  <div className="rounded-lg bg-gray-50 p-2.5 text-center">
                    <p className="text-sm font-bold text-gray-900">1h 45m</p>
                    <p className="text-[10px] text-gray-500">Focused Today</p>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-2.5 text-center">
                    <p className="text-sm font-bold text-gray-900">6 / 14</p>
                    <p className="text-[10px] text-gray-500">Tasks Completed</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
