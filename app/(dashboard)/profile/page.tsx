"use client";

import { useState } from "react";
import Link from "next/link";
import { buttonPrimary, buttonSecondary, buttonOutline } from "@/components/ui/button";

export default function ProfilePage() {
  const [activeTab, setActiveTab] = useState<"profile" | "achievements" | "subscription">("profile");

  // Profile Form States
  const [name, setName] = useState("Scholar");
  const [email] = useState("student@university.edu");
  const [role, setRole] = useState("Student / Exam Candidate");
  const [institution, setInstitution] = useState("School of Computer Engineering");
  const [level, setLevel] = useState("Undergraduate (B.Tech / B.S.)");
  const [language, setLanguage] = useState("English (US)");
  const [savedSuccess, setSavedSuccess] = useState(false);

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Top Header & Tab Row */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-muted hover:text-ink hover:bg-surface-container transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">arrow_back</span>
            <span>Back to Hub</span>
          </Link>
          <h1 className="text-xl font-bold text-ink">Account & Settings</h1>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1.5 rounded-xl bg-surface-container-low p-1 border border-border">
          <button
            type="button"
            onClick={() => setActiveTab("profile")}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all ${
              activeTab === "profile"
                ? "bg-surface text-primary shadow-xs"
                : "text-muted hover:text-ink"
            }`}
          >
            User Profile
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("achievements")}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all ${
              activeTab === "achievements"
                ? "bg-surface text-primary shadow-xs"
                : "text-muted hover:text-ink"
            }`}
          >
            Achievements
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("subscription")}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all ${
              activeTab === "subscription"
                ? "bg-surface text-primary shadow-xs"
                : "text-muted hover:text-ink"
            }`}
          >
            Plan & Storage
          </button>
        </div>
      </div>

      {savedSuccess && (
        <div className="rounded-xl border border-success/30 bg-success-soft p-3 text-xs font-semibold text-success flex items-center gap-2 animate-in fade-in">
          <span className="material-symbols-outlined text-[18px]">check_circle</span>
          <span>Profile changes saved successfully!</span>
        </div>
      )}

      {/* 1. Profile Tab */}
      {activeTab === "profile" && (
        <div className="grid gap-6 md:grid-cols-3">
          {/* User Summary Card */}
          <div className="rounded-2xl border border-border bg-surface p-6 text-center shadow-xs">
            <div className="relative mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-tr from-primary to-accent text-2xl font-bold text-white shadow-md">
              {name.slice(0, 2).toUpperCase()}
              <div className="absolute -top-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-warning text-xs font-extrabold text-white shadow-xs">
                ★ 2
              </div>
            </div>

            <h3 className="mt-4 text-base font-bold text-ink">{name}</h3>
            <p className="text-xs text-muted">{email}</p>

            <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-3 py-1 text-xs font-semibold text-primary border border-primary/20">
              <span className="material-symbols-outlined text-[14px]">school</span>
              <span>Computer Science Scholar</span>
            </div>

            <div className="mt-6 border-t border-border pt-4 text-left space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted">Study Streak</span>
                <span className="font-bold text-ink">7 Days 🔥</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Questions Mastered</span>
                <span className="font-bold text-ink">48 Questions</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Analysis Hubs</span>
                <span className="font-bold text-ink">6 Subjects</span>
              </div>
            </div>
          </div>

          {/* Profile Form Details */}
          <div className="md:col-span-2 rounded-2xl border border-border bg-surface p-6 shadow-xs">
            <h3 className="text-sm font-bold text-ink uppercase tracking-wider border-b border-border pb-3 mb-4">
              Academic Information
            </h3>

            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-ink mb-1">
                    Display Name
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full rounded-lg border border-border bg-canvas px-3 py-2 text-xs text-ink focus:border-primary focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ink mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={email}
                    disabled
                    className="w-full rounded-lg border border-border bg-surface-container px-3 py-2 text-xs text-muted cursor-not-allowed"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-ink mb-1">
                    Academic Role
                  </label>
                  <input
                    type="text"
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="w-full rounded-lg border border-border bg-canvas px-3 py-2 text-xs text-ink focus:border-primary focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ink mb-1">
                    Education Level
                  </label>
                  <select
                    value={level}
                    onChange={(e) => setLevel(e.target.value)}
                    className="w-full rounded-lg border border-border bg-canvas px-3 py-2 text-xs text-ink focus:border-primary focus:outline-none"
                  >
                    <option>Undergraduate (B.Tech / B.S.)</option>
                    <option>Postgraduate (M.Tech / M.S. / Ph.D.)</option>
                    <option>High School / Senior Secondary</option>
                    <option>Self-Study / Professional</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink mb-1">
                  Institution / Department
                </label>
                <input
                  type="text"
                  value={institution}
                  onChange={(e) => setInstitution(e.target.value)}
                  className="w-full rounded-lg border border-border bg-canvas px-3 py-2 text-xs text-ink focus:border-primary focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink mb-1">
                  Preferred Math & Notation Language
                </label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="w-full rounded-lg border border-border bg-canvas px-3 py-2 text-xs text-ink focus:border-primary focus:outline-none"
                >
                  <option>English (US) + Standard LaTeX</option>
                  <option>English (UK) + KaTeX Notation</option>
                </select>
              </div>

              <div className="flex justify-end pt-3 border-t border-border">
                <button type="submit" className={`${buttonPrimary} text-xs font-semibold`}>
                  Save Profile Settings
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. Achievements Tab */}
      {activeTab === "achievements" && (
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-xs space-y-6">
          <div>
            <h3 className="text-base font-bold text-ink">Exam Mastery Badges</h3>
            <p className="text-xs text-muted">
              Earned by parsing question trends, solving derivations, and completing study sessions
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-xl border border-warning/30 bg-warning-soft/30 p-4 flex items-start gap-3">
              <span className="text-3xl">🏆</span>
              <div>
                <h4 className="text-xs font-bold text-ink">Master Analyst</h4>
                <p className="text-[11px] text-muted mt-0.5">Parsed 25+ distinct past exam papers across semesters</p>
                <span className="mt-2 inline-block rounded bg-warning-soft px-1.5 py-0.5 text-[10px] font-bold text-warning">
                  Tier 3 Unlocked
                </span>
              </div>
            </div>

            <div className="rounded-xl border border-primary/30 bg-primary-soft/30 p-4 flex items-start gap-3">
              <span className="text-3xl">🔥</span>
              <div>
                <h4 className="text-xs font-bold text-ink">7-Day Study Sprint</h4>
                <p className="text-[11px] text-muted mt-0.5">Maintained consistent daily practice sessions</p>
                <span className="mt-2 inline-block rounded bg-primary-soft px-1.5 py-0.5 text-[10px] font-bold text-primary">
                  Active Streak
                </span>
              </div>
            </div>

            <div className="rounded-xl border border-tertiary/30 bg-tertiary-soft/30 p-4 flex items-start gap-3">
              <span className="text-3xl">⚡</span>
              <div>
                <h4 className="text-xs font-bold text-ink">High-Yield Conqueror</h4>
                <p className="text-[11px] text-muted mt-0.5">Solved 100% of Critical & Very High priority questions</p>
                <span className="mt-2 inline-block rounded bg-tertiary-soft px-1.5 py-0.5 text-[10px] font-bold text-tertiary">
                  Mastered
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. Subscription & Plan Tab */}
      {activeTab === "subscription" && (
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border pb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-2xl">
                  workspace_premium
                </span>
                <h3 className="text-base font-bold text-ink">PaperLens Pro Academic</h3>
              </div>
              <p className="text-xs text-muted mt-0.5">Active Academic License · Renews Automatically</p>
            </div>

            <span className="rounded-full bg-success-soft px-3 py-1 text-xs font-bold text-success border border-success/30">
              Active Tier
            </span>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-3 text-xs">
              <p className="font-bold text-ink uppercase tracking-wider">Features Included:</p>
              <ul className="space-y-2 text-muted">
                <li className="flex items-center gap-2">
                  <span className="text-success font-bold">✓</span>
                  <span>Unlimited multi-year PDF past paper uploads</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-success font-bold">✓</span>
                  <span>Cross-year question repetition & frequency badges</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-success font-bold">✓</span>
                  <span>AI Predicted 100-mark mock paper generation</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-success font-bold">✓</span>
                  <span>Interactive 3D flashcards & Pomodoro practice timer</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-success font-bold">✓</span>
                  <span>Public read-only workspace sharing</span>
                </li>
              </ul>
            </div>

            <div className="rounded-xl border border-border bg-surface-container-low p-4 space-y-3">
              <div className="flex justify-between text-xs font-semibold text-ink">
                <span>PDF Cloud Storage</span>
                <span>14.2 MB / 1.0 GB Used</span>
              </div>
              <div className="h-2 w-full rounded-full bg-border overflow-hidden">
                <div className="h-full bg-primary" style={{ width: "2%" }} />
              </div>
              <p className="text-[11px] text-faint">
                Private Supabase Storage with Row-Level Security encryption.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
