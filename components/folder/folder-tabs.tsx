"use client";

import { useState } from "react";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { UploadZone } from "@/components/folder/upload-zone";
import { ProcessingStatus } from "@/components/folder/processing-status";
import { AnalyticsSummary } from "@/components/folder/analytics-summary";
import { TopicAccordions } from "@/components/folder/topic-accordions";
import { StudyTools } from "@/components/folder/study-tools";
import { buttonPrimary, buttonSecondary } from "@/components/ui/button";
import type { TopicsRow, QuestionGroupsRow } from "@/types/database.generated";

interface WorkspaceGroup extends QuestionGroupsRow {
  question_label: string | null;
  page_numbers: number[];
  has_low_confidence: boolean;
  question_type: string | null;
  difficulty: string | null;
  marks: number | null;
}

interface FolderTabsProps {
  folderId: string;
  topicGroups: Array<{ topic: TopicsRow | null; groups: WorkspaceGroup[] }>;
  groups: WorkspaceGroup[];
  topics: TopicsRow[];
  analyticsPayload?: Record<string, unknown> | null;
}

const TAB_OPTIONS = [
  { id: "insights", label: "Exam Insights", icon: "analytics" },
  { id: "study", label: "Study Suite", icon: "school" },
  { id: "papers", label: "Paper Archives", icon: "folder" },
  { id: "export", label: "Export Suite", icon: "download" },
];

export function FolderTabs({
  folderId,
  topicGroups,
  groups,
  topics,
  analyticsPayload,
}: FolderTabsProps) {
  const [activeTab, setActiveTab] = useState("insights");

  const handleExport = async (format: string) => {
    try {
      const response = await fetch(
        `/api/folders/${folderId}/export?format=${format}`
      );
      if (!response.ok) throw new Error("Export failed");

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `study-guide.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error(`Export failed:`, error);
    }
  };

  return (
    <div className="mt-8 space-y-6">
      {/* Tab Navigation */}
      <div className="border-b border-border pb-4">
        <SegmentedControl
          options={TAB_OPTIONS}
          value={activeTab}
          onChange={setActiveTab}
        />
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === "insights" && (
          <div className="space-y-6">
            <TopicAccordions topicGroups={topicGroups} />
          </div>
        )}

        {activeTab === "study" && (
          <div className="space-y-6">
            <StudyTools
              folderId={folderId}
              groups={groups.map((group) => ({
                id: group.id,
                canonical_text: group.canonical_text,
                occurrence_count: group.occurrence_count,
                priority_level: group.priority_level,
                marks: group.marks,
                topic_name:
                  topics.find((topic) => topic.id === group.topic_id)?.name ??
                  null,
              }))}
            />
          </div>
        )}

        {activeTab === "papers" && (
          <div className="space-y-6">
            <UploadZone folderId={folderId} />
            <ProcessingStatus folderId={folderId} />
            <AnalyticsSummary payload={analyticsPayload} />
          </div>
        )}

        {activeTab === "export" && (
          <div className="space-y-6">
            <div className="rounded-lg border border-border bg-surface p-6 shadow-xs">
              <h3 className="font-semibold text-ink">Export Study Materials</h3>
              <p className="mt-2 text-sm text-muted">
                Download your analyzed exam papers in multiple formats for study
                and sharing.
              </p>

              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <button
                  onClick={() => handleExport("md")}
                  className={`${buttonPrimary} inline-flex w-full items-center justify-center gap-2`}
                >
                  <span className="material-symbols-outlined text-[18px]">
                    content_copy
                  </span>
                  <span>Copy Markdown</span>
                </button>

                <button
                  onClick={() => handleExport("tex")}
                  className={`${buttonPrimary} inline-flex w-full items-center justify-center gap-2`}
                >
                  <span className="material-symbols-outlined text-[18px]">
                    functions
                  </span>
                  <span>Copy LaTeX</span>
                </button>

                <button
                  onClick={() => handleExport("csv")}
                  className={`${buttonSecondary} inline-flex w-full items-center justify-center gap-2`}
                >
                  <span className="material-symbols-outlined text-[18px]">
                    download
                  </span>
                  <span>Anki Deck (CSV)</span>
                </button>

                <button
                  onClick={() => handleExport("pdf")}
                  className={`${buttonSecondary} inline-flex w-full items-center justify-center gap-2`}
                >
                  <span className="material-symbols-outlined text-[18px]">
                    picture_as_pdf
                  </span>
                  <span>Print Study Guide</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
