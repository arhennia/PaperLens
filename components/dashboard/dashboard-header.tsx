"use client";

import { useState } from "react";
import { CreateFolderModal } from "@/components/dashboard/create-folder-modal";
import { buttonPrimary } from "@/components/ui/button";

interface DashboardHeaderProps {
  folderCount: number;
}

export function DashboardHeader({ folderCount }: DashboardHeaderProps) {
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  return (
    <>
      <div className="space-y-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-ink">
            Subject Hubs
          </h1>
          <p className="mt-2 text-sm text-muted">
            Organize and analyze past university papers by subject
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsCreateOpen(true)}
          className={`${buttonPrimary} inline-flex items-center gap-2`}
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          <span>New Subject</span>
        </button>
      </div>

      <CreateFolderModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
      />
    </>
  );
}
