/**
 * Client for the Python processing service (D-021).
 *
 * ---------------------------------------------------------------------------
 * This module must never be imported by a Client Component.
 *
 * `import "server-only"` makes that a build error rather than a runtime leak:
 * `PROCESSING_SERVICE_TOKEN` is a shared secret, and `PROCESSING_SERVICE_URL`
 * may point at a private network address that has no business in a browser
 * bundle.
 * ---------------------------------------------------------------------------
 *
 * The trust model, stated because it is unusual: this client sends `user_id` in
 * the request body, and FastAPI acts on it without verifying it. That is safe
 * only because of the order of operations — the caller has already authenticated
 * the session and confirmed the folder belongs to that user under RLS, and the
 * bearer token is what makes "the caller is trusted" checkable. FastAPI verifies
 * *callers*, not *users* (D-021).
 *
 * So: never call these functions before an ownership check. `lib/auth.ts`
 * `authorizeFolderRoute` is that check.
 */

import "server-only";

import { processingServiceToken, processingServiceUrl } from "@/lib/env";

/** What FastAPI returns from an enqueue call (`backend/main.py` `JobResponse`). */
export interface EnqueueResult {
  jobId: string | null;
  status: string;
  /** True when an identical job was already queued. A success, not an error. */
  duplicate: boolean;
}

/**
 * Enqueues extraction for every unextracted paper in a folder.
 *
 * Idempotent on the set of pending papers, so a double-clicked upload button
 * coalesces into one job (D-018).
 */
export function enqueueExtraction(
  folderId: string,
  userId: string,
): Promise<EnqueueResult> {
  return enqueue("extract", folderId, userId);
}

/**
 * Enqueues analysis for a folder.
 *
 * Idempotent on the analytics fingerprint, so re-requesting analysis of an
 * unchanged folder is a no-op rather than a redundant recompute (D-014).
 */
export function enqueueAnalysis(
  folderId: string,
  userId: string,
): Promise<EnqueueResult> {
  return enqueue("analyze", folderId, userId);
}

async function enqueue(
  jobType: "extract" | "analyze",
  folderId: string,
  userId: string,
): Promise<EnqueueResult> {
  const response = await fetch(
    `${processingServiceUrl().replace(/\/$/, "")}/internal/jobs/${jobType}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // Proves this request came from trusted server code (D-021).
        authorization: `Bearer ${processingServiceToken()}`,
      },
      body: JSON.stringify({ folder_id: folderId, user_id: userId }),
      // Enqueueing is a fast insert. A longer timeout would leave a user watching
      // a spinner while the processing service is unreachable.
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    // The body may carry FastAPI's `detail`, but it is service-internal text and
    // is deliberately not forwarded to the browser.
    throw new ProcessingServiceError(
      `The processing service rejected the ${jobType} request.`,
      response.status,
    );
  }

  const body = (await response.json()) as {
    job_id: string | null;
    status: string;
    duplicate?: boolean;
  };

  return {
    jobId: body.job_id,
    status: body.status,
    duplicate: body.duplicate === true,
  };
}

/**
 * Error from the processing service.
 *
 * Carries the upstream status so a route handler can distinguish "the service is
 * down" (retryable, 503) from "the request was wrong" (a bug, 500).
 */
export class ProcessingServiceError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ProcessingServiceError";
  }
}
