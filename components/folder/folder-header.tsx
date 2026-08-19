import { formatDate } from "@/lib/format";
import type { FoldersRow } from "@/types/database.generated";
import { Badge } from "@/components/ui/badge";

/**
 * Folder workspace header.
 *
 * Shows the subject title, paper count, last-analyzed date, and a trigger to
 * open the share modal. The share button is a callback prop rather than a modal
 * import — this keeps the header a pure Server Component.
 */
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
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-ink">
            {folder.name}
          </h1>
          {folder.subject && (
            <Badge className="bg-accent-soft text-accent border-accent/30">
              {folder.subject}
            </Badge>
          )}
        </div>

        {folder.exam_name && (
          <p className="mt-1 text-sm text-muted">{folder.exam_name}</p>
        )}

        <div className="mt-2 flex items-center gap-4 text-xs text-faint">
          <span>
            {paperCount} paper{paperCount !== 1 ? "s" : ""}
          </span>
          {lastAnalyzed && (
            <span>Last analyzed {formatDate(lastAnalyzed)}</span>
          )}
        </div>
      </div>

      {children && (
        <div className="flex shrink-0 items-center">
          {children}
        </div>
      )}
    </div>
  );
}
