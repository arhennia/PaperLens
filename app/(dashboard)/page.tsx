import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { FolderGrid } from "@/components/dashboard/folder-grid";
import type { FolderCardData } from "@/components/dashboard/folder-grid";

export const metadata: Metadata = {
  title: "Subject Hubs · PaperLens",
};

/**
 * Dashboard page — Subject Hubs.
 *
 * Server Component. Fetches all folders for the authenticated user,
 * and renders the interactive FolderGrid with DashboardHeader.
 */
export default async function DashboardPage() {
  await requireUser();

  const supabase = await createClient();
  const { data: folders, error } = await supabase
    .from("folders")
    .select("id, name, subject, exam_name, exam_type, created_at")
    .order("created_at", { ascending: false });

  if (error) throw new Error("Unable to load folders.");

  const folderList: FolderCardData[] = (folders ?? []).map((folder) => ({
    id: folder.id,
    name: folder.name,
    subject: folder.subject,
    examName: folder.exam_name,
    examType: folder.exam_type,
    createdAt: folder.created_at,
    paperCount: 0,
    topicCount: 0,
  }));

  return (
    <div className="mx-auto max-w-7xl space-y-8 pb-12">
      <DashboardHeader folderCount={folderList.length} />
      <FolderGrid folders={folderList} />
    </div>
  );
}

