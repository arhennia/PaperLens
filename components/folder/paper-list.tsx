"use client";

import { useState, useTransition } from "react";

import { deletePaper, triggerExtraction } from "@/app/actions/papers";
import { buttonDanger } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import type { PapersRow } from "@/types/database.generated";

export function PaperList({
  folderId,
  papers,
}: {
  folderId: string;
  papers: PapersRow[];
}) {
  const [items, setItems] = useState(papers);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  if (items.length === 0) return null;

  function removePaper(paper: PapersRow) {
    if (!window.confirm(`Remove ${paper.original_filename}?`)) return;

    startTransition(async () => {
      try {
        await deletePaper(paper.id, folderId);
        setItems((current) => current.filter((item) => item.id !== paper.id));
      } catch (error) {
        window.alert(error instanceof Error ? error.message : "Failed to remove paper.");
      }
    });
  }

  function retryProcessing() {
    setMessage(null);
    startTransition(async () => {
      try {
        await triggerExtraction(folderId);
        setMessage("Processing queued. Keep the Python worker running and refresh shortly.");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not queue processing.");
      }
    });
  }

  return (
    <section className="mt-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-ink">Papers in this folder</h2>
          <p className="mt-1 text-xs text-faint">These records are loaded from Supabase.</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted">{items.length} paper{items.length === 1 ? "" : "s"}</span>
          {items.some((paper) => paper.extraction_status !== "extracted") && (
            <button type="button" onClick={retryProcessing} className="rounded-md border border-accent/30 px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent-soft" disabled={isPending}>
              Retry processing
            </button>
          )}
        </div>
      </div>

      {message && <p className="mt-2 text-sm text-muted">{message}</p>}

      <div className="mt-3 divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
        {items.map((paper) => (
          <div key={paper.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink">{paper.original_filename}</p>
              <p className="mt-1 text-xs text-faint">
                {paper.year ? `Exam year ${paper.year}` : "Year not set"}
                {paper.year_source === "filename" ? " · detected from filename" : ""}
                {paper.year_source === "manual" ? " · entered manually" : ""}
                {` · added ${formatDate(paper.created_at)}`}
              </p>
            </div>
            <span className="rounded-full bg-canvas px-2 py-1 text-xs text-muted">
              {paper.extraction_status}
            </span>
            <button
              type="button"
              onClick={() => removePaper(paper)}
              className={buttonDanger}
              disabled={isPending}
            >
              Remove
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
