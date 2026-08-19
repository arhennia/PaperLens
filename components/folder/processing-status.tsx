"use client";

/**
 * Processing status banner.
 *
 * Subscribes to Supabase Realtime to watch `processing_jobs` for the current
 * folder. Shows a progress bar with status text when any job is active.
 *
 * Falls back to polling every 5 seconds if Realtime is unavailable (e.g. in
 * development without a running Supabase project).
 */

import { useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import type { ProcessingJobsRow } from "@/types/database.generated";

const STATUS_LABELS: Record<string, string> = {
  queued: "Queued for processing…",
  running: "Processing papers…",
  succeeded: "Processing complete",
  failed: "Processing failed",
};

export function ProcessingStatus({ folderId }: { folderId: string }) {
  const [jobs, setJobs] = useState<ProcessingJobsRow[]>([]);

  useEffect(() => {
    const supabase = createClient();

    // Initial fetch.
    async function fetchJobs() {
      const { data } = await supabase
        .from("processing_jobs")
        .select("*")
        .eq("folder_id", folderId)
        .in("status", ["queued", "running"])
        .order("created_at", { ascending: false });

      setJobs(data ?? []);
    }
    fetchJobs();

    // Realtime subscription.
    const channel = supabase
      .channel(`jobs-${folderId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "processing_jobs",
          filter: `folder_id=eq.${folderId}`,
        },
        () => {
          // Re-fetch on any change to get the full, RLS-filtered state.
          fetchJobs();
        },
      )
      .subscribe();

    // Polling fallback.
    const interval = setInterval(fetchJobs, 5000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [folderId]);

  if (jobs.length === 0) return null;

  const activeJob = jobs[0];
  const progress = activeJob.progress ?? 0;

  return (
    <div className="mt-4 rounded-lg border border-accent/30 bg-accent-soft px-4 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {activeJob.status === "running" && (
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-accent" />
            </span>
          )}
          <span className="text-sm font-medium text-ink">
            {STATUS_LABELS[activeJob.status] ?? activeJob.status}
          </span>
          <span className="text-xs text-muted">
            ({activeJob.job_type === "extract" ? "Extraction" : "Analysis"})
          </span>
        </div>
        <span className="text-xs font-medium tabular-nums text-accent">
          {Math.round(progress)}%
        </span>
      </div>

      {/* Progress bar */}
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-border">
        <div
          className="h-full rounded-full bg-accent transition-all duration-500"
          style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
        />
      </div>

      {activeJob.last_error && (
        <p className="mt-2 text-xs text-danger">{activeJob.last_error}</p>
      )}
    </div>
  );
}
