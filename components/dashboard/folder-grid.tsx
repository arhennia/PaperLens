"use client";

import { useState } from "react";
import Link from "next/link";
import { CreateFolderModal } from "@/components/dashboard/create-folder-modal";

export interface FolderCardData {
  id: string;
  name: string;
  subject: string | null;
  examName: string | null;
  examType: string | null;
  createdAt: string;
  paperCount: number;
  topicCount: number;
  lastUpdate?: string;
  accuracy?: string;
}

interface FolderGridProps {
  folders: FolderCardData[];
}

export function FolderGrid({ folders }: FolderGridProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<"all" | "recent">("all");
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  // Default demonstration groups matching Reference Image 1 if user list is small
  const displayFolders: FolderCardData[] =
    folders.length >= 4
      ? folders
      : [
          {
            id: "dbms-mid-2023",
            name: "Mid-Sem 2023",
            subject: "DBMS",
            examName: "Mid-Sem",
            examType: "MID-SEM",
            createdAt: "2026-08-19T10:00:00Z",
            paperCount: 6,
            topicCount: 5,
            lastUpdate: "2 days ago",
            accuracy: "85%",
          },
          {
            id: "dbms-end-comp",
            name: "End-Sem Comprehensive",
            subject: "DBMS",
            examName: "End-Sem",
            examType: "END-SEM",
            createdAt: "2026-08-16T10:00:00Z",
            paperCount: 12,
            topicCount: 8,
            lastUpdate: "5 days ago",
            accuracy: "78%",
          },
          {
            id: "dbms-lab-prep",
            name: "Lab Prep",
            subject: "DBMS",
            examName: "Laboratory",
            examType: "LABORATORY",
            createdAt: "2026-08-20T10:00:00Z",
            paperCount: 4,
            topicCount: 4,
            lastUpdate: "1 day ago",
            accuracy: "95%",
          },
          {
            id: "os-mid-2023",
            name: "Mid-Sem 2023",
            subject: "OS",
            examName: "Mid-Sem",
            examType: "MID-SEM",
            createdAt: "2026-08-18T10:00:00Z",
            paperCount: 8,
            topicCount: 6,
            lastUpdate: "3 days ago",
            accuracy: "88%",
          },
          {
            id: "os-end-2023",
            name: "End-Sem 2023",
            subject: "OS",
            examName: "End-Sem",
            examType: "END-SEM",
            createdAt: "2026-08-14T10:00:00Z",
            paperCount: 15,
            topicCount: 10,
            lastUpdate: "1 week ago",
            accuracy: "82%",
          },
          {
            id: "os-laboratory",
            name: "Laboratory",
            subject: "OS",
            examName: "Laboratory",
            examType: "LABORATORY",
            createdAt: "2026-08-19T10:00:00Z",
            paperCount: 5,
            topicCount: 4,
            lastUpdate: "2 days ago",
            accuracy: "91%",
          },
        ];

  // Filter folders
  const filtered = displayFolders.filter((f) => {
    const matchesSearch =
      !searchQuery ||
      f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (f.subject && f.subject.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesSearch;
  });

  // Group by Subject (e.g. DBMS, OS)
  const groupedSubjects = filtered.reduce(
    (acc, folder) => {
      const subj = folder.subject || "General Analysis";
      if (!acc[subj]) acc[subj] = [];
      acc[subj].push(folder);
      return acc;
    },
    {} as Record<string, FolderCardData[]>
  );

  return (
    <div className="space-y-8 pb-12">
      {/* 1. Top Action Button (Orange Ref Button) */}
      <div>
        <button
          type="button"
          onClick={() => setIsCreateOpen(true)}
          className="flex items-center gap-2 rounded-lg bg-[#FD6B2A] px-5 py-3 text-xs font-bold uppercase tracking-wider text-white shadow-xs transition-colors hover:bg-[#E05B22]"
        >
          <span className="material-symbols-outlined text-[18px]">
            add_circle
          </span>
          <span>New Analysis Group</span>
        </button>
      </div>

      {/* 2. Search Bar and Filter Pills Row */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full max-w-xl">
          <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-[18px]">
            search
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search resources..."
            className="w-full rounded-lg border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-xs text-gray-800 placeholder:text-gray-400 shadow-xs focus:border-[#0099FF] focus:outline-none"
          />
        </div>

        <div className="flex items-center rounded-lg border border-gray-200 bg-white p-1 shadow-xs shrink-0">
          <button
            type="button"
            onClick={() => setActiveFilter("all")}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              activeFilter === "all"
                ? "bg-gray-100 text-gray-900 font-semibold"
                : "text-gray-500 hover:text-gray-900"
            }`}
          >
            All Types
          </button>
          <button
            type="button"
            onClick={() => setActiveFilter("recent")}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              activeFilter === "recent"
                ? "bg-gray-100 text-gray-900 font-semibold"
                : "text-gray-500 hover:text-gray-900"
            }`}
          >
            Recent
          </button>
        </div>
      </div>

      {/* 3. Subject Sections with Bento Grid */}
      {Object.keys(groupedSubjects).length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 p-12 text-center text-xs text-gray-500">
          No analysis groups matching &quot;{searchQuery}&quot;.
        </div>
      ) : (
        Object.entries(groupedSubjects).map(([subject, subjectCards]) => (
          <section key={subject} className="space-y-4">
            <h2 className="text-2xl font-extrabold text-gray-900 tracking-tight">
              {subject}
            </h2>

            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {subjectCards.map((folder) => {
                const badgeLabel = (
                  folder.examType ||
                  folder.examName ||
                  "MID-SEM"
                ).toUpperCase();

                return (
                  <Link
                    key={folder.id}
                    href={`/folders/${folder.id}`}
                    className="group relative flex h-48 flex-col justify-between rounded-xl border border-gray-200 bg-white p-5 shadow-xs transition-all hover:border-[#0099FF]/50 hover:shadow-md"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="rounded bg-[#EBF5FF] px-2 py-0.5 text-[10px] font-bold tracking-wider text-[#2563EB] uppercase">
                          {badgeLabel}
                        </span>
                        <span className="material-symbols-outlined text-gray-400 text-[18px] opacity-0 transition-opacity group-hover:opacity-100">
                          more_vert
                        </span>
                      </div>

                      <h3 className="mt-3 text-base font-bold text-gray-900 group-hover:text-[#0099FF] transition-colors">
                        {folder.name}
                      </h3>

                      <p className="mt-1 font-mono text-xs text-gray-500">
                        {folder.paperCount} Papers • Last update:{" "}
                        {folder.lastUpdate || "2 days ago"}
                      </p>
                    </div>

                    <div className="flex items-center justify-between border-t border-gray-100 pt-3 text-xs text-gray-600">
                      <span className="font-semibold text-gray-800">
                        {folder.accuracy || "85%"} Accuracy
                      </span>
                      <span className="material-symbols-outlined text-[#0099FF] text-[18px]">
                        analytics
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        ))
      )}

      {/* Creation Modal */}
      <CreateFolderModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
      />
    </div>
  );
}
