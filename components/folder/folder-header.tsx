import { formatDate } from "@/lib/format";
import type { FoldersRow } from "@/types/database.generated";
import { Badge } from "@/components/ui/badge";

export function FolderHeader({
  folder,
  paperCount,
  lastAnalyzed,
  children,
}: {
  folder: FoldersRow;
  paperCount: number;
  lastAnalyzed: string | null;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-6 shadow-xs">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        {/* Left: Folder Info & Tags */}
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-ink">
              {folder.name}
            </h1>
            {folder.subject && (
              <Badge className="bg-primary-soft text-primary border-primary/30 font-semibold px-2.5 py-0.5">
                {folder.subject}
              </Badge>
            )}
            {folder.exam_name && (
              <span className="rounded-md bg-surface-container px-2 py-0.5 text-xs font-medium text-muted">
                {folder.exam_name}
              </span>
            )}
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-4 text-xs text-muted">
            <span className="flex items-center gap-1 font-medium text-ink">
              <span className="material-symbols-outlined text-[16px] text-primary">
                picture_as_pdf
              </span>
              {paperCount} {paperCount === 1 ? "Paper" : "Papers"} Loaded
            </span>

            <span>•</span>

            <span className="flex items-center gap-1">
              <span className="material-symbols-outlined text-[16px] text-faint">
                history
              </span>
              {lastAnalyzed
                ? `Last analyzed ${formatDate(lastAnalyzed)}`
                : "Awaiting analysis run"}
            </span>

            {folder.reference_year && (
              <>
                <span>•</span>
                <span>Reference Year: {folder.reference_year}</span>
              </>
            )}
          </div>
        </div>

        {/* Right: Actions & Share Modal */}
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <a
            href="#checklist"
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs md:text-sm font-semibold text-white shadow-xs hover:bg-primary-hover transition-all"
          >
            <span className="material-symbols-outlined text-[18px]">play_circle</span>
            <span>Start Studying</span>
          </a>

          {children}
        </div>
      </div>
    </div>
  );
}
