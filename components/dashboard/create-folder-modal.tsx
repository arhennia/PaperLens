"use client";

import { useRef, useState, useTransition, useEffect } from "react";
import { createFolder } from "@/app/actions/folders";
import { buttonPrimary, buttonSecondary } from "@/components/ui/button";

interface CreateFolderModalProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export function CreateFolderModal({ isOpen, onClose }: CreateFolderModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen !== undefined) {
      if (isOpen) {
        setError(null);
        dialogRef.current?.showModal();
      } else {
        dialogRef.current?.close();
      }
    }
  }, [isOpen]);

  function open() {
    setError(null);
    dialogRef.current?.showModal();
  }

  function close() {
    dialogRef.current?.close();
    onClose?.();
  }

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await createFolder(formData);
        close();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    });
  }

  return (
    <>
      {isOpen === undefined && (
        <button
          type="button"
          onClick={open}
          className="flex items-center gap-2 rounded-lg bg-[#FD6B2A] px-5 py-3 text-xs font-bold uppercase tracking-wider text-white shadow-xs transition-colors hover:bg-[#E05B22]"
        >
          <span className="material-symbols-outlined text-[18px]">add_circle</span>
          <span>New Analysis Group</span>
        </button>
      )}

      <dialog
        ref={dialogRef}
        className="backdrop:bg-black/40 backdrop:backdrop-blur-xs rounded-2xl border border-gray-200 bg-white p-6 shadow-xl max-w-lg w-full fixed inset-0 m-auto text-gray-900"
      >
        <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-5">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#0099FF] text-xl">
              create_new_folder
            </span>
            <h2 className="text-base font-bold text-gray-900">
              Create New Analysis Group
            </h2>
          </div>
          <button
            type="button"
            onClick={close}
            className="text-gray-400 hover:text-gray-700 text-lg leading-none cursor-pointer"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px]">error</span>
            <span>{error}</span>
          </div>
        )}

        <form action={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="name"
              className="block text-xs font-semibold text-gray-800 mb-1"
            >
              Group / Exam Name <span className="text-red-500">*</span>
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              placeholder="e.g., Mid-Sem 2023, End-Sem Comprehensive"
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-900 focus:border-[#0099FF] focus:outline-none shadow-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="subject"
                className="block text-xs font-semibold text-gray-800 mb-1"
              >
                Subject / Course <span className="text-red-500">*</span>
              </label>
              <input
                id="subject"
                name="subject"
                type="text"
                required
                placeholder="e.g., DBMS, OS, DSA"
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-900 focus:border-[#0099FF] focus:outline-none shadow-xs"
              />
            </div>

            <div>
              <label
                htmlFor="exam_type"
                className="block text-xs font-semibold text-gray-800 mb-1"
              >
                Assessment Type
              </label>
              <select
                id="exam_type"
                name="exam_type"
                defaultValue="MID-SEM"
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-900 focus:border-[#0099FF] focus:outline-none shadow-xs"
              >
                <option value="MID-SEM">Mid-Sem</option>
                <option value="END-SEM">End-Sem</option>
                <option value="LABORATORY">Laboratory</option>
                <option value="QUIZ">Quiz / Assignment</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={close}
              className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
              disabled={isPending}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-[#0099FF] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0088ee] disabled:opacity-50"
              disabled={isPending}
            >
              {isPending ? "Creating..." : "Create Analysis Group"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
