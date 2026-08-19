"""Durable job queue operations (D-018).

The claim itself is a database function called by RPC, not SQL written here:
``for update skip locked`` cannot be expressed through PostgREST, which is the
only interface ``supabase-py`` has (D-032). See
``supabase/migrations/20260819120400_job_queue_functions.sql``.

That also makes the claim atomic. A read-then-write from Python could hand the
same job to two workers in the gap between the two statements — a race rare
enough to survive testing and then duplicate processing in production.
"""

from dataclasses import dataclass

from backend.config import JOB_STALE_LOCK_MINUTES
from backend.db.client import get_client


@dataclass(frozen=True)
class Job:
    """A claimed job.

    Attributes:
        id: Job row id.
        folder_id: Folder being processed.
        user_id: Owner. **Every query the worker makes must be scoped by this**,
            since the worker's service-role connection bypasses RLS.
        job_type: ``extract`` or ``analyze``.
        payload: Job arguments. Never contains secrets — anyone who can read the
            row can read this.
        attempts: How many times this job has been claimed, including now.
        max_attempts: Retry budget.
        idempotency_key: Folder id plus content fingerprint.
    """

    id: str
    folder_id: str
    user_id: str
    job_type: str
    payload: dict
    attempts: int
    max_attempts: int
    idempotency_key: str


def claim_next_job(worker_id: str) -> Job | None:
    """Claim the oldest queued job, or None if the queue is empty.

    Args:
        worker_id: Identifies this worker in ``locked_by``, so a stuck job can be
            traced to the process holding it.

    Returns:
        The claimed :class:`Job`, already marked running.
    """
    response = get_client().rpc(
        "claim_next_job",
        {"worker_id": worker_id, "stale_lock_minutes": JOB_STALE_LOCK_MINUTES},
    ).execute()

    rows = response.data or []
    if not rows:
        return None

    row = rows[0]
    return Job(
        id=row["id"],
        folder_id=row["folder_id"],
        user_id=row["user_id"],
        job_type=row["job_type"],
        payload=row.get("payload") or {},
        attempts=row["attempts"],
        max_attempts=row["max_attempts"],
        idempotency_key=row["idempotency_key"],
    )


def complete_job(job_id: str, success: bool, error: str | None = None) -> None:
    """Mark a job finished.

    A failure with attempts remaining returns the job to the queue; one that has
    exhausted its budget stays failed with ``error`` recorded, so a stuck folder
    is diagnosable rather than invisible.
    """
    get_client().rpc(
        "complete_job", {"job_id": job_id, "success": success, "error": error}
    ).execute()


def update_progress(job_id: str, progress: int) -> None:
    """Report incremental progress, 0-100.

    Best-effort: a failure to report progress must not fail the job it is
    reporting on, so the exception is swallowed. The work is what matters; the
    percentage is cosmetic.
    """
    try:
        get_client().rpc(
            "update_job_progress", {"job_id": job_id, "new_progress": progress}
        ).execute()
    except Exception:
        pass


def extract_idempotency_key(folder_id: str, user_id: str) -> str:
    """Build the idempotency key for a folder's extract job.

    Derived from the set of papers not yet extracted, so a double-clicked upload
    button coalesces into one job, while genuinely adding a new paper produces a
    different key and therefore a new job (D-018).
    """
    from backend.db import papers as papers_db  # noqa: PLC0415 -- avoids a cycle

    pending = sorted(
        paper["id"]
        for paper in papers_db.list_papers(folder_id, user_id)
        if paper.get("extraction_status") != "extracted"
    )
    digest = _sha256(":".join(pending))
    return f"extract:{folder_id}:{digest}"


def analyze_idempotency_key(folder_id: str, user_id: str) -> str:
    """Build the idempotency key for a folder's analyze job.

    Keyed on the analytics fingerprint (D-014), so re-requesting analysis of an
    unchanged folder is a no-op, and any real change -- a new paper, a new
    correction -- produces a new key and a new job.
    """
    from backend.analysis.analytics import compute_fingerprint  # noqa: PLC0415
    from backend.db import folders as folders_db  # noqa: PLC0415
    from backend.db import papers as papers_db  # noqa: PLC0415
    from backend.db import questions as questions_db  # noqa: PLC0415

    folder = folders_db.get_folder(folder_id, user_id)
    fingerprint = compute_fingerprint(
        paper_content_hashes=papers_db.paper_content_hashes(folder_id, user_id),
        correction_ids=questions_db.correction_ids(folder_id, user_id),
        reference_year=(folder or {}).get("reference_year"),
    )
    return f"analyze:{folder_id}:{fingerprint}"


def _sha256(value: str) -> str:
    import hashlib  # noqa: PLC0415

    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def enqueue_job(
    folder_id: str,
    user_id: str,
    job_type: str,
    idempotency_key: str,
    payload: dict | None = None,
) -> str | None:
    """Enqueue a job unless one with the same idempotency key already exists.

    Returns:
        The new job's id, or None when an identical job was already queued — a
        double-clicked button or a retried request, which must not duplicate work.
    """
    response = (
        get_client()
        .table("processing_jobs")
        .upsert(
            {
                "folder_id": folder_id,
                "user_id": user_id,
                "job_type": job_type,
                "idempotency_key": idempotency_key,
                "payload": payload or {},
            },
            on_conflict="idempotency_key",
            # The existing row wins: an in-flight job must not be reset to
            # 'queued' and processed twice by a duplicate request.
            ignore_duplicates=True,
        )
        .execute()
    )

    rows = response.data or []
    return rows[0]["id"] if rows else None
