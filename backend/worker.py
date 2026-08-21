"""Durable job worker: claim, process, release (D-018).

Replaces FastAPI ``BackgroundTasks``, which ran the pipeline inside an ephemeral
web request. That meant work died with the process, could not be retried, and left
no record — the failure the audit found (AUDIT.md 1).

Run it as its own process alongside the web service::

    python -m backend.worker

Two pipelines:

**extract** — download each PDF, detect its year, pull out text with per-page
provenance, parse questions, validate them, tag type and difficulty, compute
content-addressed identity, and persist.

**analyze** — group questions by exact hash, cluster advisory near-duplicates,
classify topics, score priority, and cache analytics.

Idempotency comes from content addressing rather than bookkeeping (D-011). Running
extract twice over an unchanged paper produces the same hashes, so the upserts are
no-ops. The previous implementation needed a special "this paper is a duplicate,
copy its questions across" branch — which minted question ids in a *different*
format from the main path, so the same paper produced different ids depending on
which branch ran. With identity derived from content, that branch is unnecessary
and is gone.
"""

import logging
import os
import socket
import time
import traceback

from backend.analysis.analytics import compute_analytics, compute_fingerprint
from backend.analysis.dedup import group_questions
from backend.analysis.scoring import score_groups
from backend.analysis.similarity import cluster_groups, cluster_sizes
from backend.analysis.tagging import classify_difficulty, classify_type
from backend.analysis.topics import build_topics, classify_group, coverage_gaps
from backend.config import (
    ALGO_VERSION,
    INSTITUTION_PROFILE,
    SIMILARITY_THRESHOLD,
    WORKER_POLL_SECONDS,
)
from backend.db import folders as folders_db
from backend.db import jobs as jobs_db
from backend.db import papers as papers_db
from backend.db import questions as questions_db
from backend.db.client import download_pdf
from backend.extraction.normalize import (
    clean_question_text,
    normalize_question_label,
    question_identity,
)
from backend.extraction.parser import flatten_leaf_questions, parse_questions
from backend.extraction.patterns import get_profile
from backend.extraction.pdf import detect_year, extract_pdf
from backend.extraction.validation import validate_question

logger = logging.getLogger("paperlens.worker")


def worker_id() -> str:
    """Identify this worker in ``processing_jobs.locked_by``.

    Host plus pid, so a job stuck in ``running`` can be traced to the process
    holding it.
    """
    return f"{socket.gethostname()}:{os.getpid()}"


# ---------------------------------------------------------------------------
# Extraction
# ---------------------------------------------------------------------------


def process_paper(paper: dict, folder_id: str, user_id: str) -> int:
    """Extract one paper and persist its questions and page provenance.

    Returns:
        The number of accepted questions.

    Raises:
        Exception: Any failure. The caller records it against the paper and
            decides whether to retry.
    """
    paper_id = paper["id"]
    profile = get_profile(INSTITUTION_PROFILE)

    papers_db.update_paper(paper_id, user_id, extraction_status="extracting")

    pdf_bytes = download_pdf(paper["storage_path"])

    # Year comes from the paper row when the user already supplied it; otherwise
    # detect it. A paper with no year still extracts -- it just cannot contribute
    # to recency or year-spread analysis until the user supplies one, which is
    # better than refusing to process it.
    year = paper.get("year")
    year_source = paper.get("year_source")
    if year is None:
        year, year_source = detect_year(pdf_bytes, paper.get("original_filename") or "")

    extraction = extract_pdf(pdf_bytes)

    papers_db.replace_paper_pages(
        paper_id,
        user_id,
        [
            {
                "page_number": page.page_number,
                "extraction_method": page.method,
                "char_count": page.char_count,
                "ocr_confidence": page.ocr_confidence,
            }
            for page in extraction.pages
        ],
    )

    # Per-page provenance, so each question can be flagged if the page it came
    # from was read unreliably (D-013).
    page_by_number = {page.page_number: page for page in extraction.pages}

    parsed, _sections, warnings = parse_questions(extraction.text, profile)
    leaves = flatten_leaf_questions(parsed)

    rows = [
        _build_question_row(leaf, page_by_number, profile) for leaf in leaves
    ]
    stored = questions_db.replace_paper_questions(paper_id, folder_id, user_id, rows)

    accepted = sum(1 for row in rows if row["status"] == "accepted")

    # A paper whose OCR failed is recorded as extracted but carries the reason, so
    # the UI can tell the student the text may be unreliable rather than
    # presenting fragments as clean (D-013). This is the fix for the bare `except`
    # that used to swallow OCR failure entirely.
    error_message = None
    if extraction.has_failed_ocr:
        failed = [p.page_number for p in extraction.pages if p.method == "ocr_failed"]
        error_message = (
            f"OCR did not succeed on page(s) {', '.join(map(str, failed))}. "
            "The text from those pages may be incomplete -- check the original PDF."
        )
    elif warnings:
        error_message = " ".join(warnings)[:2000]

    papers_db.update_paper(
        paper_id,
        user_id,
        year=year,
        year_source=year_source,
        content_hash=_sha256(pdf_bytes),
        page_count=extraction.page_count,
        extraction_status="extracted",
        extraction_method=extraction.method,
        error_message=error_message,
    )

    logger.info(
        "Extracted %s: %d/%d questions accepted, method=%s, pages=%d",
        paper.get("original_filename"),
        accepted,
        len(rows),
        extraction.method,
        extraction.page_count,
    )
    return len(stored)


