import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { FolderGrid, type FolderCardData } from "@/components/dashboard/folder-grid";

export const metadata: Metadata = {
  title: "Exam Hub · Dashboard",
};

/**
 * Dashboard page — the central Exam Analysis Hub.
 *
 * Server Component. Fetches all folders with paper and topic counts for the
 * authenticated user, and renders the interactive FolderGrid.
 */
export default async function DashboardPage() {
  await requireUser();

  let folderList: FolderCardData[] = [];

  try {
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
        exam_type,
        created_at,
        papers(count),
        topics(count)
      `,
      )
      .order("created_at", { ascending: false });

    if (folders && folders.length > 0) {
      folderList = folders.map((folder) => ({
        id: folder.id,
        name: folder.name,
        subject: folder.subject,
        examName: folder.exam_name,
        examType: folder.exam_type,
        createdAt: folder.created_at,
        paperCount:
          (folder.papers as unknown as { count: number }[])?.[0]?.count ?? 0,
        topicCount:
          (folder.topics as unknown as { count: number }[])?.[0]?.count ?? 0,
      }));
    }
  } catch {
    // Database offline
  }

  if (folderList.length === 0) {
    const { MOCK_FOLDER_CARDS } = await import("@/lib/mock-data");
    folderList = MOCK_FOLDER_CARDS;
  }

  return (
    <div className="mx-auto max-w-7xl">
      <FolderGrid folders={folderList} />
    </div>
  );
}

