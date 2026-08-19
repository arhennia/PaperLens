"use client";

/**
 * PDF upload zone.
 *
 * Multi-file drag-and-drop for exam papers. On drop or file selection:
 *   1. Creates a `papers` row per file via server action.
 *   2. Uploads each PDF to Supabase Storage at the returned path.
 *   3. Triggers extraction for the folder.
 *
 * Accepts only PDFs. Shows per-file upload progress. Disabled while an upload
 * batch is in progress.
 */

import { useCallback, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { STORAGE_BUCKET } from "@/lib/env";
import { createPaperRecord, triggerExtraction } from "@/app/actions/papers";
import { formatFileSize } from "@/lib/format";
import { buttonPrimary } from "@/components/ui/button";

interface UploadFile {
  file: File;
  status: "pending" | "uploading" | "done" | "error";
  error?: string;
}

export function UploadZone({ folderId }: { folderId: string }) {
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const handleFiles = useCallback(
    async (fileList: FileList) => {
      const pdfFiles = Array.from(fileList).filter(
        (f) => f.type === "application/pdf",
      );
      if (pdfFiles.length === 0) return;

      const uploadFiles: UploadFile[] = pdfFiles.map((file) => ({
        file,
        status: "pending",
      }));
      setFiles(uploadFiles);
      setIsUploading(true);

      const supabase = createClient();

      for (let i = 0; i < uploadFiles.length; i++) {
        const uf = uploadFiles[i];
        setFiles((prev) =>
          prev.map((f, idx) =>
            idx === i ? { ...f, status: "uploading" } : f,
          ),
        );

        try {
          // Step 1: Create paper row.
          const { storagePath } = await createPaperRecord(
            folderId,
            uf.file.name,
          );

          // Step 2: Upload to Supabase Storage.
          const { error } = await supabase.storage
            .from(STORAGE_BUCKET)
            .upload(storagePath, uf.file, {
              upsert: true,
              contentType: "application/pdf",
            });

          if (error) throw error;

          setFiles((prev) =>
            prev.map((f, idx) =>
              idx === i ? { ...f, status: "done" } : f,
            ),
          );
        } catch (err) {
          setFiles((prev) =>
            prev.map((f, idx) =>
              idx === i
                ? {
                    ...f,
                    status: "error",
                    error:
                      err instanceof Error
                        ? err.message
                        : "Upload failed",
                  }
                : f,
            ),
          );
        }
      }

      // Step 3: Trigger extraction for the folder.
      try {
        await triggerExtraction(folderId);
      } catch {
        // Non-critical: the user can manually trigger later.
      }

      setIsUploading(false);
    },
    [folderId],
  );

  return (
    <div className="mt-6">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          if (e.dataTransfer.files.length > 0) {
            handleFiles(e.dataTransfer.files);
          }
        }}
        className={`rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
          isDragging
            ? "border-accent bg-accent-soft"
            : "border-border hover:border-accent/50"
        } ${isUploading ? "pointer-events-none opacity-60" : ""}`}
      >
        <div className="flex flex-col items-center gap-3">
          <svg
            className="h-10 w-10 text-faint"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1}
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.233-2.33 3 3 0 0 1 3.758 3.848A3.752 3.752 0 0 1 18 19.5H6.75Z"
            />
          </svg>

          <div>
            <p className="text-sm font-medium text-ink">
              Drop PDF papers here
            </p>
            <p className="mt-1 text-xs text-faint">
              or click to browse
            </p>
          </div>

          <label className={`${buttonPrimary} cursor-pointer`}>
            Choose files
            <input
              type="file"
              accept="application/pdf"
              multiple
              className="sr-only"
              onChange={(e) => {
                if (e.target.files) handleFiles(e.target.files);
              }}
              disabled={isUploading}
            />
          </label>
        </div>
      </div>

      {/* Upload progress list */}
      {files.length > 0 && (
        <ul className="mt-3 space-y-1">
          {files.map((uf, idx) => (
            <li
              key={idx}
              className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm"
            >
              <span className="flex-1 truncate text-ink">
                {uf.file.name}
              </span>
              <span className="text-xs text-faint">
                {formatFileSize(uf.file.size)}
              </span>
              {uf.status === "uploading" && (
                <span className="text-xs text-accent">Uploading…</span>
              )}
              {uf.status === "done" && (
                <span className="text-xs text-success">✓</span>
              )}
              {uf.status === "error" && (
                <span className="text-xs text-danger" title={uf.error}>
                  ✗ Failed
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