def _build_question_row(leaf: dict, page_by_number: dict, profile) -> dict:
    """Turn one parsed leaf question into a database row.

    Identity is computed here, once, via :func:`question_identity` so the
    normalizer version is always recorded alongside the hash it produced (D-011).
    """
    cleaned = clean_question_text(leaf.get("text") or "")
    normalized, digest, normalizer_version = question_identity(cleaned)

    validation = validate_question(cleaned, profile)
    marks = leaf.get("marks")
    question_type = classify_type(cleaned, marks)

    page_number = leaf.get("page_number")
    page = page_by_number.get(page_number)

    return {
        "question_label": normalize_question_label(leaf.get("label_path") or ""),
        "label_path": leaf.get("label_path") or "",
        "text_extracted": cleaned,
        "text_normalized": normalized,
        "normalized_hash": digest,
        "normalizer_version": normalizer_version,
        "marks": marks,
        "section": leaf.get("section"),
        "page_number": page_number,
        "question_type": question_type,
        "difficulty": classify_difficulty(cleaned, marks, question_type),
        "confidence": validation.confidence,
        # Rejected questions are stored rather than dropped, so a student can
        # review what the heuristic filtered and accept it if it was wrong (D-025).
        "status": "rejected" if validation.is_rejected else "accepted",
        "reject_reason": validation.reason if validation.is_rejected else None,
        # Carried for the analysis stage; not a database column.
        "low_confidence": bool(page and page.is_low_confidence),
    }


def run_extract(job: jobs_db.Job) -> None:
    """Extract every pending paper in the job's folder."""
    papers = papers_db.list_papers(job.folder_id, job.user_id)
    if not papers:
        logger.info("Folder %s has no papers to extract.", job.folder_id)
        return

    # Skip papers already extracted: re-running a folder's extract job should not
    # redo work that succeeded, which is what makes a retry after a partial
    # failure cheap.
    pending = [p for p in papers if p.get("extraction_status") != "extracted"]
    if not pending:
        logger.info("Folder %s is already fully extracted.", job.folder_id)
        return

    failures: list[str] = []
    for index, paper in enumerate(pending, start=1):
        try:
            process_paper(paper, job.folder_id, job.user_id)
        except Exception as exc:
            # One bad PDF must not abandon the rest of the folder. The paper is
            # marked failed with its reason, and the job reports which papers
            # failed at the end.
            logger.error(
                "Failed to extract %s: %s", paper.get("original_filename"), exc
            )
            logger.debug(traceback.format_exc())
            papers_db.mark_paper_failed(paper["id"], job.user_id, str(exc))
            failures.append(paper.get("original_filename") or paper["id"])

        jobs_db.update_progress(job.id, int(90 * index / len(pending)))

    if failures:
        raise RuntimeError(f"Extraction failed for: {', '.join(failures)}")

    # Extraction is the prerequisite for analysis. Queue it only after every
    # pending paper succeeded so the analysis job never races incomplete data.
    jobs_db.enqueue_job(
        folder_id=job.folder_id,
        user_id=job.user_id,
        job_type="analyze",
        idempotency_key=jobs_db.analyze_idempotency_key(
            job.folder_id, job.user_id
        ),
    )


