import type { Metadata } from "next";
import Link from "next/link";

import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import { CreateFolderModal } from "@/components/dashboard/create-folder-modal";

export const metadata: Metadata = {
  title: "Dashboard",
};

/**
 * Dashboard page — the folder hub.
 *
 * Server Component. Lists all folders belonging to the signed-in user with
 * paper counts, topic counts, and creation dates. RLS filters the query to the
 * current user's data.
 */
export default async function DashboardPage() {
  const user = await requireUser();
  const supabase = await createClient();

  // Fetch folders with paper and topic counts.
  const { data: folders } = await supabase
    .from("folders")
    .select(
      `
      id,
      name,
      subject,
      exam_name,
      created_at,
      papers(count),
      topics(count)
    `,
    )
    .order("created_at", { ascending: false });

  // Extract counts from the Supabase aggregation shape.
  const folderList = (folders ?? []).map((folder) => ({
    id: folder.id,
    name: folder.name,
    subject: folder.subject,
    examName: folder.exam_name,
    createdAt: folder.created_at,
    paperCount:
      (folder.papers as unknown as { count: number }[])?.[0]?.count ?? 0,
    topicCount:
      (folder.topics as unknown as { count: number }[])?.[0]?.count ?? 0,
  }));

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">
            Subject Folders
          </h1>
          <p className="mt-1 text-sm text-muted">
            {folderList.length === 0
              ? "Create your first folder to start analyzing papers."
              : `${folderList.length} folder${folderList.length === 1 ? "" : "s"}`}
          </p>
        </div>
        <CreateFolderModal />
      </div>

      {/* Folder grid */}
      {folderList.length > 0 ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {folderList.map((folder) => (
            <Link
              key={folder.id}
              href={`/folders/${folder.id}`}
              className="group rounded-xl border border-border bg-surface p-5 transition-all hover:border-accent/40 hover:shadow-md"
            >
              <div className="flex items-start justify-between">
                <span className="text-2xl">📁</span>
                {folder.subject && (
                  <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent">
                    {folder.subject}
                  </span>
                )}
              </div>

              <h2 className="mt-3 text-base font-semibold text-ink group-hover:text-accent">
                {folder.name}
              </h2>

              {folder.examName && (
                <p className="mt-0.5 text-sm text-muted">{folder.examName}</p>
              )}

              <div className="mt-4 flex items-center gap-4 text-xs text-faint">
                <span>{folder.paperCount} papers</span>
                <span>{folder.topicCount} topics</span>
                <span className="ml-auto">
                  {formatDate(folder.createdAt)}
                </span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="mt-16 flex flex-col items-center justify-center text-center">
          <span className="text-5xl">📄</span>
          <h2 className="mt-4 text-lg font-semibold text-ink">
            No folders yet
          </h2>
          <p className="mt-2 max-w-sm text-sm text-muted">
            Create a subject folder, upload your past exam papers, and let
            PaperLens show you what actually repeats.
          </p>
        </div>
      )}
    </div>
  );
}
