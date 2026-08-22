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
}

export function FolderGrid({ folders }: { folders: FolderCardData[] }) {
  const [searchQuery, setSearchQuery] = useState("");
  const query = searchQuery.toLowerCase();
  const filtered = folders.filter(
    (folder) =>
      !query ||
      folder.name.toLowerCase().includes(query) ||
      folder.subject?.toLowerCase().includes(query),
  );

  return (
    <div className="space-y-6">
      {/* Search Input */}
      <input
        type="search"
        value={searchQuery}
        onChange={(event) => setSearchQuery(event.target.value)}
        placeholder="Search by subject or name…"
        className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-ink placeholder-muted shadow-xs transition-all focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
      />

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-surface-container px-6 py-12 text-center">
          <p className="text-sm text-muted">
            {folders.length === 0
              ? "Create your first Subject Hub to get started."
              : `No hubs matching "${searchQuery}".`}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((folder) => (
            <Link
              key={folder.id}
              href={`/folders/${folder.id}`}
              className="group relative flex flex-col rounded-lg border border-border bg-surface p-5 shadow-xs transition-all hover:border-accent/50 hover:shadow-md"
            >
              {/* Card Badge */}
              {folder.subject && (
                <div className="mb-3">
                  <span className="inline-flex rounded-md bg-primary-soft px-2 py-0.5 text-xs font-medium text-primary">
                    {folder.subject}
                  </span>
                </div>
              )}

              {/* Card Title */}
              <h3 className="font-semibold text-ink transition-colors group-hover:text-accent">
                {folder.name}
              </h3>

              {/* Card Meta */}
              <div className="mt-3 space-y-1 text-xs text-muted">
                <div className="flex items-center gap-1">
                  <span className="material-symbols-outlined text-[16px]">description</span>
                  <span>{folder.paperCount} papers</span>
                </div>
                {folder.examName && (
                  <div className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-[16px]">calendar_today</span>
                    <span>{folder.examName}</span>
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