# ---------------------------------------------------------------------------
# Analysis
# ---------------------------------------------------------------------------


def run_analyze(job: jobs_db.Job) -> None:
    """Group, cluster, classify, score, and cache analytics for a folder."""
    folder = folders_db.get_folder(job.folder_id, job.user_id)
    if folder is None:
        raise RuntimeError(f"Folder {job.folder_id} not found for its owner.")

    all_questions = questions_db.list_folder_questions(job.folder_id, job.user_id)
    accepted = [q for q in all_questions if q.get("status") == "accepted"]
    if not accepted:
        logger.info("Folder %s has no accepted questions to analyse.", job.folder_id)
        return

    paper_years = [
        p.get("year") for p in papers_db.list_papers(job.folder_id, job.user_id)
    ]
    reference_year = folders_db.ensure_reference_year(
        job.folder_id, job.user_id, [y for y in paper_years if y is not None]
    )

    # Fingerprint first: if nothing that feeds analytics has changed, the whole
    # pipeline is skipped. This is what makes cached analytics cheap for repeat
    # viewers, including public share viewers (D-014).
    fingerprint = compute_fingerprint(
        paper_content_hashes=papers_db.paper_content_hashes(job.folder_id, job.user_id),
        correction_ids=questions_db.correction_ids(job.folder_id, job.user_id),
        reference_year=reference_year,
    )
    if questions_db.cached_analytics_fingerprint(job.folder_id, job.user_id) == fingerprint:
        logger.info(
            "Folder %s analytics are already current (fingerprint unchanged).",
            job.folder_id,
        )
        jobs_db.update_progress(job.id, 100)
        return

    jobs_db.update_progress(job.id, 20)

    # Exact grouping. Authoritative: this drives repeat counts and weightage.
    groups = group_questions(accepted)
    group_dicts = [
        {
            "normalized_hash": group.normalized_hash,
            "canonical_text": group.canonical_text,
            "occurrence_count": group.occurrence_count,
            "distinct_years": group.distinct_years,
            "years": group.years,
            "avg_marks": group.avg_marks,
            "max_marks": group.max_marks,
            "first_year": group.first_year,
            "last_year": group.last_year,
            "year_span": group.year_span,
        }
        for group in groups
    ]

    # Advisory clustering. Never merges identities (D-024).
    clustering = cluster_groups(group_dicts, SIMILARITY_THRESHOLD)
    if not clustering.available:
        logger.warning("%s", clustering.note)
    sizes = cluster_sizes(clustering)

    jobs_db.update_progress(job.id, 45)

    chapter_names, topic_source = folders_db.syllabus_chapters(
        job.folder_id, job.user_id
    )
    topics = build_topics(chapter_names, topic_source)
    topic_by_hash = {
        group["normalized_hash"]: classify_group(group["canonical_text"], topics)
        for group in group_dicts
    }

    scored = score_groups(
        group_dicts,
        reference_year=reference_year,
        total_years=len({y for y in paper_years if y is not None}),
        cluster_sizes=sizes,
        folder_total_marks=folder.get("total_marks"),
    )

    jobs_db.update_progress(job.id, 70)

    # Persist. Groups upsert on identity, so their uuids survive and anything
    # referencing them stays valid (D-011).
    group_id_by_hash = questions_db.upsert_groups(
        job.folder_id,
        job.user_id,
        [
            {
                "normalized_hash": group["normalized_hash"],
                "canonical_text": group["canonical_text"],
                "occurrence_count": group["occurrence_count"],
                "distinct_years": group["distinct_years"],
                "avg_marks": group["avg_marks"],
                "max_marks": group["max_marks"],
                "first_year": group["first_year"],
                "last_year": group["last_year"],
                "year_span": group["year_span"],
                "priority_score": group["priority_score"],
                "priority_level": group["priority_level"],
                "factors": group["factors"],
                "priority_reason": group["priority_reason"],
                "reference_year": group["reference_year"],
                "algo_version": group["algo_version"],
            }
            for group in scored
        ],
    )

    questions_db.link_questions_to_groups(job.user_id, group_id_by_hash, accepted)

    topic_ids = questions_db.upsert_topics(
        job.folder_id,
        job.user_id,
        [
            {
                "name": topic.name,
                "ordinal": topic.ordinal,
                "keywords": topic.keywords,
                "source": topic.source,
            }
            for topic in topics
        ],
    )
    questions_db.assign_group_topics(
        job.user_id,
        {
            group_id_by_hash[digest]: topic_ids.get(topic.name) if topic else None
            for digest, topic in topic_by_hash.items()
            if digest in group_id_by_hash
        },
    )

    questions_db.replace_clusters(
        job.folder_id,
        job.user_id,
        [
            {
                "seed_hash": cluster.seed_hash,
                "members": cluster.members,
                "threshold": cluster.threshold,
                "method": cluster.method,
            }
            for cluster in clustering.clusters
        ],
        group_id_by_hash,
    )

    jobs_db.update_progress(job.id, 90)

    topic_names_by_hash = {
        digest: topic.name if topic else None for digest, topic in topic_by_hash.items()
    }
    counts_by_topic: dict[str, int] = {}
    for digest, topic in topic_by_hash.items():
        if topic:
            counts_by_topic[topic.name] = counts_by_topic.get(topic.name, 0) + 1

    analytics = compute_analytics(
        scored_groups=scored,
        total_papers=len(paper_years),
        total_questions=len(accepted),
        topic_names_by_hash=topic_names_by_hash,
        coverage=coverage_gaps(topics, counts_by_topic),
    )

    questions_db.save_analytics(
        job.folder_id,
        job.user_id,
        fingerprint=fingerprint,
        reference_year=reference_year,
        algo_version=ALGO_VERSION,
        payload=analytics,
    )

    logger.info(
        "Analysed folder %s: %d questions -> %d groups, %d clusters",
        job.folder_id,
        len(accepted),
        len(scored),
        len(clustering.clusters),
    )


