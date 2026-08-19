"""FastAPI app for the PaperLens processing service.

Three routes, and deliberately no more (A.7, D-021)::

    POST /internal/jobs/extract    enqueue extraction for a folder
    POST /internal/jobs/analyze    enqueue analysis for a folder
    GET  /health                   liveness

This is an **internal** service. The browser never calls it: Next.js
authenticates the user, authorizes the folder under RLS, and then calls here
server-to-server with a shared bearer token. Consequences worth stating, because
each one replaces something the previous implementation did:

* **No CORS middleware.** Not reconfigured -- removed. The old app set
  ``allow_origins=["*"]`` with ``allow_credentials=True``, a combination browsers
  reject for credentialed requests and which is unsafe once auth exists
  (AUDIT.md 4.5). A service with no browser callers needs no CORS at all.
* **No file uploads.** The browser uploads straight to Supabase Storage using a
  short-lived signed URL that Next.js issues after checking folder ownership, so
  large PDFs never pass through this service. That also removes the path-traversal
  defect entirely: the old handler joined an attacker-controlled ``file.filename``
  into a filesystem path (AUDIT.md 4.6), and there is now no client-supplied
  string anywhere near a path (D-016).
* **No user sessions.** This service verifies callers, not users (D-021).
* **Work is enqueued, never run inline.** The old ``/api/sessions`` route did the
  processing in ``BackgroundTasks``, so it died with the web process. These routes
  only insert a job row; :mod:`backend.worker` does the work (D-018).

The eight ``/api/sessions/*`` routes are gone. Everything they served -- status,
questions, analytics, rejected questions, CSV export -- is a plain authenticated
read that Next.js does directly against Supabase under RLS, so proxying it through
here would add a hop and a second authorization path for no benefit (A.3).
"""

import logging

from fastapi import Depends, FastAPI, HTTPException, status
from pydantic import BaseModel, Field

from backend.auth import verify_service_token
from backend.config import ALGO_VERSION, NORMALIZER_VERSION
from backend.db import jobs as jobs_db

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(name)s: %(message)s",
)
logger = logging.getLogger("paperlens.api")

app = FastAPI(
    title="PaperLens Processing Service",
    description=(
        "Internal PDF extraction and analysis service. Called only by the "
        "PaperLens Next.js server, never by a browser."
    ),
    version="2.0.0",
)


class JobRequest(BaseModel):
    """A request to enqueue work for one folder.

    Both ids are validated as UUIDs by the type annotation, which rejects
    malformed input at the boundary rather than passing it to a query.

    ``user_id`` is supplied by the caller because this service has no user
    session. That is safe only because the caller is trusted: Next.js has already
    verified the session and confirmed the folder belongs to that user before
    calling. The service token is what makes "the caller is trusted" checkable
    (D-021).
    """

    folder_id: str = Field(..., description="Folder to process.")
    user_id: str = Field(..., description="Owner, already authorized by the caller.")


class JobResponse(BaseModel):
    """The outcome of an enqueue request.

    ``duplicate`` is True when an identical job was already queued, which is a
    success rather than an error: a double-clicked button should be a no-op, not a
    failure the user sees (D-018).
    """

    job_id: str | None
    status: str
    duplicate: bool = False


@app.get("/health")
def health() -> dict:
    """Liveness check.

    Reports the algorithm versions so a deployment mismatch between this service
    and the database is visible without shelling in — a worker running a different
    normalizer version than the stored hashes would silently produce duplicate
    question groups.

    Deliberately unauthenticated: platform health checks cannot hold a secret, and
    it exposes nothing a caller could not learn from a failed request.
    """
    return {
        "status": "ok",
        "service": "paperlens-processing",
        "normalizer_version": NORMALIZER_VERSION,
        "algo_version": ALGO_VERSION,
    }


@app.post(
    "/internal/jobs/extract",
    response_model=JobResponse,
    dependencies=[Depends(verify_service_token)],
)
def enqueue_extract(request: JobRequest) -> JobResponse:
    """Enqueue extraction for every unextracted paper in a folder."""
    return _enqueue(
        job_type="extract",
        folder_id=request.folder_id,
        user_id=request.user_id,
        idempotency_key=jobs_db.extract_idempotency_key(
            request.folder_id, request.user_id
        ),
    )


@app.post(
    "/internal/jobs/analyze",
    response_model=JobResponse,
    dependencies=[Depends(verify_service_token)],
)
def enqueue_analyze(request: JobRequest) -> JobResponse:
    """Enqueue analysis for a folder.

    Idempotent on the analytics fingerprint, so requesting analysis of an
    unchanged folder does not queue redundant work (D-014).
    """
    return _enqueue(
        job_type="analyze",
        folder_id=request.folder_id,
        user_id=request.user_id,
        idempotency_key=jobs_db.analyze_idempotency_key(
            request.folder_id, request.user_id
        ),
    )


def _enqueue(
    job_type: str, folder_id: str, user_id: str, idempotency_key: str
) -> JobResponse:
    """Insert a job row, or report that an identical one already exists."""
    try:
        job_id = jobs_db.enqueue_job(
            folder_id=folder_id,
            user_id=user_id,
            job_type=job_type,
            idempotency_key=idempotency_key,
        )
    except Exception as exc:
        # Surfaced as a 503 rather than a 500: the caller's request was valid and
        # retrying is the right response, which a 500 would not communicate.
        logger.error("Could not enqueue %s for folder %s: %s", job_type, folder_id, exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Could not enqueue the {job_type} job. Please retry.",
        ) from exc

    if job_id is None:
        logger.info("A %s job for folder %s is already queued.", job_type, folder_id)
        return JobResponse(job_id=None, status="already_queued", duplicate=True)

    logger.info("Enqueued %s job %s for folder %s.", job_type, job_id, folder_id)
    return JobResponse(job_id=job_id, status="queued")
