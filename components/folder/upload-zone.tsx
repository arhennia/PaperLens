"use client";

import { useCallback, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { STORAGE_BUCKET } from "@/lib/env";
import {
  createPaperRecord,
  deletePaperRecord,
  triggerExtraction,
} from "@/app/actions/papers";
import { formatFileSize } from "@/lib/format";
import { buttonPrimary } from "@/components/ui/button";

interface UploadFile {
  file: File;
  status: "pending" | "uploading" | "done" | "error";
  error?: string;
}

const MAX_FILE_SIZE = 25 * 1024 * 1024;

export function UploadZone({ folderId }: { folderId: string }) {
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const handleFiles = useCallback(
    async (fileList: FileList) => {
      const pdfFiles = Array.from(fileList).filter(
        (file) => file.type === "application/pdf" && file.size <= MAX_FILE_SIZE,
      );
      if (pdfFiles.length === 0) return;

      const uploadFiles: UploadFile[] = pdfFiles.map((file) => ({
        file,
        status: "pending",
      }));
      setFiles((prev) => [...prev, ...uploadFiles]);
      setIsUploading(true);
      let successfulUploads = 0;

      const supabase = createClient();

      for (let i = 0; i < uploadFiles.length; i++) {
        const uf = uploadFiles[i];
        setFiles((prev) =>
          prev.map((f) =>
            f.file.name === uf.file.name ? { ...f, status: "uploading" } : f,
          ),
        );

        let paperId: string | null = null;
        try {
          // Step 1: Create paper row.
          const created = await createPaperRecord(
            folderId,
            uf.file.name,
          );
          paperId = created.paperId;

          // Step 2: Upload to Supabase Storage.
          const { error } = await supabase.storage
            .from(STORAGE_BUCKET)
            .upload(created.storagePath, uf.file, {
              upsert: true,
              contentType: "application/pdf",
            });

          if (error) throw error;
          successfulUploads += 1;

          setFiles((prev) =>
            prev.map((f) =>
              f.file.name === uf.file.name ? { ...f, status: "done" } : f,
            ),
          );
        } catch (err) {
          if (paperId) {
            await deletePaperRecord(folderId, paperId).catch(() => undefined);
          }
          setFiles((prev) =>
            prev.map((f) =>
              f.file.name === uf.file.name
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

      if (successfulUploads > 0) {
        try {
          await triggerExtraction(folderId);
        } catch {
          // Non-critical: the user can manually trigger later.
        }
      }

      setIsUploading(false);
    },
    [folderId],
  );

  return (
    <div className="mt-6 rounded-2xl border border-border bg-surface p-6 shadow-xs">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary text-[22px]">
            upload_file
          </span>
          <h2 className="text-base font-bold text-ink">
            Add Past Exam Papers
          </h2>
        </div>
        <span className="text-xs text-muted">Supports multi-year batch PDF uploads</span>
      </div>

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
        className={`rounded-xl border-2 border-dashed p-8 text-center transition-all ${
          isDragging
            ? "border-primary bg-primary-soft/50 scale-[0.99]"
            : "border-border hover:border-primary/50 bg-surface-container-low/40"
        } ${isUploading ? "pointer-events-none opacity-70" : ""}`}
      >
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">
            <span className="material-symbols-outlined text-2xl">
              cloud_upload
            </span>
          </div>

          <div>
            <p className="text-sm font-semibold text-ink">
              Drag and drop exam question papers here
            </p>
            <p className="mt-1 text-xs text-faint">
              Accepts PDF files up to 25MB each · Automatic year & question detection
            </p>
          </div>

          <label className={`${buttonPrimary} cursor-pointer text-xs font-semibold shadow-xs`}>
            <span className="material-symbols-outlined text-[16px]">add</span>
            <span>Choose PDF Files</span>
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

      {/* Uploaded File Chips List */}
      {files.length > 0 && (
        <div className="mt-4 border-t border-border pt-4">
          <p className="text-xs font-semibold text-ink mb-2">Uploaded Materials ({files.length}):</p>
          <div className="flex flex-wrap gap-2">
            {files.map((uf, idx) => (
              <div
                key={idx}
                className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs shadow-2xs"
              >
                <span className="material-symbols-outlined text-[16px] text-primary">
                  picture_as_pdf
                </span>
                <span className="font-medium text-ink max-w-xs truncate">
                  {uf.file.name}
                </span>
                <span className="text-[10px] text-faint">
                  ({formatFileSize(uf.file.size)})
                </span>

                {uf.status === "uploading" && (
                  <span className="flex items-center gap-1 text-[11px] font-medium text-primary">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary animate-ping" />
                    Uploading…
                  </span>
                )}
                {uf.status === "done" && (
                  <span className="text-success text-[14px] font-bold">✓</span>
                )}
                {uf.status === "error" && (
                  <span className="text-danger text-[11px]" title={uf.error}>
                    ✗ Error
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