# ---------------------------------------------------------------------------
# Loop
# ---------------------------------------------------------------------------

HANDLERS = {"extract": run_extract, "analyze": run_analyze}


def process_job(job: jobs_db.Job) -> None:
    """Run one claimed job and mark it finished.

    Every exception is caught and reported through ``complete_job`` so a failure
    never leaves a job stuck in ``running``. The queue decides whether it retries
    based on the attempt budget.
    """
    handler = HANDLERS.get(job.job_type)
    if handler is None:
        jobs_db.complete_job(job.id, False, f"Unknown job type '{job.job_type}'.")
        return

    try:
        handler(job)
    except Exception as exc:
        logger.error("Job %s (%s) failed: %s", job.id, job.job_type, exc)
        logger.debug(traceback.format_exc())
        jobs_db.complete_job(job.id, False, str(exc)[:2000])
        return

    jobs_db.complete_job(job.id, True)


def run_forever(poll_seconds: float = WORKER_POLL_SECONDS) -> None:
    """Claim and process jobs until interrupted."""
    identity = worker_id()
    logger.info("Worker %s started; polling every %.1fs.", identity, poll_seconds)

    while True:
        try:
            job = jobs_db.claim_next_job(identity)
        except Exception as exc:
            # A database blip must not kill the worker: back off and retry, or a
            # transient network error would need a manual restart.
            logger.error("Could not claim a job: %s", exc)
            time.sleep(poll_seconds)
            continue

        if job is None:
            time.sleep(poll_seconds)
            continue

        logger.info("Claimed %s job %s (attempt %d).", job.job_type, job.id, job.attempts)
        process_job(job)


def _sha256(data: bytes) -> str:
    import hashlib  # noqa: PLC0415

    return hashlib.sha256(data).hexdigest()


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)-8s %(name)s: %(message)s",
    )
    try:
        run_forever()
    except KeyboardInterrupt:
        logger.info("Worker stopped.")
