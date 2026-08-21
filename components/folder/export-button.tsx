"use client";

import { useState } from "react";
import { Download } from "lucide-react";

/**
 * Export dropdown with 4 format options.
 * Downloads from /api/folders/[id]/export/[format]
 */
export function ExportButton({ folderId }: { folderId: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);

  const formats = [
    { id: "markdown", label: "Markdown (.md)", ext: "md" },
    { id: "latex", label: "LaTeX (.tex)", ext: "tex" },
    { id: "anki", label: "Anki CSV", ext: "csv" },
    { id: "pdf", label: "Printable HTML", ext: "html" },
  ];

  async function handleDownload(format: string, ext: string) {
    setDownloading(format);
    try {
      const response = await fetch(
        `/api/folders/${folderId}/export/${format}`
      );
      if (!response.ok) throw new Error("Export failed");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `export_${Date.now()}.${ext}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error("Download failed:", error);
      alert("Export failed. Please try again.");
    } finally {
      setDownloading(null);
      setIsOpen(false);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-ink hover:bg-surface-hover transition-colors"
      >
        <Download className="h-4 w-4" />
        Export
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 top-full mt-2 z-20 w-56 rounded-lg border border-border bg-surface shadow-lg">
            <div className="p-2">
              {formats.map((format) => (
                <button
                  key={format.id}
                  onClick={() => handleDownload(format.id, format.ext)}
                  disabled={downloading === format.id}
                  className="w-full rounded px-3 py-2 text-left text-sm text-ink hover:bg-surface-hover transition-colors disabled:opacity-50"
                >
                  {downloading === format.id ? "Downloading..." : format.label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
