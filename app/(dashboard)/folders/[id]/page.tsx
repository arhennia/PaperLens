import { Suspense } from "react";
import { requireFolder } from "@/lib/auth";
import { FolderWorkspaceView } from "@/components/folder/folder-workspace-view";

export default async function FolderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const folder = await requireFolder(id);

  return (
    <div className="mx-auto max-w-7xl">
      <Suspense fallback={<div className="p-8 text-center text-xs text-gray-500">Loading workspace...</div>}>
        <FolderWorkspaceView folder={folder} />
      </Suspense>
    </div>
  );
}
