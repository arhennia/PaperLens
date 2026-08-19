"""Paper and per-page provenance persistence.

Every query is scoped by ``user_id`` as well as by the id it looks up. That is
redundant against a correct ``folder_id``, and deliberately so: this connection
uses the service-role key and bypasses RLS, so the scoping that RLS would have
provided has to be written out. A missing ``user_id`` filter here is a cross-user
data leak rather than a style issue.
"""

from backend.db.client import get_client


def list_papers(folder_id: str, user_id: str) -> list[dict]:
    """Return a folder's papers, oldest first.

    Ordered by ``created_at`` so extraction processes them in upload order, which
    makes progress reporting monotonic and logs readable.
    """
    response = (
        get_client()
        .table("papers")
        .select(
            "id, storage_path, original_filename, year, year_source, "
            "content_hash, page_count, extraction_status"
        )
        .eq("folder_id", folder_id)
        .eq("user_id", user_id)
        .order("created_at")
        .execute()
    )
    return response.data or []


def get_paper(paper_id: str, user_id: str) -> dict | None:
    """Return one paper, or None if it does not exist for this user."""
    response = (
        get_client()
        .table("papers")
        .select("*")
        .eq("id", paper_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    rows = response.data or []
    return rows[0] if rows else None


def update_paper(paper_id: str, user_id: str, **fields) -> None:
    """Update a paper's columns.

    Callers pass only what changed, e.g.
    ``update_paper(id, uid, extraction_status="extracted", page_count=3)``.
    """
    if not fields:
        return

    (
        get_client()
        .table("papers")
        .update(fields)
        .eq("id", paper_id)
        .eq("user_id", user_id)
        .execute()
    )


def mark_paper_failed(paper_id: str, user_id: str, message: str) -> None:
    """Record that a paper could not be extracted.

    The message is stored so the UI can explain what happened instead of showing
    a paper stuck at "extracting" forever. It is truncated because it may contain
    an exception string of unbounded length.
    """
    update_paper(
        paper_id,
        user_id,
        extraction_status="failed",
        error_message=message[:2000],
    )


def replace_paper_pages(paper_id: str, user_id: str, pages: list[dict]) -> None:
    """Replace a paper's per-page provenance rows (D-013).

    Delete-then-insert is safe here, unlike for ``question_groups``: nothing
    references a ``paper_pages`` row by id, so recreating them cannot orphan
    anything. Re-extraction of an unchanged paper produces identical rows.

    Args:
        pages: Dicts with ``page_number``, ``extraction_method``, ``char_count``
            and optionally ``ocr_confidence``.
    """
    client = get_client()

    (
        client.table("paper_pages")
        .delete()
        .eq("paper_id", paper_id)
        .eq("user_id", user_id)
        .execute()
    )

    if not pages:
        return

    client.table("paper_pages").insert(
        [
            {
                "paper_id": paper_id,
                "user_id": user_id,
                "page_number": page["page_number"],
                "extraction_method": page["extraction_method"],
                "char_count": page.get("char_count", 0),
                "ocr_confidence": page.get("ocr_confidence"),
            }
            for page in pages
        ]
    ).execute()


def low_confidence_pages(folder_id: str, user_id: str) -> set[tuple[str, int]]:
    """Return ``(paper_id, page_number)`` for pages a student should verify.

    A page qualifies when OCR failed outright, or succeeded below the confidence
    threshold. Used to flag the questions extracted from those pages (D-013).

    Returns a set rather than a list because callers test membership per question.
    """
    from backend.config import OCR_LOW_CONFIDENCE_THRESHOLD  # noqa: PLC0415

    response = (
        get_client()
        .table("paper_pages")
        .select("paper_id, page_number, extraction_method, ocr_confidence")
        .eq("user_id", user_id)
        .execute()
    )

    paper_ids = {paper["id"] for paper in list_papers(folder_id, user_id)}

    flagged: set[tuple[str, int]] = set()
    for row in response.data or []:
        if row["paper_id"] not in paper_ids:
            continue

        method = row["extraction_method"]
        confidence = row.get("ocr_confidence")

        if method == "ocr_failed":
            flagged.add((row["paper_id"], row["page_number"]))
        elif (
            method == "ocr"
            and confidence is not None
            and float(confidence) < OCR_LOW_CONFIDENCE_THRESHOLD
        ):
            flagged.add((row["paper_id"], row["page_number"]))

    return flagged


def paper_content_hashes(folder_id: str, user_id: str) -> list[str]:
    """Return the content hashes feeding the analytics fingerprint (D-014).

    Only extracted papers count: a queued or failed paper has contributed no
    questions, so including it would invalidate the cache for a paper that
    changes nothing about the result.
    """
    return [
        paper["content_hash"]
        for paper in list_papers(folder_id, user_id)
        if paper.get("content_hash") and paper.get("extraction_status") == "extracted"
    ]
