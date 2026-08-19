"use client";

/**
 * Modal for creating a new subject folder.
 *
 * Uses the native <dialog> element for accessibility (focus trapping, Escape to
 * close) without a third-party modal library.
 */

import { useRef, useState, useTransition } from "react";

import { createFolder } from "@/app/actions/folders";
import { buttonPrimary, buttonSecondary } from "@/components/ui/button";

export function CreateFolderModal() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function open() {
    setError(null);
    dialogRef.current?.showModal();
  }

  function close() {
    dialogRef.current?.close();
  }

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await createFolder(formData);
        // createFolder redirects on success, so we only reach here on error.
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    });
  }

  return (
    <>
      <button type="button" onClick={open} className={buttonPrimary}>
        + New Subject Folder
      </button>

      <dialog
        ref={dialogRef}
        className="w-full max-w-md rounded-xl border border-border bg-surface p-0 shadow-xl backdrop:bg-ink/40"
        onClick={(e) => {
          // Close on backdrop click.
          if (e.target === dialogRef.current) close();
        }}
      >
        <div className="p-6">
          <h2 className="text-lg font-semibold text-ink">
            Create Subject Folder
          </h2>
          <p className="mt-1 text-sm text-muted">
            Organize your exam papers by subject or course.
          </p>

          {error && (
            <div className="mt-3 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
              {error}
            </div>
          )}

          <form action={handleSubmit} className="mt-5 space-y-4">
            <div>
              <label
                htmlFor="folder-name"
                className="mb-1 block text-sm font-medium text-ink"
              >
                Folder name <span className="text-danger">*</span>
              </label>
              <input
                id="folder-name"
                name="name"
                type="text"
                required
                autoFocus
                placeholder="e.g. Data Structures"
                className="w-full rounded-lg border border-border bg-canvas px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>

            <div>
              <label
                htmlFor="folder-subject"
                className="mb-1 block text-sm font-medium text-ink"
              >
                Subject code{" "}
                <span className="text-faint">(optional)</span>
              </label>
              <input
                id="folder-subject"
                name="subject"
                type="text"
                placeholder="e.g. CS201"
                className="w-full rounded-lg border border-border bg-canvas px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>

            <div>
              <label
                htmlFor="folder-exam-name"
                className="mb-1 block text-sm font-medium text-ink"
              >
                Exam name{" "}
                <span className="text-faint">(optional)</span>
              </label>
              <input
                id="folder-exam-name"
                name="exam_name"
                type="text"
                placeholder="e.g. Mid-Semester 2024"
                className="w-full rounded-lg border border-border bg-canvas px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={close}
                className={buttonSecondary}
                disabled={isPending}
              >
                Cancel
              </button>
              <button
                type="submit"
                className={buttonPrimary}
                disabled={isPending}
              >
                {isPending ? "Creating…" : "Create folder"}
              </button>
            </div>
          </form>
        </div>
      </dialog>
    </>
  );
}
